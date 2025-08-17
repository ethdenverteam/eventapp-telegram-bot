require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Telegram Bot setup
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Store user sessions
const userSessions = new Map();

// Helper function to generate JWT token
const generateToken = (userId, email) => {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
};

// Helper function to verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Helper function to create or update Telegram session
const createTelegramSession = async (telegramUser) => {
  try {
    const { id, username, first_name, last_name, language_code } = telegramUser;
    
    // Check if session already exists
    const existingSession = await pool.query(
      'SELECT * FROM telegram_sessions WHERE telegram_id = $1',
      [id]
    );

    if (existingSession.rows.length > 0) {
      // Update existing session
      await pool.query(
        'UPDATE telegram_sessions SET username = $1, first_name = $2, last_name = $3, language_code = $4, updated_at = NOW() WHERE telegram_id = $5',
        [username, first_name, last_name, language_code, id]
      );
      return existingSession.rows[0];
    } else {
      // Create new session
      const newSession = await pool.query(
        'INSERT INTO telegram_sessions (telegram_id, username, first_name, last_name, language_code) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [id, username, first_name, last_name, language_code]
      );
      return newSession.rows[0];
    }
  } catch (error) {
    console.error('Error creating Telegram session:', error);
    throw error;
  }
};

// Helper function to link Telegram account to existing user
const linkTelegramToUser = async (telegramId, email, password) => {
  try {
    // Find user by email
    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = userResult.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      throw new Error('Invalid password');
    }

    // Update user with Telegram info
    await pool.query(
      'UPDATE users SET telegram_id = $1, telegram_username = $2, telegram_connected = true WHERE id = $3',
      [telegramId, user.telegram_username, user.id]
    );

    // Update Telegram session
    await pool.query(
      'UPDATE telegram_sessions SET user_id = $1 WHERE telegram_id = $2',
      [user.id, telegramId]
    );

    return user;
  } catch (error) {
    console.error('Error linking Telegram account:', error);
    throw error;
  }
};

// Bot command handlers
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramUser = msg.from;

  try {
    // Create or update Telegram session
    await createTelegramSession(telegramUser);

    const welcomeMessage = `
🎉 Welcome to EventApp Bot!

This bot helps you manage and discover events. You can:

📱 Use our Mini App to browse events
🔗 Link your existing EventApp account
📅 Get event notifications
🎫 Manage your tickets

Choose an option below:
    `;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📱 Open Mini App', web_app: { url: process.env.MINI_APP_URL } }
        ],
        [
          { text: '🔗 Link Account', callback_data: 'link_account' },
          { text: '📅 My Events', callback_data: 'my_events' }
        ],
        [
          { text: '🔍 Browse Events', callback_data: 'browse_events' },
          { text: '⚙️ Settings', callback_data: 'settings' }
        ]
      ]
    };

    await bot.sendMessage(chatId, welcomeMessage, { reply_markup: keyboard });
  } catch (error) {
    console.error('Error in /start command:', error);
    const errorMessage = `
❌ Error occurred while starting the bot

🔍 Error details: ${error.message}
📋 Error code: ${error.code || 'UNKNOWN'}
⏰ Time: ${new Date().toISOString()}

Please try again or contact support if the problem persists.
    `;
    await bot.sendMessage(chatId, errorMessage);
  }
});

// Handle callback queries
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const telegramUser = callbackQuery.from;

  try {
    switch (data) {
      case 'link_account':
        await handleLinkAccount(chatId, telegramUser);
        break;
      case 'my_events':
        await handleMyEvents(chatId, telegramUser);
        break;
      case 'browse_events':
        await handleBrowseEvents(chatId, telegramUser);
        break;
      case 'settings':
        await handleSettings(chatId, telegramUser);
        break;
      default:
        await bot.answerCallbackQuery(callbackQuery.id);
    }
  } catch (error) {
    console.error('Error handling callback query:', error);
    const errorMessage = `
❌ Error occurred while processing your request

🔍 Error details: ${error.message}
📋 Error code: ${error.code || 'UNKNOWN'}
🎯 Action: ${data}
⏰ Time: ${new Date().toISOString()}

Please try again or contact support if the problem persists.
    `;
    await bot.sendMessage(chatId, errorMessage);
  }
});

