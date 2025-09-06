require('dotenv').config()
const { connectToWhatsApp } = require('./bot/connection')

async function startBot() {
    console.log('🤖 Starting WhatsApp Bot...')
    try {
        await connectToWhatsApp()
    } catch (error) {
        console.error('❌ Failed to start bot:', error)
        process.exit(1)
    }
}

startBot()