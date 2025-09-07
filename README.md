# Tassie Reddit Bot 🇦🇺

A production-ready Node.js bot that monitors the r/tasmania subreddit and forwards new posts to Discord via webhooks. Built with TypeScript, featuring robust error handling, rate limiting, and comprehensive logging.

## ✨ Features

- **Automated Monitoring**: Continuously monitors r/tasmania for new posts
- **Smart Filtering**: Prevents duplicate posts with intelligent storage tracking
- **Rich Discord Embeds**: Beautiful Discord messages with full-size images, metadata, and colour-coded flairs
- **Perfect Tag Alignment**: Reddit flairs automatically become Discord tags (Video → [Video], Question → [Question])
- **Enhanced Media Display**: Shows full-size images instead of tiny thumbnails for better visual impact
- **Production Ready**: Docker support, health checks, and comprehensive error handling
- **Flexible Scheduling**: Configurable cron-based scheduling with timezone support
- **Discord Threading**: Optional thread creation with clean titles (no redundant usernames)
- **OAuth2 Security**: Secure Reddit authentication without storing passwords
- **Rate Limiting**: Respects Reddit and Discord API limits
- **Comprehensive Logging**: Structured logging with rotation and different levels
- **Type Safety**: Full TypeScript implementation with strict typing
- **Easy Deployment**: Docker and Docker Compose ready with Coolify support

## 📋 Prerequisites

Before setting up the bot, ensure you have:

- **Node.js** (v18.0.0 or higher)
- **npm** or **yarn** package manager
- **Docker** (optional, for containerised deployment)
- **Reddit account** for API access
- **Discord server** with webhook creation permissions

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/axxs/tassie-reddit-bot.git
cd tassie-reddit-bot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` with your credentials (see configuration sections below).

### 4. Set Up Reddit OAuth2 Authentication

Run the interactive OAuth2 setup wizard:

```bash
npm run setup:oauth
```

This will:

- Validate your Reddit app configuration
- Open your browser for secure authentication
- Save access tokens automatically
- Guide you through any issues

### 5. Build and Start

For development:

```bash
npm run dev
```

For production:

```bash
npm run build
npm start
```

## 🔧 Configuration

### Reddit API Setup (OAuth2)

The bot now uses secure OAuth2 authentication instead of username/password.

1. **Create Reddit App**:
   - Go to [Reddit App Preferences](https://www.reddit.com/prefs/apps)
   - Click "Create App" or "Create Another App"
   - Choose **"web app"** as the app type ⚠️ **Important: NOT "script"**
   - Fill in the form:
     - **Name**: `Tassie Reddit Bot` (or your preferred name)
     - **Description**: `Bot for monitoring r/tasmania`
     - **About URL**: Leave blank or add your GitHub repo
     - **Redirect URI**: `http://localhost:8080/auth/callback` ⚠️ **Must match exactly**

2. **Get Your Credentials**:
   - **Client ID**: Found under the app name (short string)
   - **Client Secret**: The longer "secret" string shown

3. **Update .env File**:

   ```env
   REDDIT_CLIENT_ID=your_client_id_here
   REDDIT_CLIENT_SECRET=your_client_secret_here
   REDDIT_REDIRECT_URI=http://localhost:8080/auth/callback
   REDDIT_USER_AGENT=TassieRedditBot/1.0.0 by u/your-username
   REDDIT_SUBREDDIT=tasmania
   ```

4. **Run OAuth2 Setup**:

   ```bash
   npm run setup:oauth
   ```

   The setup wizard will:
   - Validate your configuration
   - Start a temporary web server
   - Open Reddit's authorization page in your browser
   - Handle the OAuth2 flow automatically
   - Save secure access tokens for future use

> **🔒 Security Benefits**: No passwords required! The bot authenticates securely using OAuth2 tokens that can be revoked anytime from your Reddit account settings.

### Discord Webhook Setup

