const express = require("express");
const dotenv = require("dotenv");
const morgan = require("morgan");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");
const http = require("http");
const { init, getIO } = require("./utils/socket");
const redis = require("redis");
const sanitizeBody = require("./middleware/sanitizeMiddleware");
const transcodeWorker = require("./workers/transcodeWorker");
const chatModeration = require("./utils/chatModeration");
const { globalLimiter } = require("./utils/rateLimiter");
const {
  apiErrorHandler,
  validationErrorHandler,
  jwtErrorHandler,
  multerErrorHandler,
  databaseErrorHandler,
  genericErrorHandler,
  notFoundHandler,
} = require("./middleware/errorMiddleware");

// Load environment variables
const envResult = dotenv.config();
if (envResult.error) {
  console.error("Failed to load .env file:", envResult.error.message);
  process.exit(1);
}

// Debug email configuration
console.log("Email Configuration:");
console.log("EMAIL_HOST:", process.env.EMAIL_HOST);
console.log("EMAIL_PORT:", process.env.EMAIL_PORT);
console.log("EMAIL_SECURE:", process.env.EMAIL_SECURE);
console.log("EMAIL_USER:", process.env.EMAIL_USER);
console.log("EMAIL_PASSWORD:", process.env.EMAIL_PASSWORD ? "****" : "not set");

// Validate required environment variables
const requiredEnvVars = [
  "DB_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "NODE_ENV",
  "EMAIL_HOST",
  "EMAIL_PORT",
  "EMAIL_USER",
  "EMAIL_PASSWORD",
];

