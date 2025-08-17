require('dotenv').config();

console.log('🔍 Checking Telegram Bot Environment Variables...\n');

const requiredVars = [
  'TELEGRAM_BOT_TOKEN',
  'DATABASE_URL',
  'JWT_SECRET',
  'EVENTAPP_API_URL',
  'FRONTEND_URL',
  'MINI_APP_URL',
  'PORT'
];

const optionalVars = [
  'NODE_ENV'
];

console.log('📋 Required Variables:');
requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: ${varName.includes('TOKEN') || varName.includes('SECRET') ? '***SET***' : value}`);
  } else {
    console.log(`❌ ${varName}: NOT SET`);
  }
});

console.log('\n📋 Optional Variables:');
optionalVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: ${value}`);
  } else {
    console.log(`⚠️  ${varName}: NOT SET (using default)`);
  }
});

console.log('\n🔧 Environment Summary:');
console.log(`Node.js Version: ${process.version}`);
console.log(`Platform: ${process.platform}`);
console.log(`Architecture: ${process.arch}`);

// Test database connection
console.log('\n🗄️  Testing Database Connection...');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.log('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Database connection successful');
    console.log(`   Server time: ${res.rows[0].now}`);
  }
  pool.end();
});

// Test API connection
console.log('\n🌐 Testing API Connection...');
const axios = require('axios');

if (process.env.EVENTAPP_API_URL) {
  axios.get(`${process.env.EVENTAPP_API_URL}/health`)
    .then(response => {
      console.log('✅ API connection successful');
      console.log(`   Status: ${response.data.status}`);
      console.log(`   Message: ${response.data.message}`);
    })
    .catch(error => {
      console.log('❌ API connection failed:', error.message);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Data: ${JSON.stringify(error.response.data)}`);
      }
    });
} else {
  console.log('❌ EVENTAPP_API_URL not set');
}

console.log('\n🎯 Bot Configuration Check Complete!');
