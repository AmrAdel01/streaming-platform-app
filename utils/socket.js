const socketIO = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { getRedisClient } = require("./redis");

let io;

module.exports = {
  init: async (httpServer) => {
    io = socketIO(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"],
      },
    });

    try {
      const pubClient = await getRedisClient();
      const subClient = pubClient.duplicate();
      await subClient.connect();

      io.adapter(createAdapter(pubClient, subClient));
      console.log("Socket.IO Redis adapter initialized");
    } catch (err) {
      console.error(
        "Failed to initialize Socket.IO Redis adapter:",
        err.message
      );
      process.exit(1);
    }

    return io;
  },
  getIO: () => {
    if (!io) {
      throw new Error("Socket.io not initialized!");
    }
    return io;
  },
};
