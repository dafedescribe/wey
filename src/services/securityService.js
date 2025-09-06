const { supabase } = require('../config/database')

class SecurityService {
    // Malicious domains/patterns to block
    static BLOCKED_DOMAINS = [
        // Malware/phishing domains (examples)
        'bit.ly/malware',
        'tinyurl.com/virus',
        // URL shorteners that could hide malicious links
        'adf.ly', 'ow.ly', 'bit.do', 'short.link',
        // Common scam patterns
        'free-money', 'click-here-now', 'urgent-action',
        // Adult content domains
        'pornhub.com', 'xvideos.com', 'xnxx.com',
        // Suspicious TLDs
        '.tk', '.ml', '.ga', '.cf'
    ]

    // Suspicious URL patterns
    static SUSPICIOUS_PATTERNS = [
        // IP addresses instead of domains
        /^https?:\/\/\d+\.\d+\.\d+\.\d+/,
        // Suspicious keywords
        /phishing|malware|virus|scam|hack|exploit/i,
        // URL shorteners (to prevent double shortening)
        /bit\.ly|tinyurl|t\.co|goo\.gl|short\.link/i,
        // Suspicious file extensions
        /\.(exe|bat|scr|com|pif|cmd|vbs|jar)(\?|$)/i,
        // Base64 encoded URLs
        /data:|javascript:|vbscript:/i
    ]

    // Rate limiting storage (in production, use Redis)
    static rateLimitStore = new Map()

    // Check if URL is safe
    static async isUrlSafe(url, phoneNumber) {
        try {
            console.log(`🔒 Security check for: ${url}`)
            
            // 1. Check rate limiting
            if (!this.checkRateLimit(phoneNumber)) {
                console.log('❌ Rate limit exceeded')
                return { 
                    safe: false, 
                    reason: 'rate_limit',
                    message: '⚠️ Too many links created. Please wait before creating more.' 
                }
            }

            // 2. Check blocked domains
            const domainCheck = this.checkBlockedDomains(url)
            if (!domainCheck.safe) return domainCheck

            // 3. Check suspicious patterns
            const patternCheck = this.checkSuspiciousPatterns(url)
            if (!patternCheck.safe) return patternCheck

            // 4. Check URL length (prevent extremely long URLs)
            if (url.length > 2000) {
                return { 
                    safe: false, 
                    reason: 'url_too_long',
                    message: '❌ URL is too long. Maximum 2000 characters allowed.' 
                }
            }

            // 5. Check if URL actually exists (optional)
            const existsCheck = await this.checkUrlExists(url)
            if (!existsCheck.safe) return existsCheck

            console.log('✅ URL passed security checks')
            return { safe: true }

        } catch (error) {
            console.error('❌ Security check failed:', error)
            return { 
                safe: false, 
                reason: 'security_error',
                message: '❌ Security check failed. Please try again.' 
            }
        }
    }

    // Rate limiting: max 10 links per hour per user
    static checkRateLimit(phoneNumber) {
        const now = Date.now()
        const hourAgo = now - (60 * 60 * 1000) // 1 hour
        
        if (!this.rateLimitStore.has(phoneNumber)) {
            this.rateLimitStore.set(phoneNumber, [])
        }

        const userRequests = this.rateLimitStore.get(phoneNumber)
        
        // Remove old requests
        const recentRequests = userRequests.filter(time => time > hourAgo)
        this.rateLimitStore.set(phoneNumber, recentRequests)

        // Check limit
        if (recentRequests.length >= 10) {
            return false
        }

        // Add current request
        recentRequests.push(now)
        this.rateLimitStore.set(phoneNumber, recentRequests)
        
        return true
    }

    // Check against blocked domains
    static checkBlockedDomains(url) {
        const lowerUrl = url.toLowerCase()
        
        for (const domain of this.BLOCKED_DOMAINS) {
            if (lowerUrl.includes(domain.toLowerCase())) {
                console.log(`🚫 Blocked domain detected: ${domain}`)
                return { 
                    safe: false, 
                    reason: 'blocked_domain',
                    message: '🚫 This domain is not allowed for security reasons.' 
                }
            }
        }
        
        return { safe: true }
    }

    // Check suspicious patterns
    static checkSuspiciousPatterns(url) {
        for (const pattern of this.SUSPICIOUS_PATTERNS) {
            if (pattern.test(url)) {
                console.log(`⚠️ Suspicious pattern detected: ${pattern}`)
                return { 
                    safe: false, 
                    reason: 'suspicious_pattern',
                    message: '⚠️ This URL contains suspicious patterns and cannot be shortened.' 
                }
            }
        }
        
        return { safe: true }
    }

    // Check if URL exists and is accessible
    static async checkUrlExists(url) {
        try {
            // Simple HEAD request to check if URL is reachable
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal,
                headers: {
                    'User-Agent': 'WhatsApp-Link-Checker/1.0'
                }
            })

            clearTimeout(timeoutId)

            if (!response.ok && response.status === 404) {
                return { 
                    safe: false, 
                    reason: 'url_not_found',
                    message: '❌ URL appears to be broken or not accessible.' 
                }
            }

            return { safe: true }

        } catch (error) {
            console.log('⚠️ URL existence check failed:', error.message)
            // Don't block URL if check fails, just warn
            return { safe: true, warning: 'Could not verify URL accessibility' }
        }
    }

    // Log security events
    static async logSecurityEvent(phoneNumber, url, reason, action) {
        try {
            // You could create a security_logs table for this
            console.log(`🔒 Security Event: ${phoneNumber} | ${reason} | ${action} | ${url}`)
            
            // Optional: Store in database
            /*
            await supabase.from('security_logs').insert([{
                phone_number: phoneNumber,
                url: url,
                reason: reason,
                action: action,
                created_at: new Date().toISOString()
            }])
            */
        } catch (error) {
            console.error('Failed to log security event:', error)
        }
    }

    // Check if user is trusted (has history of safe links)
    static async isUserTrusted(phoneNumber) {
        try {
            const { data: user } = await supabase
                .from('users')
                .select('total_links_created, created_at')
                .eq('phone_number', phoneNumber)
                .single()

            if (!user) return false

            // Trust users with 5+ successful links and account older than 24 hours
            const accountAge = Date.now() - new Date(user.created_at).getTime()
            const oneDayMs = 24 * 60 * 60 * 1000

            return user.total_links_created >= 5 && accountAge > oneDayMs

        } catch (error) {
            return false
        }
    }

    // Additional validation for shortened links
    static validateShortCode(shortCode) {
        // Only allow alphanumeric codes
        return /^[a-zA-Z0-9]{6}$/.test(shortCode)
    }

    // Prevent abuse by limiting redirects
    static async checkRedirectAbuse(linkId) {
        try {
            const { data: clicks } = await supabase
                .from('link_clicks')
                .select('clicked_at')
                .eq('link_id', linkId)
                .gte('clicked_at', new Date(Date.now() - 60000).toISOString()) // Last minute

            // Flag if more than 100 clicks per minute (possible bot)
            if (clicks && clicks.length > 100) {
                console.log('🚨 Potential click abuse detected')
                return false
            }

            return true
        } catch (error) {
            console.error('Error checking redirect abuse:', error)
            return true // Allow on error
        }
    }
}

module.exports = SecurityService