1. **Create Discord Webhook**:
   - Open your Discord server
   - Go to **Server Settings** → **Integrations**
   - Click **"Create Webhook"** or **"View Webhooks"** → **"New Webhook"**
   - Choose the channel where posts will be sent
   - Customise the webhook name and avatar (optional)
   - Copy the **Webhook URL**

2. **Update .env File**:
   ```env
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN
   DISCORD_DEFAULT_USERNAME=Tassie Reddit Bot
   ```

### Scheduling Configuration

Configure how often the bot checks for new posts:

```env
# Check every 15 minutes (recommended)
SCHEDULE_CRON=*/15 * * * *

# Alternative schedules:
# Every 5 minutes: */5 * * * *
# Every hour: 0 * * * *
# Twice daily (9am, 6pm): 0 9,18 * * *

# Timezone (important for accurate scheduling)
SCHEDULE_TIMEZONE=Australia/Hobart
```

### Environment Variables Reference

| Variable                     | Required | Default                 | Description                                 |
| ---------------------------- | -------- | ----------------------- | ------------------------------------------- |
| `REDDIT_CLIENT_ID`           | ✅       | -                       | Reddit app client ID                        |
| `REDDIT_CLIENT_SECRET`       | ✅       | -                       | Reddit app client secret                    |
| `REDDIT_REDIRECT_URI`        | ✅       | -                       | OAuth2 redirect URI (must match Reddit app) |
| `REDDIT_REFRESH_TOKEN`       | ✅       | -                       | OAuth2 refresh token or authorization code  |
| `REDDIT_SUBREDDIT`           | ✅       | -                       | Subreddit to monitor (without r/)           |
| `DISCORD_WEBHOOK_URL`        | ✅       | -                       | Discord webhook URL                         |
| `REDDIT_USER_AGENT`          | ❌       | `TassieRedditBot/1.0.0` | Reddit API user agent                       |
| `REDDIT_POST_LIMIT`          | ❌       | `25`                    | Posts to fetch per check (1-100)            |
| `SCHEDULE_CRON`              | ❌       | `*/15 * * * *`          | Cron expression for scheduling              |
| `SCHEDULE_TIMEZONE`          | ❌       | `Australia/Hobart`      | Timezone for scheduling                     |
| `LOG_LEVEL`                  | ❌       | `info`                  | Logging level (error, warn, info, debug)    |
| `ENVIRONMENT`                | ❌       | `production`            | Environment (development/production)        |
| `DISCORD_DEFAULT_USERNAME`   | ❌       | `Reddit Bot`            | Custom webhook username                     |
| `DISCORD_DEFAULT_AVATAR_URL` | ❌       | -                       | Custom webhook avatar URL                   |
| `DISCORD_ENABLE_THREADING`   | ❌       | `false`                 | Enable Discord thread creation              |
| `DISCORD_FORUM_CHANNEL`      | ❌       | `false`                 | Whether Discord channel is a forum          |
| `HEALTH_CHECK_PORT`          | ❌       | `3000`                  | Port for health check endpoint              |
| `STORAGE_FILE_PATH`          | ❌       | `data/posted-ids.json`  | Path to post IDs storage file               |

## 🐳 Docker Deployment

### Using Docker Compose (Recommended)

1. **Ensure .env is configured**:

   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

2. **Start the bot**:

   ```bash
   docker-compose up -d
   ```

3. **View logs**:

   ```bash
   docker-compose logs -f tassie-reddit-bot
   ```

4. **Stop the bot**:
   ```bash
   docker-compose down
   ```

### Using Docker Directly

```bash
# Build the image
docker build -t tassie-reddit-bot .

# Run with environment file and persistent volumes
docker run -d \
  --name tassie-bot \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  -p 3000:3000 \
  --restart unless-stopped \
  tassie-reddit-bot

# View logs
docker logs -f tassie-bot

# Stop and remove container
docker stop tassie-bot && docker rm tassie-bot
```

## ☁️ Coolify Deployment

