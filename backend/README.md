# Streaming Platform Backend

A robust backend service for a streaming platform built with Node.js, Express, and MongoDB.

## Features

- User Authentication & Authorization
- Video Upload and Processing
- Real-time Chat with Moderation
- Video Streaming
- Email Notifications
- Rate Limiting
- Error Handling
- API Documentation

## Tech Stack

- **Runtime**: Node.js 18
- **Framework**: Express.js
- **Database**: MongoDB
- **Cache**: Redis
- **Message Queue**: BullMQ
- **Real-time**: Socket.IO
- **File Processing**: FFmpeg
- **Testing**: Jest
- **Containerization**: Docker

## Project Structure

```
backend/
├── config/           # Configuration files
├── controller/       # Route controllers
├── middleware/       # Custom middleware
├── model/           # Database models
├── routes/          # API routes
├── utils/           # Utility functions
├── workers/         # Background workers
├── Uploads/         # File uploads directory
├── server.js        # Main application file
└── package.json     # Dependencies and scripts
```

## Prerequisites

- Node.js 18 or higher
- MongoDB
- Redis
- FFmpeg
- Docker (optional)

## Environment Variables

Create a `.env` file in the backend directory with the following variables:

```env
DB_URL=mongodb://localhost:27017/streaming-platform
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret
NODE_ENV=development
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=your_email@example.com
EMAIL_PASSWORD=your_email_password
```

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

## Docker Setup

1. Build the Docker image:

   ```bash
   docker build -t streaming-platform-backend .
   ```

2. Run the container:
   ```bash
   docker run -p 3000:3000 streaming-platform-backend
   ```

## API Endpoints

### Authentication Routes

- `POST /api/auth/signup`

  - Register a new user
  - Body: { username, email, password, role, avatar, bio, displayName }
  - Returns: User object with token

- `POST /api/auth/login`

  - Login user
  - Body: { email, password }
  - Returns: User object with token

- `POST /api/auth/create-admin`
  - Create admin user (Admin only)
  - Requires: Admin authentication
  - Body: { username, email, password }
  - Returns: Admin user object

### Profile Management Routes

- `GET /api/auth/users/me`

  - Get current user
  - Requires: Authentication token
  - Returns: User object

- `PUT /api/auth/profile`

  - Update user profile
  - Requires: Authentication token
  - Body: { username, email, bio, displayName, avatar }
  - Returns: Updated user profile

- `GET /api/auth/profile/:id`

  - Get user profile by ID
  - Requires: Authentication token
  - Returns: User profile

- `POST /api/auth/follow/:id`

  - Follow a user
  - Requires: Authentication token
  - Returns: Success message

- `POST /api/auth/unfollow/:id`
  - Unfollow a user
  - Requires: Authentication token
  - Returns: Success message

### User Preferences Routes

- `GET /api/auth/preferences`

  - Get user preferences
  - Requires: Authentication token
  - Returns: User preferences

- `PUT /api/auth/preferences`
  - Update user preferences
  - Requires: Authentication token
  - Body: { preferences object }
  - Returns: Updated preferences

### Password Management Routes

- `POST /api/auth/forgot-password`

  - Request password reset
  - Body: { email }
  - Returns: Success message

- `POST /api/auth/reset-password`
  - Reset password
  - Body: { token, newPassword }
  - Returns: Success message

### Email Verification Routes

- `GET /api/auth/verify-email/:token`

  - Verify email
  - Returns: Success message

- `POST /api/auth/resend-verification`
  - Resend verification email
  - Requires: Authentication token
  - Returns: Success message

### Watch History and Watch Later Routes

- `GET /api/auth/watch-history`

  - Get watch history
  - Requires: Authentication token
  - Returns: List of watched videos

- `GET /api/auth/watch-later`

  - Get watch later list
  - Requires: Authentication token
  - Returns: List of watch later videos

- `POST /api/auth/watch-later/:videoId`

  - Add video to watch later
  - Requires: Authentication token
  - Returns: Success message

- `DELETE /api/auth/watch-later/:videoId`
  - Remove video from watch later
  - Requires: Authentication token
  - Returns: Success message

### Video Routes

