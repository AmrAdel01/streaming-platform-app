const socketIO = require("socket.io");
const redisAdapter = require("socket.io-redis");

let io;

module.exports = {
  init: (httpServer) => {
    io = socketIO(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"],
      },
    });

    io.adapter(
      redisAdapter({
        url: process.env.REDIS_URL || "redis://localhost:6379",
      })
    );

    return io;
  },
  getIO: () => {
    if (!io) {
      throw new Error("Socket.io not initialized!");
    }
    return io;
  },
};
