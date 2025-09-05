// config/database.js
const { Pool } = require('pg');
require('dotenv').config();

// Create a new Pool instance using the connection string from .env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render's free PostgreSQL has a low connection limit.
  // Setting a low max helps avoid timeouts and errors.
  max: 5, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if no connection
});

// Listen for errors on the pool
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

// Helper function to test the connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL database successfully!');
    client.release(); // Release the client back to the pool
  } catch (err) {
    console.error('❌ Failed to connect to PostgreSQL database:', err.message);
  }
};

module.exports = {
  pool,
  testConnection
};