const LinkService = require('../services/linkService')
const urlRegex = require('url-regex')

function handleMessage(sock) {
    return async (m) => {
        const msg = m.messages[0]
        
        // Skip if no message, status broadcast, or from ourselves
        if (!msg?.message || 
            msg.key.remoteJid === 'status@broadcast' || 
            msg.key.fromMe) return

        // Only process new messages (not old ones)
        if (m.type !== 'notify') return

        const text = msg.message?.conversation || 
                    msg.message?.extendedTextMessage?.text || ''
        
        const jid = msg.key.remoteJid
        const phoneNumber = jid.split('@')[0].replace(/\D/g, '')
        const username = msg.pushName || null
        
        console.log(`📨 From: ${phoneNumber} (${username})`)
        console.log(`📝 Message: ${text}`)

        try {
            // Check if message contains a URL
            const urls = text.match(urlRegex())
            
            if (urls && urls.length > 0) {
                const originalUrl = urls[0]
                console.log(`🔗 URL detected: ${originalUrl}`)
                
                // Shorten the URL
                const shortenedLink = await LinkService.shortenUrl(
                    originalUrl, 
                    phoneNumber, 
                    username, 
                    username
                )
                
                if (shortenedLink) {
                    const response = `✅ *Link Shortened Successfully!*

🔗 *Short URL:* ${shortenedLink.short_url}
📋 *Original:* ${originalUrl}
📊 *Code:* ${shortenedLink.short_code}

*Features:*
• 📈 Click tracking enabled
• 📱 Device & browser analytics
• 🔄 Real-time statistics

*Commands:*
• Send */stats ${shortenedLink.short_code}* for detailed analytics
• Send */mylinks* to see all your links
• Send */help* for more commands`

                    await sock.sendMessage(jid, { text: response })
                } else {
                    await sock.sendMessage(jid, { 
                        text: '❌ Sorry, I couldn\'t shorten that URL. Please make sure it\'s a valid link.' 
                    })
                }
                
                return // Don't process other commands if URL was found
            }

            // Command handling
            const command = text.toLowerCase().trim()
            
            if (command.startsWith('/stats ')) {
                const shortCode = command.replace('/stats ', '').trim()
                const stats = await LinkService.getLinkStats(shortCode)
                
                if (!stats) {
                    await sock.sendMessage(jid, { 
                        text: '❌ Link not found. Please check the code and try again.' 
                    })
                    return
                }
                
                const deviceStats = Object.entries(stats.deviceBreakdown)
                    .map(([device, count]) => `${device}: ${count}`)
                    .join(' | ')
                
                const browserStats = Object.entries(stats.browserBreakdown)
                    .map(([browser, count]) => `${browser}: ${count}`)
                    .slice(0, 3)
                    .join(' | ')
                
                const response = `📊 *Link Analytics*

🔗 *Short URL:* ${stats.short_url}
📈 *Total Clicks:* ${stats.total_clicks}
👥 *Unique Clicks:* ${stats.unique_clicks}
📅 *Today's Clicks:* ${stats.todayClicks}

*Device Breakdown:*
${deviceStats || 'No clicks yet'}

*Top Browsers:*
${browserStats || 'No clicks yet'}

*Created:* ${new Date(stats.created_at).toLocaleDateString()}

View detailed stats: ${process.env.SHORT_DOMAIN || 'http://localhost:3000'}/api/stats/${shortCode}`

                await sock.sendMessage(jid, { text: response })
            }
            
            else if (command === '/mylinks') {
                const userData = await LinkService.getUserLinks(phoneNumber)
                
                if (!userData || !userData.shortened_links.length) {
                    await sock.sendMessage(jid, { 
                        text: '📝 You haven\'t created any short links yet. Send me a URL to get started!' 
                    })
                    return
                }
                
                const links = userData.shortened_links
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                    .slice(0, 5)
                    .map((link, index) => 
                        `${index + 1}. ${link.short_url}\n   📊 ${link.total_clicks} clicks | Created: ${new Date(link.created_at).toLocaleDateString()}`
                    )
                    .join('\n\n')
                
                const response = `🔗 *Your Recent Short Links*

${links}

*Total Links Created:* ${userData.total_links_created}

_Showing latest 5 links. Send /stats [code] for detailed analytics._`

                await sock.sendMessage(jid, { text: response })
            }
            
            else if (command === '/help') {
                const response = `🤖 *WhatsApp Link Shortener Bot*

*How to use:*
📎 Send any URL and I'll shorten it automatically

*Commands:*
• */stats [code]* - Get detailed analytics
• */mylinks* - View your recent links  
• */help* - Show this help message

*Features:*
• 🔗 Instant URL shortening
• 📊 Click tracking & analytics
• 📱 Device & browser detection
• 👥 Unique visitor counting
• 📈 Real-time statistics

*Example:*
Just send: https://example.com/very-long-url
Get: ${process.env.SHORT_DOMAIN || 'http://localhost:3000'}/abc123

_Made with ❤️ for easy link sharing_`

                await sock.sendMessage(jid, { text: response })
            }
            
            // Welcome message for first-time users or simple greetings
            else if (command.includes('hi') || command.includes('hello') || command.includes('start')) {
                const response = `👋 *Welcome to Link Shortener Bot!*

I help you create short, trackable links from long URLs.

*Quick Start:*
📎 Just send me any URL and I'll shorten it instantly!

*Example:*
Send: https://example.com/very-long-url
Get: Short link with click tracking

Send */help* to see all available commands.`

                await sock.sendMessage(jid, { text: response })
            }
            
        } catch (error) {
            console.error('❌ Error processing message:', error)
            await sock.sendMessage(jid, { 
                text: '❌ Sorry, something went wrong. Please try again or contact support.' 
            })
        }
    }
}

module.exports = { handleMessage }

module.exports = { handleMessage }