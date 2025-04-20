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

// Load environment variables
const envResult = dotenv.config();
if (envResult.error) {
  console.error("Failed to load .env file:", envResult.error.message);
  process.exit(1);
}

if (!process.env.DB_URL) {
  console.error("DB_URL is not defined in .env file");
  process.exit(1);
}

if (!process.env.REDIS_URL) {
  console.error("REDIS_URL is not defined in .env file");
  process.exit(1);
}

const redisClient = redis.createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redisClient.on("error", (err) => {
  console.error("Redis Client Error:", err.message);
  if (err.code === "ENOTFOUND") {
    console.error("Ensure Redis is running on the specified host and port.");
  }
});

redisClient.on("connect", () => {
  console.log("Connected to Redis successfully");
});

const checkRedisVersion = async () => {
  try {
    const info = await redisClient.info("SERVER");
    const versionMatch = info.match(/redis_version:(\d+\.\d+\.\d+)/);
    if (!versionMatch || parseFloat(versionMatch[1]) < 5.0) {
      console.error(
        `Redis version must be >= 5.0.0, found: ${
          versionMatch ? versionMatch[1] : "unknown"
        }`
      );
      process.exit(1);
    }
    console.log(`Redis version verified: ${versionMatch[1]}`);
  } catch (err) {
    console.error("Failed to verify Redis version:", err.message);
    process.exit(1);
  }
};

redisClient
  .connect()
  .then(checkRedisVersion)
  .catch((err) => {
    console.error("Redis Connection Failed:", err.message);
    process.exit(1);
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
const globalMiddleware = require("./middleware/errorMiddleware");

const app = express();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

const corsOptions = {
  origin: process.env.CORS_ORIGIN || "http://localhost:8080",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "Range"],
  exposedHeaders: ["Content-Range", "Accept-Ranges"],
};

app.use(express.json());
app.use(sanitizeBody);
app.use(cors(corsOptions));
app.use("/uploads", express.static(path.join(__dirname, "Uploads")));
app.use(limiter);

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

app.use(globalMiddleware);

const server = http.createServer(app);
const port = process.env.PORT || 3000;

init(server);

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

  socket.on("disconnect", async () => {
    for (const room of socket.rooms) {
      if (room !== socket.id && !room.startsWith("user_")) {
        await redisClient.hIncrBy("videoViewers", room, -1);
        const count = await redisClient.hGet("videoViewers", room);
        getIO()
          .to(room)
          .emit("viewerCountUpdate", { room, count: parseInt(count) });
        if (count <= 0) await redisClient.hDel("videoViewers", room);
        await redisClient.expire("videoViewers", 24 * 60 * 60);
      }
    }
  });
});

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
