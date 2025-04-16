import { io } from "socket.io-client";
import store from "../store";

let socket;

export function initSocket() {
  if (!socket) {
    socket = io("http://localhost:3000", {
      transports: ["websocket"],
      reconnection: true,
      auth: (cb) => {
        const token = store.getters.token;
        cb({ token });
      },
    });

    socket.on("connect", () => {
      console.log("Connected to Socket.IO server");
    });

    socket.on("connect_error", (error) => {
      console.error("Socket.IO connection error:", error);
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from Socket.IO server");
    });
  }
  return socket;
}

export function getSocket() {
  if (!socket) {
    return initSocket();
  }
  return socket;
}
