# EventApp Telegram Bot

Telegram bot for EventApp with mini-app integration and account linking functionality.

## Features

- 🤖 Telegram bot interface
- 📱 Mini App integration
- 🔗 Account linking (Telegram ↔ EventApp)
- 📅 Event management
- 🔔 Notifications
- 🌐 Multi-language support

## Setup Instructions

### 1. Create Telegram Bot

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot`
3. Choose a name for your bot
4. Choose a username (must end with 'bot')
5. Copy the bot token

### 2. Configure Mini App

1. Message [@BotFather](https://t.me/botfather) again
2. Send `/mybots`
3. Select your bot
4. Go to "Bot Settings" → "Menu Button"
5. Set the menu button URL to your mini-app URL

### 3. Environment Variables

Create a `.env` file with the following variables:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_BOT_USERNAME=your_bot_username

# Database Configuration
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres

# JWT Configuration
JWT_SECRET=your-secret-key-123

# API Configuration
EVENTAPP_API_URL=https://eventapp-production-0f47.up.railway.app
FRONTEND_URL=https://eventapp-frontend-mu.vercel.app

# Mini App Configuration
MINI_APP_URL=https://eventapp-frontend-mu.vercel.app

# Server Configuration
PORT=3001
NODE_ENV=production
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Run the Bot

```bash
# Development
npm run dev

# Production
npm start
```

## Bot Commands

- `/start` - Start the bot and show main menu
- `/help` - Show help information
- `/link` - Link your EventApp account
- `/events` - View your events
- `/settings` - Bot settings

## Mini App Integration

The bot integrates with the EventApp mini-app through:

1. **Web App Button** - Opens the mini-app directly in Telegram
2. **Account Linking** - Links Telegram account to existing EventApp account
3. **Authentication** - Uses Telegram's init data for secure authentication

## API Endpoints

- `GET /api/telegram/auth` - Authenticate Telegram user
- `POST /api/telegram/link` - Link Telegram account to EventApp
- `GET /health` - Health check

## Database Schema

The bot uses the following tables:
- `users` - User accounts with Telegram integration
- `telegram_sessions` - Telegram bot sessions
- `user_followers` - User following relationships
- `user_favorites` - User favorite events

## Deployment

### Railway Deployment

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Deploy the service

### Environment Variables in Railway

Make sure to set all required environment variables in Railway:
- `TELEGRAM_BOT_TOKEN`
- `DATABASE_URL`
- `JWT_SECRET`
- `EVENTAPP_API_URL`
- `FRONTEND_URL`
- `MINI_APP_URL`

## Security

- All Telegram init data is validated
- JWT tokens are used for authentication
- Database connections use SSL in production
- Passwords are hashed using bcrypt

## Support

For support, please contact the development team or create an issue in the repository.
