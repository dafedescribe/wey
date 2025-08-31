const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');

// Use /tmp for auth storage on Render
const authPath = '/tmp/auth_info';

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: Browsers.macOS('Desktop')
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
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

connectToWhatsApp().catch(err => console.log("Unexpected error: ", err));