const socketIO = require("socket.io");
const redisAdapter = require("socket.io-redis");

let io;

module.exports = {
  init: (httpServer) => {
    io = socketIO(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    // Integrate Redis for scaling Socket.IO
    io.adapter(redisAdapter({ host: "localhost", port: 6379 }));

    return io;
  },
  getIO: () => {
    if (!io) {
      throw new Error("Socket.io not initialized!");
    }
    return io;
  },
};