// Handle link account
const handleLinkAccount = async (chatId, telegramUser) => {
  const session = await createTelegramSession(telegramUser);
  
  if (session.user_id) {
    await bot.sendMessage(chatId, '✅ Your account is already linked!');
    return;
  }

  // Store user in linking process
  userSessions.set(telegramUser.id, { state: 'linking', step: 'email' });

  await bot.sendMessage(chatId, 
    '🔗 Let\'s link your EventApp account!\n\n' +
    'Please enter your EventApp email address:'
  );
};

// Handle my events
const handleMyEvents = async (chatId, telegramUser) => {
  try {
    const session = await createTelegramSession(telegramUser);
    
    if (!session.user_id) {
      await bot.sendMessage(chatId, 
        '❌ Please link your EventApp account first.\n\n' +
        'Use the "🔗 Link Account" option to connect your account.'
      );
      return;
    }

    // Get user's events from API
    const response = await axios.get(`${process.env.EVENTAPP_API_URL}/api/events/my-events`, {
      headers: {
        'Authorization': `Bearer ${generateToken(session.user_id, 'telegram')}`
      }
    });

    const events = response.data.events || [];

    if (events.length === 0) {
      await bot.sendMessage(chatId, '📅 You don\'t have any events yet.');
      return;
    }

    let message = '📅 Your Events:\n\n';
    events.forEach((event, index) => {
      message += `${index + 1}. ${event.title}\n`;
      message += `   📅 ${new Date(event.date).toLocaleDateString()}\n`;
      message += `   📍 ${event.location}\n\n`;
    });

    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.error('Error getting user events:', error);
    const errorMessage = `
❌ Error occurred while loading your events

🔍 Error details: ${error.message}
📋 Error code: ${error.code || 'UNKNOWN'}
🌐 API URL: ${process.env.EVENTAPP_API_URL || 'NOT_SET'}
⏰ Time: ${new Date().toISOString()}

Please try again or contact support if the problem persists.
    `;
    await bot.sendMessage(chatId, errorMessage);
  }
};

// Handle browse events
const handleBrowseEvents = async (chatId, telegramUser) => {
  try {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📱 Open Mini App', web_app: { url: process.env.MINI_APP_URL } }
        ],
        [
          { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
        ]
      ]
    };

    await bot.sendMessage(chatId, 
      '🔍 Browse Events\n\n' +
      'Click the button below to open our Mini App and browse all available events:',
      { reply_markup: keyboard }
    );
  } catch (error) {
    console.error('Error browsing events:', error);
    const errorMessage = `
❌ Error occurred while opening event browser

🔍 Error details: ${error.message}
📋 Error code: ${error.code || 'UNKNOWN'}
🌐 Mini App URL: ${process.env.MINI_APP_URL || 'NOT_SET'}
⏰ Time: ${new Date().toISOString()}

Please try again or contact support if the problem persists.
    `;
    await bot.sendMessage(chatId, errorMessage);
  }
};

// Handle settings
const handleSettings = async (chatId, telegramUser) => {
  try {
    const session = await createTelegramSession(telegramUser);
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔔 Notifications', callback_data: 'notifications' },
          { text: '🌐 Language', callback_data: 'language' }
        ],
        [
          { text: '🔗 Account Settings', callback_data: 'account_settings' }
        ],
        [
          { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
        ]
      ]
    };

    const status = session.user_id ? '✅ Linked' : '❌ Not linked';
    
    await bot.sendMessage(chatId, 
      `⚙️ Settings\n\n` +
      `Account Status: ${status}\n` +
      `Username: @${telegramUser.username || 'N/A'}\n\n` +
      `Choose an option:`,
      { reply_markup: keyboard }
    );
  } catch (error) {
    console.error('Error in settings:', error);
    const errorMessage = `
❌ Error occurred while loading settings

🔍 Error details: ${error.message}
📋 Error code: ${error.code || 'UNKNOWN'}
⏰ Time: ${new Date().toISOString()}

Please try again or contact support if the problem persists.
    `;
    await bot.sendMessage(chatId, errorMessage);
  }
};

