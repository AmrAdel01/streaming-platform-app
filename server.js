const express = require("express");
const dotenv = require("dotenv");
const morgan = require("morgan");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const http = require("http");
const { init } = require("./utils/scoket"); // Import from our new utility

dotenv.config();

const dbConnection = require("./config/db");
const userRouter = require("./routes/auth");
const videoRouter = require("./routes/videoRouter");
const commentRouter = require("./routes/commentRouter");
const globalMiddleware = require("./middleware/errorMiddleware");

const app = express();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
});

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static("public"));
app.use(limiter);

// Logging in development
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
  console.log(`You are in ${process.env.NODE_ENV} mode.`);
}

// Routes
app.get("/", (req, res) => res.send("Streaming server is running."));
app.use("/api/auth", userRouter);
app.use("/api/videos", videoRouter);
app.use("/api/videos", commentRouter);

// Error handling middleware
app.use(globalMiddleware);

// Create HTTP server
const server = http.createServer(app);
const port = process.env.PORT || 3000;

// Initialize Socket.IO
const io = init(server);

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("User connected");

  socket.on("joinVideo", (videoId) => {
    socket.join(videoId);
    console.log(`User joined video room: ${videoId}`);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

// Start server
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
