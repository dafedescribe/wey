const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env file')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Test connection
async function testConnection() {
    try {
        // Test connection using the new users table
        const { data, error } = await supabase.from('users').select('count').single()
        if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows found" which is fine
            throw error
        }
        console.log('✅ Supabase connected successfully')
        return true
    } catch (error) {
        console.error('❌ Supabase connection failed:', error.message)
        console.error('💡 Make sure you\'ve created the new database tables (users, shortened_links, link_clicks)')
        return false
    }
}

module.exports = { supabase, testConnection }