// Handle text messages (for account linking)
bot.on('message', async (msg) => {
  if (msg.text && msg.text.startsWith('/')) return; // Skip commands

  const chatId = msg.chat.id;
  const telegramUser = msg.from;
  const text = msg.text;

  const session = userSessions.get(telegramUser.id);
  
  if (!session || session.state !== 'linking') {
    return;
  }

  try {
    if (session.step === 'email') {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(text)) {
        await bot.sendMessage(chatId, '❌ Please enter a valid email address:');
        return;
      }

      // Store email and ask for password
      session.email = text;
      session.step = 'password';
      userSessions.set(telegramUser.id, session);

      await bot.sendMessage(chatId, 
        '✅ Email received!\n\n' +
        'Now please enter your EventApp password:'
      );
    } else if (session.step === 'password') {
      // Try to link account
      try {
        const user = await linkTelegramToUser(telegramUser.id, session.email, text);
        
        // Clear session
        userSessions.delete(telegramUser.id);

        const keyboard = {
          inline_keyboard: [
            [
              { text: '📱 Open Mini App', web_app: { url: process.env.MINI_APP_URL } }
            ],
            [
              { text: '📅 My Events', callback_data: 'my_events' },
              { text: '🔍 Browse Events', callback_data: 'browse_events' }
            ]
          ]
        };

        await bot.sendMessage(chatId, 
          `✅ Account linked successfully!\n\n` +
          `Welcome back, ${user.name}! 🎉\n\n` +
          `You can now use all bot features.`,
          { reply_markup: keyboard }
        );
      } catch (error) {
        const errorMessage = `
❌ Failed to link account

🔍 Error details: ${error.message}
📋 Error code: ${error.code || 'UNKNOWN'}
📧 Email: ${session.email}
⏰ Time: ${new Date().toISOString()}

Please check your email and password, or make sure you have an EventApp account.
        `;
        await bot.sendMessage(chatId, errorMessage);
        
        // Reset to email step
        session.step = 'email';
        delete session.email;
        userSessions.set(telegramUser.id, session);
      }
    }
  } catch (error) {
    console.error('Error handling message:', error);
    const errorMessage = `
❌ Error occurred while processing your message

🔍 Error details: ${error.message}
📋 Error code: ${error.code || 'UNKNOWN'}
📝 Message: ${text}
⏰ Time: ${new Date().toISOString()}

Please try again or contact support if the problem persists.
    `;
    await bot.sendMessage(chatId, errorMessage);
  }
});

// API Routes for Mini App integration
app.get('/api/telegram/auth', async (req, res) => {
  try {
    const { initData } = req.query;
    
    if (!initData) {
      return res.status(400).json({ error: 'Missing initData' });
    }

    // Parse Telegram init data
    const urlParams = new URLSearchParams(initData);
    const user = JSON.parse(urlParams.get('user'));
    
    if (!user || !user.id) {
      return res.status(400).json({ error: 'Invalid user data' });
    }

    // Get or create Telegram session
    const session = await createTelegramSession(user);
    
    if (session.user_id) {
      // User is linked, generate token
      const token = generateToken(session.user_id, 'telegram');
      res.json({ token, linked: true });
    } else {
      // User not linked
      res.json({ linked: false, telegramId: user.id });
    }
  } catch (error) {
    console.error('Error in telegram auth:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message,
      code: error.code || 'UNKNOWN',
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/telegram/link', async (req, res) => {
  try {
    const { telegramId, email, password } = req.body;
    
    if (!telegramId || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const user = await linkTelegramToUser(telegramId, email, password);
    const token = generateToken(user.id, user.email);
    
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    console.error('Error linking account:', error);
    res.status(400).json({ 
      error: error.message,
      code: error.code || 'UNKNOWN',
      timestamp: new Date().toISOString()
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'EventApp Telegram Bot is running' });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Telegram Bot server running on port ${port}`);
});

// Error handling
bot.on('error', (error) => {
  console.error('Telegram Bot error:', error);
});

bot.on('polling_error', (error) => {
  console.error('Telegram Bot polling error:', error);
});

console.log('🤖 EventApp Telegram Bot started!');
