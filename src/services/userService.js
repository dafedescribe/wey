const { supabase } = require('../config/database')
const crypto = require('crypto')
const urlRegex = require('url-regex')

class LinkService {
    // Generate unique short code
    static generateShortCode() {
        return crypto.randomBytes(3).toString('base64url').slice(0, 6)
    }

    // Validate URL
    static isValidUrl(string) {
        return urlRegex({exact: true}).test(string)
    }

    // Extract domain from URL
    static extractDomain(url) {
        try {
            return new URL(url).hostname
        } catch {
            return null
        }
    }

    // Create or get user
    static async createOrGetUser(phoneNumber, username = null, displayName = null) {
        try {
            // Check if user exists
            const { data: existingUser } = await supabase
                .from('users')
                .select('*')
                .eq('phone_number', phoneNumber)
                .single()

            if (existingUser) {
                return existingUser
            }

            // Create new user
            const { data: newUser, error } = await supabase
                .from('users')
                .insert([{
                    phone_number: phoneNumber,
                    username: username,
                    display_name: displayName
                }])
                .select()
                .single()

            if (error) throw error
            console.log(`👤 New user created: ${phoneNumber}`)
            return newUser
        } catch (error) {
            console.error('❌ Error creating user:', error.message)
            return null
        }
    }

    // Shorten URL with security checks
    static async shortenUrl(originalUrl, phoneNumber, username = null, displayName = null) {
        try {
            // Security check first
            const securityCheck = await SecurityService.isUrlSafe(originalUrl, phoneNumber)
            if (!securityCheck.safe) {
                await SecurityService.logSecurityEvent(phoneNumber, originalUrl, securityCheck.reason, 'blocked')
                throw new Error(securityCheck.message)
            }

            // Validate URL
            if (!this.isValidUrl(originalUrl)) {
                throw new Error('Invalid URL format')
            }

            // Get or create user
            const user = await this.createOrGetUser(phoneNumber, username, displayName)
            if (!user) throw new Error('Failed to create user')

            // Generate unique short code
            let shortCode
            let isUnique = false
            let attempts = 0

            while (!isUnique && attempts < 10) {
                shortCode = this.generateShortCode()
                
                // Validate short code format
                if (!SecurityService.validateShortCode(shortCode)) {
                    attempts++
                    continue
                }
                
                const { data: existing } = await supabase
                    .from('shortened_links')
                    .select('id')
                    .eq('short_code', shortCode)
                    .single()

                if (!existing) isUnique = true
                attempts++
            }

            if (!isUnique) throw new Error('Failed to generate unique short code')

            // Create shortened link
            const shortUrl = `${process.env.SHORT_DOMAIN || 'http://localhost:3000'}/${shortCode}`
            const domain = this.extractDomain(originalUrl)

            const { data: link, error } = await supabase
                .from('shortened_links')
                .insert([{
                    user_id: user.id,
                    original_url: originalUrl,
                    short_code: shortCode,
                    short_url: shortUrl,
                    domain: domain
                }])
                .select()
                .single()

            if (error) throw error

            // Update user's link count
            await supabase
                .from('users')
                .update({ 
                    total_links_created: user.total_links_created + 1,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id)

            // Log successful creation
            await SecurityService.logSecurityEvent(phoneNumber, originalUrl, 'link_created', 'allowed')
            
            console.log(`🔗 Link shortened: ${originalUrl} -> ${shortUrl}`)
            return link
        } catch (error) {
            console.error('❌ Error shortening URL:', error.message)
            throw error
        }
    }

    // Get link by short code
    static async getLinkByShortCode(shortCode) {
        try {
            const { data, error } = await supabase
                .from('shortened_links')
                .select(`
                    *,
                    users (
                        phone_number,
                        username,
                        display_name
                    )
                `)
                .eq('short_code', shortCode)
                .eq('is_active', true)
                .single()

            if (error && error.code !== 'PGRST116') throw error
            return data
        } catch (error) {
            console.error('❌ Error getting link:', error.message)
            return null
        }
    }

    // Track click
    static async trackClick(linkId, ipAddress, userAgent, referrer = null) {
        try {
            // Check if this IP has clicked this link before (for unique tracking)
            const { data: existingClick } = await supabase
                .from('link_clicks')
                .select('id')
                .eq('link_id', linkId)
                .eq('ip_address', ipAddress)
                .single()

            const isUnique = !existingClick

            // Parse user agent for device info
            const deviceType = this.parseDeviceType(userAgent)
            const browser = this.parseBrowser(userAgent)

            // Insert click record
            const { error: clickError } = await supabase
                .from('link_clicks')
                .insert([{
                    link_id: linkId,
                    ip_address: ipAddress,
                    user_agent: userAgent,
                    referrer: referrer,
                    device_type: deviceType,
                    browser: browser,
                    is_unique: isUnique
                }])

            if (clickError) throw clickError

            // Update link statistics
            const updateData = { total_clicks: supabase.raw('total_clicks + 1') }
            if (isUnique) {
                updateData.unique_clicks = supabase.raw('unique_clicks + 1')
            }

            const { error: updateError } = await supabase
                .from('shortened_links')
                .update(updateData)
                .eq('id', linkId)

            if (updateError) throw updateError

            console.log(`📊 Click tracked for link ${linkId} (unique: ${isUnique})`)
            return { success: true, isUnique }
        } catch (error) {
            console.error('❌ Error tracking click:', error.message)
            return { success: false, isUnique: false }
        }
    }

    // Simple device type detection
    static parseDeviceType(userAgent) {
        const ua = userAgent.toLowerCase()
        if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
            return 'mobile'
        } else if (ua.includes('tablet') || ua.includes('ipad')) {
            return 'tablet'
        }
        return 'desktop'
    }