const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}`
  );
  process.exit(1);
}

// Redis configuration with reconnection strategy
const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error("Redis max reconnection attempts reached");
        return new Error("Redis max reconnection attempts reached");
      }
      return Math.min(retries * 100, 3000);
    },
  },
});

// Enhanced Redis error handling
redisClient.on("error", (err) => {
  console.error("Redis Client Error:", err.message);
  if (err.code === "ENOTFOUND") {
    console.error("Ensure Redis is running on the specified host and port.");
  }
  // Don't exit process on Redis errors, let reconnection strategy handle it
});

redisClient.on("connect", () => {
  console.log("Connected to Redis successfully");
});

redisClient.on("reconnecting", () => {
  console.log("Attempting to reconnect to Redis...");
});

redisClient.on("end", () => {
  console.log("Redis connection ended");
});

const checkRedisVersion = async () => {
  try {
    const info = await redisClient.info("SERVER");
    const versionMatch = info.match(/redis_version:(\d+\.\d+\.\d+)/);
    if (!versionMatch || parseFloat(versionMatch[1]) < 4.0) {
      // Relaxed version requirement
      console.warn(
        `Warning: Redis version should be >= 4.0.0, found: ${
          versionMatch ? versionMatch[1] : "unknown"
        }`
      );
    } else {
      console.log(`Redis version verified: ${versionMatch[1]}`);
    }
  } catch (err) {
    console.error("Failed to verify Redis version:", err.message);
    // Don't exit process on version check failure
  }
};

// Graceful shutdown function
const gracefulShutdown = async () => {
  console.log("Received shutdown signal. Starting graceful shutdown...");

  try {
    // Close Redis connection
    if (redisClient.isOpen) {
      await redisClient.quit();
      console.log("Redis connection closed");
    }

    // Close HTTP server
    server.close(() => {
      console.log("HTTP server closed");
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      console.error(
        "Could not close connections in time, forcefully shutting down"
      );
      process.exit(1);
    }, 10000);
  } catch (err) {
    console.error("Error during graceful shutdown:", err);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

redisClient
  .connect()
  .then(checkRedisVersion)
  .catch((err) => {
    console.error("Redis Connection Failed:", err.message);
    // Don't exit process on initial connection failure
  });

const dbConnection = require("./config/db");
const userRouter = require("./routes/auth");
const videoRouter = require("./routes/videoRouter");
const commentRouter = require("./routes/commentRouter");
const notificationRouter = require("./routes/notificationRouter");
const chatRouter = require("./routes/chatRouter");
const reportRouter = require("./routes/reportRouter");
const recommendationRouter = require("./routes/recommendationRouter");
const playlistRouter = require("./routes/playlistRouter");
const moderationRouter = require("./routes/moderationRouter");
const liveStreamRouter = require("./routes/liveStreamRouter");
const subtitleRouter = require("./routes/subtitleRouter");

const app = express();

const corsOptions = {
  origin: process.env.CORS_ORIGIN || "http://localhost:8080",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "Range"],
  exposedHeaders: ["Content-Range", "Accept-Ranges"],
  credentials: true,
  maxAge: 86400, // 24 hours
};

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.json());
app.use(sanitizeBody);
app.use(cors(corsOptions));
app.use("/uploads", express.static(path.join(__dirname, "Uploads")));
app.use(limiter);

// Apply global rate limiter to all routes
app.use(globalLimiter);

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
  console.log(`You are in ${process.env.NODE_ENV} mode.`);
}

app.get("/", (req, res) => res.send("Streaming server is running."));
app.use("/api/auth", sanitizeBody, userRouter);
app.use("/api/videos", sanitizeBody, videoRouter);
app.use("/api/videos", sanitizeBody, commentRouter);
app.use("/api/videos", sanitizeBody, chatRouter);
app.use("/api/playlists", sanitizeBody, playlistRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/reports", reportRouter);
app.use("/api/recommendations", recommendationRouter);
app.use("/api/moderation", moderationRouter);
app.use("/api/livestreams", sanitizeBody, liveStreamRouter);
app.use("/api/videos/:videoId/subtitles", subtitleRouter);

// Error handling middleware
app.use(notFoundHandler);
app.use(apiErrorHandler);
app.use(validationErrorHandler);
app.use(jwtErrorHandler);
app.use(multerErrorHandler);
app.use(databaseErrorHandler);
app.use(genericErrorHandler);

const server = http.createServer(app);
const port = process.env.PORT || 3000;

init(server);

// Store active WebRTC connections
const activeConnections = new Map();

getIO().on("connection", (socket) => {
  console.log("User connected");

  socket.on("joinNotifications", (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined their notification room`);
  });

  socket.on("joinVideo", async (videoId) => {
    socket.join(videoId);
    await redisClient.hIncrBy("videoViewers", videoId, 1);
    await redisClient.expire("videoViewers", 24 * 60 * 60);
    const count = await redisClient.hGet("videoViewers", videoId);
    getIO()
      .to(videoId)
      .emit("viewerCountUpdate", { videoId, count: parseInt(count) });
  });

  // Live streaming events
  socket.on("joinStream", async (streamId) => {
    socket.join(`stream:${streamId}`);
    await redisClient.hIncrBy("streamViewers", streamId, 1);
    await redisClient.expire("streamViewers", 24 * 60 * 60);
    const count = await redisClient.hGet("streamViewers", streamId);
    getIO()
      .to(`stream:${streamId}`)
      .emit("streamViewerCountUpdate", { streamId, count: parseInt(count) });

    // Update peak viewers if needed
    const peakViewers =
      (await redisClient.hGet("streamPeakViewers", streamId)) || 0;
    if (parseInt(count) > parseInt(peakViewers)) {
      await redisClient.hSet("streamPeakViewers", streamId, count);
    }
  });

  socket.on("leaveStream", async (streamId) => {
    socket.leave(`stream:${streamId}`);
    await redisClient.hIncrBy("streamViewers", streamId, -1);
    const count = await redisClient.hGet("streamViewers", streamId);
    getIO()
      .to(`stream:${streamId}`)
      .emit("streamViewerCountUpdate", { streamId, count: parseInt(count) });
  });

  // WebRTC signaling
  socket.on("webrtc:offer", (data) => {
    const { streamId, offer, userId } = data;
    socket.to(`stream:${streamId}`).emit("webrtc:offer", { offer, userId });
  });

  socket.on("webrtc:answer", (data) => {
    const { streamId, answer, userId } = data;
    socket.to(`stream:${streamId}`).emit("webrtc:answer", { answer, userId });
  });

  socket.on("webrtc:ice-candidate", (data) => {
    const { streamId, candidate, userId } = data;
    socket
      .to(`stream:${streamId}`)
      .emit("webrtc:ice-candidate", { candidate, userId });
  });

  socket.on("stream:chat", async (data) => {
    const { streamId, message, userId, username, avatar } = data;

    try {
      // Get recent messages for spam detection
      const liveStream = await LiveStream.findById(streamId);
      if (!liveStream) {
        socket.emit("chat:error", { message: "Stream not found" });
        return;
      }

      const recentMessages = liveStream.chatMessages
        .slice(-10)
        .map((msg) => msg.message);

      // Moderate the message
      const moderationResult = await chatModeration.moderateMessage(
        message,
        recentMessages
      );

      if (!moderationResult.isAllowed) {
        socket.emit("chat:error", {
          message: `Message rejected: ${moderationResult.reason}`,
        });
        return;
      }

      // Emit the moderated message
      getIO().to(`stream:${streamId}`).emit("stream:chat", {
        message: moderationResult.moderatedMessage,
        userId,
        username,
        avatar,
        timestamp: new Date(),
      });

      // If message was filtered, notify the sender
      if (moderationResult.reason === "Content filtered") {
        socket.emit("chat:warning", {
          message: "Your message was filtered for inappropriate content",
        });
      }
    } catch (error) {
      console.error("Chat moderation error:", error);
      socket.emit("chat:error", {
        message: "An error occurred while processing your message",
      });
    }
  });

  socket.on("error", (error) => {
    console.error("Socket error:", error);
  });

  socket.on("disconnect", async () => {
    try {
      for (const room of socket.rooms) {
        if (room !== socket.id && !room.startsWith("user_")) {
          if (room.startsWith("stream:")) {
            const streamId = room.replace("stream:", "");
            await redisClient.hIncrBy("streamViewers", streamId, -1);
            const count = await redisClient.hGet("streamViewers", streamId);
            getIO()
              .to(room)
              .emit("streamViewerCountUpdate", {
                streamId,
                count: parseInt(count),
              });
            if (count <= 0) await redisClient.hDel("streamViewers", streamId);
          } else {
            await redisClient.hIncrBy("videoViewers", room, -1);
            const count = await redisClient.hGet("videoViewers", room);
            getIO()
              .to(room)
              .emit("viewerCountUpdate", { room, count: parseInt(count) });
            if (count <= 0) await redisClient.hDel("videoViewers", room);
          }
          await redisClient.expire("videoViewers", 24 * 60 * 60);
          await redisClient.expire("streamViewers", 24 * 60 * 60);
        }
      }
    } catch (error) {
      console.error("Error in disconnect handler:", error);
    }
  });
});

// Make io instance available to routes
app.set("io", getIO());

const startServer = async () => {
  try {
    console.log("DB_URL:", process.env.DB_URL);
    await dbConnection();
    server.listen(port, () => {
      console.log(`Server running on port ${port}`);
      console.log(`Socket.IO ready on port ${port}`);
    });
  } catch (error) {
    console.error("Error starting server:", error.message);
    process.exit(1);
  }
};

startServer();
