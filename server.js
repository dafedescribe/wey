// server.js (FULL UPDATED VERSION)
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, delay, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { pool, testConnection } = require('./config/database');
const qrcode = require('qrcode-terminal'); // ADDED
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('🚀 wey server is running!');
});

const startServer = app.listen(PORT, () => {
  console.log(`💻 Server listening on port ${PORT}`);
});

async function connectToWhatsApp() {
  await testConnection();
  console.log('🤖 Initializing WhatsApp Bot...');

  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');

  const sock = makeWASocket({
    version: await fetchLatestBaileysVersion(),
    auth: state,
    printQRInTerminal: false, // CHANGED: Set this to FALSE now
    logger: console,
  });

  // UPDATED QR CODE LISTENER
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('📲 Scan the QR code below to log in:');
      qrcode.generate(qr, { small: true }); // Generates a compact QR code
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('✅ WhatsApp Bot is online and ready!');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async (m) => {
    const message = m.messages[0];
    if (message.key.fromMe || !message.message?.conversation) return;

    const sender = message.key.remoteJid;
    const text = message.message.conversation.toLowerCase().trim();

    console.log(`📩 Received message from ${sender}: "${text}"`);

    if (text.startsWith('/')) {
      console.log('👀 Detected a potential command.');
      await sock.sendMessage(sender, { text: `🤖 Hello! I received your command: "${text}". Phase 1 is working!` });
    }
  });
}

connectToWhatsApp().catch(err => {
  console.error('Fatal error during initialization:', err);
  process.exit(1);
});