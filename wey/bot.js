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
        printQRInTerminal: false, // Disable built-in QR as it's not working well
        browser: Browsers.macOS('Desktop')
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Generate QR code as base64 when available
        if (qr) {
            console.log('\n\n=== WHATSAPP QR CODE ===');
            console.log('Generating QR code as base64...');
            
            try {
                // Generate QR code as base64 string
                const qrBase64 = await QRCode.toDataURL(qr);
                
                // Extract just the base64 data (remove data:image/png;base64, prefix)
                const base64Data = qrBase64.replace(/^data:image\/png;base64,/, '');
                
                console.log('\n=== COPY THE TEXT BELOW TO GENERATE QR CODE ===');
                console.log('1. Copy ALL the text between the lines below');
                console.log('2. Go to: https://base64.guru/converter/decode/image');
                console.log('3. Paste the text and download the image');
                console.log('4. Scan the image with WhatsApp\n');
                
                console.log('=== START BASE64 QR CODE ===');
                
                // Split into manageable chunks for logging (80 characters per line)
                const chunkSize = 80;
                for (let i = 0; i < base64Data.length; i += chunkSize) {
                    const chunk = base64Data.substring(i, i + chunkSize);
                    console.log(chunk);
                }
                
                console.log('=== END BASE64 QR CODE ===');
                console.log('\n=== ALTERNATIVE METHOD ===');
                console.log('If the above doesn\'t work, try this online tool:');
                console.log('https://codebeautify.org/base64-to-image-converter');
                console.log('==================================================\n');
                
            } catch (err) {
                console.log('Error generating QR code:', err);
                // Fallback to terminal QR if base64 fails
                console.log('Falling back to terminal QR code:');
                const qrTerminal = require('qrcode-terminal');
                qrTerminal.generate(qr, { small: true });
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

// Handle the QR code package dependency
function startBot() {
    try {
        // Check if qrcode package is available
        require.resolve('qrcode');
        console.log('QRCode package found. Starting bot...');
        connectToWhatsApp().catch(err => console.log("Unexpected error: ", err));
    } catch (e) {
        console.log('QRCode package not found. Please run: npm install qrcode');
        console.log('Then restart the bot.');
        process.exit(1);
    }
}

startBot();