- `POST /api/videos/upload`

  - Upload a new video
  - Requires: Authentication token
  - Body: FormData (video file, title, description, tags, thumbnail)
  - Returns: Video object

- `GET /api/videos`

  - Get all videos
  - Query params: page, limit, sort, category
  - Returns: Paginated list of videos

- `GET /api/videos/:id`

  - Get video by ID
  - Returns: Video object with details

- `PUT /api/videos/:id`

  - Update video
  - Requires: Authentication token
  - Body: { title, description, tags, thumbnail }
  - Returns: Updated video object

- `DELETE /api/videos/:id`
  - Delete video
  - Requires: Authentication token
  - Returns: Success message

### Comment Routes

- `POST /api/videos/:videoId/comments`

  - Add comment to video
  - Requires: Authentication token
  - Body: { content }
  - Returns: Comment object

- `GET /api/videos/:videoId/comments`

  - Get video comments
  - Query params: page, limit
  - Returns: Paginated list of comments

- `DELETE /api/comments/:id`
  - Delete comment
  - Requires: Authentication token
  - Returns: Success message

### Live Stream Routes

- `POST /api/live/start`

  - Start a live stream
  - Requires: Authentication token
  - Body: { title, description, category }
  - Returns: Stream object with RTMP URL

- `GET /api/live/streams`

  - Get active live streams
  - Returns: List of active streams

- `GET /api/live/streams/:id`

  - Get specific live stream
  - Returns: Stream details

- `POST /api/live/streams/:id/end`
  - End live stream
  - Requires: Authentication token
  - Returns: Success message

### Playlist Routes

- `POST /api/playlists`

  - Create new playlist
  - Requires: Authentication token
  - Body: { name, description, isPublic }
  - Returns: Playlist object

- `GET /api/playlists`

  - Get user's playlists
  - Requires: Authentication token
  - Returns: List of playlists

- `GET /api/playlists/:id`

  - Get playlist by ID
  - Returns: Playlist with videos

- `PUT /api/playlists/:id`

  - Update playlist
  - Requires: Authentication token
  - Body: { name, description, isPublic }
  - Returns: Updated playlist

- `DELETE /api/playlists/:id`
  - Delete playlist
  - Requires: Authentication token
  - Returns: Success message

### Subtitle Routes

- `POST /api/videos/:videoId/subtitles`

  - Upload subtitles for video
  - Requires: Authentication token
  - Body: FormData (subtitle file, language)
  - Returns: Subtitle object

- `GET /api/videos/:videoId/subtitles`

  - Get video subtitles
  - Returns: List of subtitles

- `DELETE /api/subtitles/:id`
  - Delete subtitle
  - Requires: Authentication token
  - Returns: Success message

### Chat Routes

- WebSocket Connection: `ws://your-domain/chat`
  - Real-time chat functionality
  - Events:
    - `message`: Send/receive messages
    - `join`: Join chat room
    - `leave`: Leave chat room
    - `typing`: User typing indicator

### Notification Routes

- `GET /api/notifications`

  - Get user notifications
  - Requires: Authentication token
  - Query params: page, limit
  - Returns: Paginated list of notifications

- `PUT /api/notifications/:id/read`
  - Mark notification as read
  - Requires: Authentication token
  - Returns: Success message

### Report Routes

- `POST /api/reports`
  - Submit a report
  - Requires: Authentication token
  - Body: { type, targetId, reason, description }
  - Returns: Report object

### Recommendation Routes

- `GET /api/recommendations`
  - Get video recommendations
  - Requires: Authentication token
  - Returns: List of recommended videos

### Moderation Routes

- `GET /api/moderation/reports`

  - Get all reports (Admin only)
  - Requires: Admin authentication
  - Returns: List of reports

- `PUT /api/moderation/reports/:id`
  - Update report status (Admin only)
  - Requires: Admin authentication
  - Body: { status, action }
  - Returns: Updated report

## Error Handling

The application includes comprehensive error handling for:

- API errors
- Validation errors
- JWT errors
- Multer errors
- Database errors
- Generic errors
- 404 Not Found

## Testing

Run tests:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

## Security Features

- Rate limiting
- Input sanitization
- JWT authentication
- Password hashing
- CORS protection
- Error handling
- Request validation

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

ISC
