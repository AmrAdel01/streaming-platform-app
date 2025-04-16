const express = require("express");
const dotenv = require("dotenv");
const morgan = require("morgan");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");
const http = require("http");
const { init, getIO } = require("./utils/socket"); // Corrected typo
const redis = require("redis");
const sanitizeBody = require("./middleware/sanitizeMiddleware"); // Add this

dotenv.config();

const dbConnection = require("./config/db");
const userRouter = require("./routes/auth");
const videoRouter = require("./routes/videoRouter");
const commentRouter = require("./routes/commentRouter");
const notificationRouter = require("./routes/notificationRouter");
const chatRouter = require("./routes/chatRouter");
const reportRouter = require("./routes/reportRouter");
const recommendationRouter = require("./routes/recommendationRouter");
const playlistRouter = require("./routes/playlistRouter");
const moderationRouter = require("./routes/moderationRouter"); // Add this
const globalMiddleware = require("./middleware/errorMiddleware");

const app = express();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
const corsOptions = {
  origin: "http://localhost:8080", // Your frontend URL
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "Range"], // Include Range for video streaming
  exposedHeaders: ["Content-Range", "Accept-Ranges"], // Expose these for video streaming
};

app.use(express.json());
app.use(sanitizeBody); // Add sanitization middleware globally
app.use(cors(corsOptions));
// app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
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
app.use("/api/moderation", moderationRouter); // Add this

app.use(globalMiddleware);

const server = http.createServer(app);
const port = process.env.PORT || 3000;

// Initialize Socket.IO
init(server); // Call init without assigning to local io

// Track viewers per video
const videoViewers = new Map();

getIO().on("connection", (socket) => {
  console.log("User connected");

  socket.on("joinNotifications", (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined their notification room`);
  });
  const client = redis.createClient();
  socket.on("joinVideo", async (videoId) => {
    socket.join(videoId);
    await client.hIncrBy("videoViewers", videoId, 1);
    const count = await client.hGet("videoViewers", videoId);
    getIO()
      .to(videoId)
      .emit("viewerCountUpdate", { videoId, count: parseInt(count) });
  });
  socket.on("disconnect", async () => {
    for (const room of socket.rooms) {
      if (room !== socket.id) {
        await client.hIncrBy("videoViewers", room, -1);
        const count = await client.hGet("videoViewers", room);
        getIO()
          .to(room)
          .emit("viewerCountUpdate", { room, count: parseInt(count) });
        if (count <= 0) await client.hDel("videoViewers", room);
      }
    }
  });
});

const startServer = async () => {
  try {
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
