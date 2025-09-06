require('dotenv').config()
const { connectToWhatsApp } = require('./bot/connection')
const WebServer = require('./server/webServer') // Adjust path as needed

async function startApplication() {
    console.log('🚀 Starting Application...')
    
    try {
        // Start the web server first
        console.log('🌐 Starting web server...')
        const webServer = new WebServer()
        await webServer.start()
        
        // Then start the WhatsApp bot
        console.log('🤖 Starting WhatsApp Bot...')
        await connectToWhatsApp()
        
        console.log('✅ Both web server and WhatsApp bot started successfully!')
        
        // Handle graceful shutdown
        process.on('SIGTERM', () => {
            console.log('🛑 Shutting down gracefully...')
            webServer.stop()
            process.exit(0)
        })
        
        process.on('SIGINT', () => {
            console.log('🛑 Shutting down gracefully...')
            webServer.stop()
            process.exit(0)
        })
        
    } catch (error) {
        console.error('❌ Failed to start application:', error)
        process.exit(1)
    }
}

startApplication()