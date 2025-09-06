const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const LinkService = require('../services/linkService')
const SecurityService = require('../services/securityService')

class WebServer {
    constructor() {
        this.app = express()
        
        // Test LinkService import
        try {
            console.log('🧪 Testing LinkService import...')
            console.log('LinkService methods:', Object.getOwnPropertyNames(LinkService))
            console.log('✅ LinkService imported successfully')
        } catch (error) {
            console.error('❌ LinkService import failed:', error.message)
        }
        
        this.setupMiddleware()
        this.setupRoutes()
    }

    setupMiddleware() {
        // Security middleware
        this.app.use(helmet())
        this.app.use(cors())
        
        // Trust proxy for proper IP detection
        this.app.set('trust proxy', true)
        
        // Rate limiting
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100 // limit each IP to 100 requests per windowMs
        })
        this.app.use(limiter)

        // Body parsing
        this.app.use(express.json())
        this.app.use(express.urlencoded({ extended: true }))

        // Debug middleware to log all requests
        this.app.use((req, res, next) => {
            console.log(`📥 ${req.method} ${req.url} - IP: ${req.ip}`)
            console.log(`📋 Headers:`, req.headers)
            next()
        })
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            console.log('🏥 Health check requested')
            res.json({ status: 'OK', timestamp: new Date().toISOString() })
        })

        // Redirect route - handles short URL clicks
        this.app.get('/:shortCode', async (req, res) => {
            const { shortCode } = req.params
            console.log(`🔍 Redirect requested for shortCode: ${shortCode}`)
            
            try {
                // Check if LinkService exists and has the method
                if (!LinkService || typeof LinkService.getLinkByShortCode !== 'function') {
                    console.error('❌ LinkService.getLinkByShortCode is not available')
                    return res.status(500).send('Service unavailable')
                }

                console.log('🔄 Looking up link in database...')
                const link = await LinkService.getLinkByShortCode(shortCode)
                console.log('📊 Database result:', link ? 'Found' : 'Not found')
                
                if (link) {
                    console.log('🔗 Link details:', {
                        id: link.id,
                        original_url: link.original_url,
                        short_code: link.short_code
                    })
                }

                if (!link) {
                    console.log('❌ Link not found, showing 404 page')
                    return res.status(404).send(`
                        <html>
                            <head><title>Link Not Found</title></head>
                            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                                <h1>🔍 Link Not Found</h1>
                                <p>The short link "${shortCode}" doesn't exist or has expired.</p>
                                <a href="https://wa.me/YOUR_BOT_NUMBER" style="color: #25D366;">Create a short link with our WhatsApp bot</a>
                                <hr>
                                <p><small>Debug: Searched for "${shortCode}"</small></p>
                            </body>
                        </html>
                    `)
                }

                // Validate the original URL
                if (!link.original_url) {
                    console.error('❌ Link has no original_url')
                    return res.status(500).send('Invalid link data')
                }

                // Clean and validate the URL
                let redirectUrl = link.original_url.trim()
                
                // Ensure URL has protocol - be more careful about this
                if (!redirectUrl.match(/^https?:\/\//i)) {
                    redirectUrl = 'https://' + redirectUrl
                    console.log(`🔧 Added https:// to URL: ${redirectUrl}`)
                }

                // Validate the final URL format
                try {
                    new URL(redirectUrl) // This will throw if invalid
                    console.log(`🎯 Validated redirect URL: ${redirectUrl}`)
                } catch (urlError) {
                    console.error('❌ Invalid URL format:', redirectUrl)
                    return res.status(400).send('Invalid URL format in database')
                }

                // Track the click BEFORE redirect (important!)
                try {
                    const clientIP = req.ip || req.connection.remoteAddress || 'unknown'
                    const userAgent = req.get('User-Agent') || 'unknown'
                    const referrer = req.get('Referer') || null

                    console.log('📊 Tracking click:', { clientIP, userAgent: userAgent.substring(0, 50) + '...' })
                    
                    if (LinkService.trackClick && typeof LinkService.trackClick === 'function') {
                        await LinkService.trackClick(link.id, clientIP, userAgent, referrer)
                        console.log('✅ Click tracked successfully')
                    } else {
                        console.log('⚠️ LinkService.trackClick not available')
                    }
                } catch (trackError) {
                    console.error('⚠️ Click tracking failed:', trackError.message)
                    // Continue with redirect even if tracking fails
                }

                // Perform the redirect with proper headers
                console.log(`🚀 Executing redirect to: ${redirectUrl}`)
                
                // Set proper headers for redirect
                res.writeHead(302, {
                    'Location': redirectUrl,
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                })
                res.end()
                
                console.log('✅ Manual redirect sent with headers')

            } catch (error) {
                console.error('❌ Redirect error:', error)
                console.error('📊 Error details:', {
                    message: error.message,
                    stack: error.stack?.split('\n').slice(0, 5)
                })
                res.status(500).send(`
                    <html>
                        <head><title>Server Error</title></head>
                        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                            <h1>❌ Server Error</h1>
                            <p>Something went wrong while processing your request.</p>
                            <p><small>Error: ${error.message}</small></p>
                        </body>
                    </html>
                `)
            }
        })

        // API route to get link statistics
        this.app.get('/api/stats/:shortCode', async (req, res) => {
            try {
                const { shortCode } = req.params
                console.log(`📊 Stats requested for: ${shortCode}`)
                
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
                console.log(`👀 Preview requested for: ${shortCode}`)
                
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
                                .debug { background: #f0f0f0; padding: 10px; font-size: 12px; margin-top: 20px; }
                            </style>
                        </head>
                        <body>
                            <div class="card">
                                <h1>🔗 Link Preview</h1>
                                <p><strong>Short URL:</strong> ${link.short_url}</p>
                                <p><strong>Original URL:</strong> <span class="original-url">${link.original_url}</span></p>
                                
                                <div class="stats">
                                    <div class="stat">
                                        <h3>${link.total_clicks || 0}</h3>
                                        <p>Total Clicks</p>
                                    </div>
                                    <div class="stat">
                                        <h3>${link.unique_clicks || 0}</h3>
                                        <p>Unique Clicks</p>
                                    </div>
                                </div>
                                
                                <p>
                                    <a href="/${shortCode}" class="continue-btn">Continue to Original Link</a>
                                </p>
                                
                                <p><small>Created: ${new Date(link.created_at).toLocaleDateString()}</small></p>
                                
                                <div class="debug">
                                    <strong>Debug Info:</strong><br>
                                    Short Code: ${shortCode}<br>
                                    Link ID: ${link.id}<br>
                                    Has Original URL: ${!!link.original_url}
                                </div>
                            </div>
                        </body>
                    </html>
                `)
            } catch (error) {
                console.error('❌ Preview error:', error)
                res.status(500).send('Internal Server Error')
            }
        })

        // Catch-all route for debugging
        this.app.get('*', (req, res) => {
            console.log(`❓ Unmatched route: ${req.url}`)
            res.status(404).send(`
                <html>
                    <head><title>Route Not Found</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h1>❓ Route Not Found</h1>
                        <p>The route "${req.url}" was not found.</p>
                        <p><small>Available routes: /:shortCode, /api/stats/:shortCode, /preview/:shortCode, /health</small></p>
                    </body>
                </html>
            `)
        })
    }

    start(port = process.env.PORT || 3000) {
        const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost'
        
        this.server = this.app.listen(port, host, () => {
            console.log(`🌐 Web server running on ${host}:${port}`)
            console.log(`🔗 Ready to handle short link redirects`)
            console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`)
            console.log(`🛠️  Debug mode enabled - check logs for detailed info`)
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