    // Simple browser detection
    static parseBrowser(userAgent) {
        const ua = userAgent.toLowerCase()
        if (ua.includes('chrome')) return 'Chrome'
        if (ua.includes('firefox')) return 'Firefox'
        if (ua.includes('safari')) return 'Safari'
        if (ua.includes('edge')) return 'Edge'
        return 'Unknown'
    }

    // Get user's links
    static async getUserLinks(phoneNumber) {
        try {
            const { data, error } = await supabase
                .from('users')
                .select(`
                    *,
                    shortened_links (
                        id,
                        original_url,
                        short_url,
                        total_clicks,
                        unique_clicks,
                        created_at
                    )
                `)
                .eq('phone_number', phoneNumber)
                .single()

            if (error && error.code !== 'PGRST116') throw error
            return data
        } catch (error) {
            console.error('❌ Error getting user links:', error.message)
            return null
        }
    }

    // Get link statistics
    static async getLinkStats(shortCode) {
        try {
            const { data: link } = await supabase
                .from('shortened_links')
                .select(`
                    *,
                    link_clicks (
                        clicked_at,
                        device_type,
                        browser,
                        is_unique
                    )
                `)
                .eq('short_code', shortCode)
                .single()

            if (!link) return null

            // Process click data
            const clicks = link.link_clicks || []
            const today = new Date()
            const todayClicks = clicks.filter(click => {
                const clickDate = new Date(click.clicked_at)
                return clickDate.toDateString() === today.toDateString()
            })

            return {
                ...link,
                todayClicks: todayClicks.length,
                deviceBreakdown: this.getDeviceBreakdown(clicks),
                browserBreakdown: this.getBrowserBreakdown(clicks)
            }
        } catch (error) {
            console.error('❌ Error getting link stats:', error.message)
            return null
        }
    }

    static getDeviceBreakdown(clicks) {
        const breakdown = {}
        clicks.forEach(click => {
            breakdown[click.device_type] = (breakdown[click.device_type] || 0) + 1
        })
        return breakdown
    }

    static getBrowserBreakdown(clicks) {
        const breakdown = {}
        clicks.forEach(click => {
            breakdown[click.browser] = (breakdown[click.browser] || 0) + 1
        })
        return breakdown
    }
}

module.exports = LinkService