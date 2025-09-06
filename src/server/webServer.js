const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const LinkService = require('../services/linkService')
const SecurityService = require('../services/securityService')

class WebServer {
    constructor() {
        this.app = express()
        this.setupMiddleware()
        this.setupRoutes()
    }

    setupMiddleware() {
        // Security middleware
        this.app.use(helmet())
        this.app.use(cors())
        
        // Rate limiting
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100 // limit each IP to 100 requests per windowMs
        })
        this.app.use(limiter)

        // Body parsing
        this.app.use(express.json())
        this.app.use(express.urlencoded({ extended: true }))
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ status: 'OK', timestamp: new Date().toISOString() })
        })

        // Redirect route - handles short URL clicks
        this.app.get('/:shortCode', async (req, res) => {
            try {
                const { shortCode } = req.params
                const link = await LinkService.getLinkByShortCode(shortCode)

                if (!link) {
                    return res.status(404).send(`
                        <html>
                            <head><title>Link Not Found</title></head>
                            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                                <h1>🔍 Link Not Found</h1>
                                <p>The short link you clicked doesn't exist or has expired.</p>
                                <a href="https://wa.me/YOUR_BOT_NUMBER" style="color: #25D366;">Create a short link with our WhatsApp bot</a>
                            </body>
                        </html>
                    `)
                }

                // Track the click
                const clientIP = req.ip || req.connection.remoteAddress
                const userAgent = req.get('User-Agent') || ''
                const referrer = req.get('Referer')

                await LinkService.trackClick(link.id, clientIP, userAgent, referrer)

                // Redirect to original URL
                res.redirect(302, link.original_url)
            } catch (error) {
                console.error('❌ Redirect error:', error)
                res.status(500).send('Internal Server Error')
            }
        })

        // API route to get link statistics
        this.app.get('/api/stats/:shortCode', async (req, res) => {
            try {
                const { shortCode } = req.params
                const stats = await LinkService.getLinkStats(shortCode)

                if (!stats) {
                    return res.status(404).json({ error: 'Link not found' })
                }

                // Don't expose sensitive data
                const publicStats = {
                    shortCode: stats.short_code,
                    shortUrl: stats.short_url,
                    totalClicks: stats.total_clicks,
                    uniqueClicks: stats.unique_clicks,
                    todayClicks: stats.todayClicks,
                    createdAt: stats.created_at,
                    deviceBreakdown: stats.deviceBreakdown,
                    browserBreakdown: stats.browserBreakdown
                }

                res.json(publicStats)
            } catch (error) {
                console.error('❌ Stats API error:', error)
                res.status(500).json({ error: 'Internal Server Error' })
            }
        })

        // Preview route (optional - shows link info without redirecting)
        this.app.get('/preview/:shortCode', async (req, res) => {
            try {
                const { shortCode } = req.params
                const link = await LinkService.getLinkByShortCode(shortCode)

                if (!link) {
                    return res.status(404).send('Link not found')
                }

                res.send(`
                    <html>
                        <head>
                            <title>Link Preview</title>
                            <style>
                                body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
                                .card { border: 1px solid #ddd; border-radius: 8px; padding: 20px; background: #f9f9f9; }
                                .stats { display: flex; gap: 20px; margin: 20px 0; }
                                .stat { text-align: center; }
                                .continue-btn { background: #25D366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
                                .original-url { word-break: break-all; color: #666; }
                            </style>
                        </head>
                        <body>
                            <div class="card">
                                <h1>🔗 Link Preview</h1>
                                <p><strong>Short URL:</strong> ${link.short_url}</p>
                                <p><strong>Original URL:</strong> <span class="original-url">${link.original_url}</span></p>
                                
                                <div class="stats">
                                    <div class="stat">
                                        <h3>${link.total_clicks}</h3>
                                        <p>Total Clicks</p>
                                    </div>
                                    <div class="stat">
                                        <h3>${link.unique_clicks}</h3>
                                        <p>Unique Clicks</p>
                                    </div>
                                </div>
                                
                                <p>
                                    <a href="/${shortCode}" class="continue-btn">Continue to Original Link</a>
                                </p>
                                
                                <p><small>Created: ${new Date(link.created_at).toLocaleDateString()}</small></p>
                            </div>
                        </body>
                    </html>
                `)
            } catch (error) {
                console.error('❌ Preview error:', error)
                res.status(500).send('Internal Server Error')
            }
        })
    }

    start(port = process.env.PORT || 3000) {
        // Bind to 0.0.0.0 for cloud deployments like Render
        const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost'
        
        this.server = this.app.listen(port, host, () => {
            console.log(`🌐 Web server running on ${host}:${port}`)
            console.log(`🔗 Ready to handle short link redirects`)
            console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`)
        })
        
        return this.server
    }

    stop() {
        if (this.server) {
            this.server.close()
            console.log('🛑 Web server stopped')
        }
    }
}

module.exports = WebServer