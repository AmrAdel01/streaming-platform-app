# Streaming Platform

A full-featured streaming platform built with Node.js, Express, MongoDB, and Redis.

## Features

- User authentication and authorization
- Video upload and streaming
- User profiles with customizable preferences
- Email verification and password reset
- Watch history and watch later functionality
- Social features (following, comments)
- Real-time notifications and chat
- Content moderation and reporting
- Playlist management
- Video recommendations

## Prerequisites

- Node.js (v14 or higher)
- MongoDB
- Redis
- FFmpeg (for video processing)

## Installation

1. Clone the repository:

   ```
   git clone https://github.com/yourusername/streaming-platform.git
   cd streaming-platform
   ```

2. Install dependencies:

   ```
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:

   ```
   # Server Configuration
   PORT=3000
   NODE_ENV=development

   # Database Configuration
   DB_URL=mongodb://localhost:27017/streaming-platform

   # Redis Configuration
   REDIS_URL=redis://localhost:6379

   # JWT Configuration
   JWT_SECRET=your_jwt_secret_key_here

   # Email Configuration
   EMAIL_HOST=smtp.example.com
   EMAIL_PORT=587
   EMAIL_SECURE=false
   EMAIL_USER=your_email@example.com
   EMAIL_PASSWORD=your_email_password

   # Frontend URL (for email links)
   FRONTEND_URL=http://localhost:8080

   # CORS Configuration
   CORS_ORIGIN=http://localhost:8080

   # File Upload Configuration
   MAX_FILE_SIZE=100000000 # 100MB in bytes
   ```

4. Start the development server:
   ```
   npm run dev
   ```

## API Documentation

### Authentication

- `POST /api/auth/signup` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/users/me` - Get current user
- `PUT /api/auth/profile` - Update user profile
- `GET /api/auth/profile/:id` - Get user profile by ID
- `POST /api/auth/follow/:id` - Follow a user
- `POST /api/auth/unfollow/:id` - Unfollow a user

### User Preferences

- `GET /api/auth/preferences` - Get user preferences
- `PUT /api/auth/preferences` - Update user preferences

### Password Management

- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password

### Email Verification

- `GET /api/auth/verify-email/:token` - Verify email
- `POST /api/auth/resend-verification` - Resend verification email

### Watch History and Watch Later

- `GET /api/auth/watch-history` - Get watch history
- `GET /api/auth/watch-later` - Get watch later list
- `POST /api/auth/watch-later/:videoId` - Add video to watch later
- `DELETE /api/auth/watch-later/:videoId` - Remove video from watch later

## License

ISC