[Coolify](https://coolify.io/) is an excellent self-hosted PaaS that makes deploying applications simple and secure. Here's how to deploy the Tassie Reddit Bot on Coolify:

### Prerequisites for Coolify

- Coolify instance running (v4.0+)
- Git repository (GitHub, GitLab, or Bitbucket)
- Domain name (optional, for custom URLs)

### Step-by-Step Coolify Deployment

#### 1. Prepare Your Repository

Ensure your repository contains:

- ✅ `Dockerfile` (already included)
- ✅ `package.json` with correct scripts
- ✅ `.env.example` for reference

#### 2. Create New Application in Coolify

1. **Access Coolify Dashboard**
   - Log into your Coolify instance
   - Navigate to **Projects** → **Your Project**

2. **Add New Resource**
   - Click **"+ New"** → **"Application"**
   - Choose **"Public Repository"** or **"Private Repository"**

3. **Configure Repository**
   - **Repository URL**: `https://github.com/your-username/tassie-reddit-bot.git`
   - **Branch**: `main` (or your default branch)
   - **Build Pack**: Select **"Dockerfile"**
   - **Dockerfile Location**: Leave as `Dockerfile` (root directory)

#### 3. Configure Build Settings

1. **Build Configuration**:
   - **Build Command**: `npm ci && npm run build` (automatic from Dockerfile)
   - **Start Command**: `node dist/index.js` (automatic from Dockerfile)
   - **Port**: `3000` (for health checks)

2. **Advanced Build Settings**:
   - **Build Context**: `.` (root directory)
   - **Docker Build Target**: `production`

#### 4. Environment Variables Configuration

⚠️ **Important**: The bot now uses OAuth2 authentication, so you need to set up Reddit authentication differently for production deployment.

In Coolify's **Environment Variables** section, add all required variables:

**Required Variables**:

```env
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret
REDDIT_REDIRECT_URI=https://your-domain.com/auth/callback
REDDIT_SUBREDDIT=tasmania
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_TOKEN
```

> **🔗 Redirect URI**: For production deployment, you **must** update your Reddit app's redirect URI to match your domain. It should be `https://your-domain.com/auth/callback` or the specific URL where your bot is hosted.

**Optional Variables** (with recommended values):

```env
ENVIRONMENT=production
LOG_LEVEL=info
SCHEDULE_CRON=*/15 * * * *
SCHEDULE_TIMEZONE=Australia/Hobart
REDDIT_POST_LIMIT=25
REDDIT_USER_AGENT=TassieRedditBot/1.0.0 by u/your-username
DISCORD_DEFAULT_USERNAME=Tassie Reddit Bot
NODE_ENV=production
```

#### 5. Configure Persistent Storage

The bot requires persistent storage for post tracking and logs. In Coolify, configure volumes in the **Storage** section:

1. **Data Volume** (required):
   - **Volume Name**: `tassie-data`
   - **Source Path**: Leave empty
   - **Destination Path**: `/app/data` (in container)
   - **Purpose**: Stores processed post IDs and OAuth tokens

2. **Logs Volume** (optional):
   - **Volume Name**: `tassie-logs`
   - **Source Path**: Leave empty
   - **Destination Path**: `/app/logs` (in container)
   - **Purpose**: Application logs with rotation

#### 6. OAuth2 Setup for Production

**⚠️ Critical**: OAuth2 requires special setup for production deployment. You have two options:

##### Option A: Use Helper Script (Requires Separate Reddit App)

⚠️ **Important**: This option requires creating a separate Reddit app for local development since Reddit apps are tied to specific redirect URIs.

1. **Create a separate Reddit app for local setup**:
   - Go to [Reddit App Preferences](https://www.reddit.com/prefs/apps)
   - Create another app with redirect URI: `http://localhost:8080/auth/callback`
   - Use different credentials for local OAuth2 setup

2. **Run local OAuth2 setup**:

   ```bash
   # Use the LOCAL app credentials temporarily
   REDDIT_CLIENT_ID=local_app_client_id \
   REDDIT_CLIENT_SECRET=local_app_client_secret \
   REDDIT_REDIRECT_URI=http://localhost:8080/auth/callback \
   node scripts/setup-oauth.js
   ```

3. **Copy refresh token to production**:
   - Copy the refresh token from the setup output
   - In Coolify, add environment variable with your **production** app credentials:
     ```env
     REDDIT_REFRESH_TOKEN=refresh_token_from_local_setup
     ```

##### Option B: Direct Production OAuth2 Flow

**New**: The bot now includes a built-in OAuth2 callback handler! Perfect for Coolify deployments.

1. **Update Reddit app redirect URI**:
   - Go to [Reddit App Preferences](https://www.reddit.com/prefs/apps)
   - Edit your Reddit application
   - Set redirect URI to: `https://your-domain.com/auth/callback` (e.g., `https://reddut.nwtassie.com/auth/callback`)

2. **Deploy application first**:
   - Deploy the bot with all environment variables EXCEPT `REDDIT_REFRESH_TOKEN`
   - The bot will start but won't be able to fetch posts yet (this is expected)

3. **Complete OAuth2 authorization**:
   - Visit your Reddit app and get the authorization URL:
     ```
     https://www.reddit.com/api/v1/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=https://your-domain.com/auth/callback&duration=permanent&scope=read&state=reddit-bot-auth
     ```
   - Replace `YOUR_CLIENT_ID` and `your-domain.com` with your actual values
   - Visit this URL in your browser and authorize the application
   - You'll be redirected to your domain with the authorization code

4. **Set the authorization code**:
   - Copy the authorization code from the success page
   - In Coolify, add this environment variable:
     ```env
     REDDIT_REFRESH_TOKEN=your_authorization_code_from_callback
     ```
   - Restart the application

5. **Verify setup**:
   - Check application logs for "Successfully refreshed OAuth2 access token"
   - The bot should now be able to fetch posts from Reddit

##### Which Option to Choose?

- **Option A**: Requires creating separate Reddit apps for local/production
- **Option B**: **Recommended** - Uses single Reddit app, simpler setup, built-in callback handler

> **💡 Production Tip**: Option B is the recommended approach for Coolify deployments since it uses your production Reddit app directly and the bot handles the OAuth2 callback automatically. No need for separate apps or local development setup.

#### 7. Health Check Configuration

Coolify will automatically detect the health check from the Dockerfile, but you can customise:

1. **Health Check Settings**:
   - **Path**: `/health`
   - **Port**: `3000`
   - **Interval**: `30s`
   - **Timeout**: `10s`
   - **Retries**: `3`

#### 7. Deploy the Application

1. **Start Deployment**:
   - Click **"Deploy"** in Coolify
   - Monitor the build logs in real-time
   - Wait for the deployment to complete

2. **Verify Deployment**:
   - Check application status shows **"Running"**
   - Review logs for successful startup messages
   - Test health check endpoint

### Coolify Management

#### Viewing Logs

1. **Real-time Logs**:
   - Go to **Application** → **Logs** tab
   - View live application logs
   - Filter by log level if needed

2. **Historical Logs**:
   - Access stored logs via the **Storage** tab
   - Download log files for analysis

#### Monitoring and Alerts

1. **Application Metrics**:
   - Monitor CPU and memory usage
   - Track deployment history
   - View application uptime

2. **Set up Notifications** (optional):
   - Configure webhook notifications for deployment events
   - Set up email alerts for application failures

#### Updates and Maintenance

1. **Automatic Deployments**:
   - Enable **"Auto Deploy"** in Coolify settings
   - Automatically deploys on Git push to main branch

2. **Manual Deployments**:
   - Use **"Redeploy"** button for manual updates
   - Roll back to previous versions if needed

3. **Environment Variable Updates**:
   - Update variables in Coolify dashboard
   - Restart application to apply changes

### Troubleshooting Coolify Deployment

#### Common Issues

1. **Build Failures**:

   ```bash
   # Check build logs in Coolify dashboard
   # Ensure Dockerfile is valid
   # Verify package.json scripts
   ```

2. **Environment Variable Issues**:

   ```bash
   # Verify all required variables are set
   # Check variable names match exactly
   # Ensure no extra spaces in values
   ```

3. **Health Check Failures**:

   ```bash
   # Verify health check endpoint is accessible
   # Check application logs for startup errors
   # Ensure port 3000 is not blocked
   ```

4. **Storage Permissions**:
   ```bash
   # Ensure volume paths are correct
   # Check container user permissions
   # Verify data directory is writable
   ```

#### Debug Commands

```bash
# View container logs
coolify logs tassie-reddit-bot

# Check container status
coolify status tassie-reddit-bot

# Restart application
coolify restart tassie-reddit-bot
```

#### Performance Optimisation

1. **Resource Limits**:
   - Set appropriate CPU/memory limits in Coolify
   - Recommended: 512MB RAM, 0.5 CPU cores

2. **Log Management**:
   - Configure log rotation
   - Set appropriate log levels
   - Monitor disk usage

### Coolify Best Practices

1. **Security**:
   - Use environment variables for all secrets
   - Enable HTTPS if exposing health check endpoint
   - Regularly update dependencies

2. **Monitoring**:
   - Set up health check alerts
   - Monitor application logs regularly
   - Track deployment success rates

3. **Backup**:
   - Regular backups of persistent volumes
   - Export environment variables configuration
   - Document deployment configuration

## 📊 API Endpoints

The bot exposes a health check endpoint for monitoring:

### Health Check

**Endpoint**: `GET /health`  
**Port**: `3000` (configurable)

**Response**:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600000,
  "version": "1.0.0",
  "services": {
    "reddit": "connected",
    "discord": "connected",
    "storage": "loaded"
  }
}
```

**Status Codes**:

- `200`: Service healthy
- `503`: Service unhealthy or degraded

## 🏗️ Architecture

### System Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Reddit API    │    │  Tassie Reddit   │    │   Discord API   │
│   (r/tasmania)  │◄──►│      Bot         │───►│   (Webhook)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                               │
                               ▼
                      ┌─────────────────┐
                      │   File Storage  │
                      │  (posted-ids)   │
                      └─────────────────┘
```

### Core Components

- **RedditService**: Handles Reddit API integration using snoowrap
- **DiscordService**: Manages Discord webhook communication with axios
- **RedditStorage**: File-based storage for tracking processed posts
- **RedditDiscordBot**: Main orchestration class with cron scheduling
- **Config**: Environment-based configuration management

### Data Flow

1. **Scheduled Check**: Cron job triggers every 15 minutes (configurable)
2. **Fetch Posts**: Retrieve latest posts from r/tasmania via Reddit API
3. **Filter Duplicates**: Check against stored post IDs to avoid reposts
4. **Format Content**: Convert Reddit posts to Discord embed format
5. **Send to Discord**: Post embeds to Discord via webhook
6. **Store IDs**: Save processed post IDs to prevent future duplicates
7. **Log Results**: Record success/failure statistics and errors

## 🧪 Development

### Local Development Setup

1. **Clone and Install**:

   ```bash
   git clone <repository-url>
   cd tassie-reddit-bot
   npm install
   ```

2. **Configure Environment**:

   ```bash
   cp .env.example .env
   # Edit .env with your development credentials
   ```

3. **Development Mode**:
   ```bash
   npm run dev  # Uses nodemon for auto-restart
   ```

### Available Scripts

```bash
npm run dev          # Start in development mode with auto-reload
npm run build        # Compile TypeScript to JavaScript
npm start            # Start compiled application
npm run start:prod   # Build and start in one command
npm run lint         # Run ESLint
npm run lint:fix     # Fix auto-fixable linting issues
npm run format       # Format code with Prettier
npm run test         # Run test suite
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
npm run typecheck    # TypeScript type checking only
```

### Testing

Run the comprehensive test suite:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode (for development)
npm run test:watch

# Run specific test files
npm test -- --testPathPattern=reddit.service
```

### Code Quality

The project uses strict code quality tools:

- **TypeScript**: Strict typing with comprehensive type definitions
- **ESLint**: Code linting with TypeScript and Prettier integration
- **Prettier**: Code formatting for consistent style
- **Jest**: Unit and integration testing with coverage reports

## 🚨 Troubleshooting

### Common Issues

#### Reddit API Issues

**Problem**: `401 Unauthorized` or OAuth2 errors  
**Solution**:

- Verify Reddit credentials in `.env` (client ID, client secret)
- Check that Reddit app is configured as **"web app"** type (not "script")
- Ensure `REDDIT_REDIRECT_URI` matches exactly what's configured in Reddit app
- Run OAuth2 setup: `npm run setup:oauth` or use fresh authorization code
- Check that `REDDIT_REFRESH_TOKEN` is valid (not expired)

**Problem**: `429 Rate Limited` errors  
**Solution**:

- Reduce `REDDIT_POST_LIMIT` value (try 10-15 instead of 25)
- Increase cron interval (use `*/30 * * * *` for 30-minute intervals)
- Check for multiple bot instances running
- Verify OAuth2 tokens are not shared between instances

#### Discord Webhook Issues

**Problem**: `404 Not Found` on webhook  
**Solution**:

- Verify webhook URL is complete and correct
- Check that Discord webhook still exists
- Ensure webhook channel permissions are correct

**Problem**: Embeds not displaying properly  
**Solution**:

- Check Discord embed limits (title: 256 chars, description: 4096 chars)
- Verify image URLs are HTTPS
- Check embed colour values are valid integers

#### Storage Issues

**Problem**: Duplicate posts appearing  
**Solution**:

- Check `data/posted-ids.json` file exists and is writable
- Verify file isn't being reset between restarts
- Check for multiple bot instances using same storage file

**Problem**: Storage file corruption  
**Solution**:

- Stop the bot
- Delete `data/posted-ids.json` (will restart tracking)
- Restart bot

#### Docker Issues

**Problem**: Container exits immediately  
**Solution**:

- Check environment variables are set correctly
- Review container logs: `docker logs tassie-bot`
- Verify `.env` file is properly configured

**Problem**: Health check failing  
**Solution**:

- Check port 3000 is accessible in container
- Verify health check endpoint responds
- Check application startup logs

### Debug Mode

Enable debug logging for detailed troubleshooting:

```bash
# Set in .env
LOG_LEVEL=debug

# Or set environment variable
LOG_LEVEL=debug npm start
```

### Getting Help

If you encounter issues:

1. **Check Logs**: Review application logs in `logs/` directory
2. **Enable Debug**: Set `LOG_LEVEL=debug` for detailed output
3. **Test Connections**: Use test methods in services to verify API access
4. **Check Configuration**: Verify all environment variables are set correctly
5. **Monitor Health**: Use `/health` endpoint to check service status

## 🤝 Contributing

We welcome contributions to improve the Tassie Reddit Bot!

### Development Workflow

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** with proper tests
4. **Run quality checks**:
   ```bash
   npm run lint
   npm run format
   npm test
   npm run typecheck
   ```
5. **Commit your changes**: `git commit -m 'Add amazing feature'`
6. **Push to the branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Code Style

- Use TypeScript for all new code
- Follow existing code style (enforced by Prettier)
- Add JSDoc comments for public APIs
- Write unit tests for new functionality
- Update documentation for user-facing changes

### Pull Request Guidelines

- Provide clear description of changes
- Include tests for new functionality
- Ensure all tests pass
- Update README.md if needed
- Follow conventional commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **[snoowrap](https://github.com/not-an-aardvark/snoowrap)** - Reddit API wrapper
- **[axios](https://github.com/axios/axios)** - HTTP client
- **[node-cron](https://github.com/kelektiv/node-cron)** - Cron scheduling
- **[winston](https://github.com/winstonjs/winston)** - Logging framework
- **r/tasmania community** - The awesome community this bot serves!

---

Built with ❤️ for the Tasmanian Reddit community
