const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

// Use /tmp for auth storage on Render
const authPath = '/tmp/auth_info';

// Ensure the auth directory exists
if (!fs.existsSync(authPath)) {
    fs.mkdirSync(authPath, { recursive: true });
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: Browsers.macOS('Desktop')
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Generate QR code as base64 when available
        if (qr) {
            console.log('QR code received. Generating base64 string...');
            try {
                // Generate QR code as base64 string
                const qrBase64 = await QRCode.toDataURL(qr);
                
                // Output in a format that's easy to copy from logs
                console.log('\n\n=== QR CODE BASE64 - COPY EVERYTHING BETWEEN THESE LINES ===');
                
                // Split into manageable chunks for logging
                const base64Data = qrBase64.replace(/^data:image\/png;base64,/, '');
                const chunkSize = 100;
                
                for (let i = 0; i < base64Data.length; i += chunkSize) {
                    console.log(base64Data.substring(i, i + chunkSize));
                }
                
                console.log('=== END QR CODE BASE64 ===');
                console.log('\nInstructions:');
                console.log('1. Copy ALL text between the lines above');
                console.log('2. Go to https://base64.guru/converter/decode/image');
                console.log('3. Paste the copied text into the input field');
                console.log('4. Download the image and scan it with WhatsApp');
                console.log('5. Or use any other base64 to image converter\n');
                
            } catch (err) {
                console.log('Error generating QR code:', err);
            }
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('WhatsApp bot is connected and ready!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const message = m.messages[0];
        if (!message.key.fromMe && m.type === 'notify') {
            const messageText = message.message?.conversation || 
                               message.message?.extendedTextMessage?.text || 
                               '';
            
            console.log('Received message:', messageText);
            
            if (messageText.toLowerCase() === 'hi') {
                await sock.sendMessage(message.key.remoteJid, { 
                    text: "Hey! How can I help you?" 
                });
                console.log('Responded to hi message');
            }
        }
    });
}

// Install missing dependency and start
function startBot() {
    // Check if qrcode package is installed, if not install it
    try {
        require.resolve('qrcode');
        console.log('QRCode package found. Starting bot...');
        connectToWhatsApp().catch(err => console.log("Unexpected error: ", err));
    } catch (e) {
        console.log('QRCode package not found. Installing...');
        const { execSync } = require('child_process');
        try {
            execSync('npm install qrcode', { stdio: 'inherit' });
            console.log('QRCode package installed. Restarting...');
            // Restart the bot
            connectToWhatsApp().catch(err => console.log("Unexpected error: ", err));
        } catch (installError) {
            console.log('Failed to install QRCode package:', installError);
        }
    }
}

startBot();