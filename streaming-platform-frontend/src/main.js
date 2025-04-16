import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import store from "./store";
import api from "./api/api";
import "bootstrap/dist/css/bootstrap.min.css";
import * as bootstrap from "bootstrap";
import { initSocket, getSocket } from "./utils/socket";
import "./assets/styles/global.css";

const app = createApp(App);

// Check for token and fetch user on app load
const token = localStorage.getItem("token");
if (token) {
  api
    .post("/auth/users/me")
    .then((response) => {
      const user = response.data.data.user;
      console.log("Fetched user on app load:", user);
      store.dispatch("login", { user, token });
      // Initialize Socket.IO after successful login
      const socket = initSocket();
      socket.connect();
    })
    .catch(() => {
      store.dispatch("logout");
    });
}

// Watch for authentication changes to manage Socket.IO connection
store.watch(
  (state) => state.auth.token,
  (newToken) => {
    const socket = getSocket();
    if (newToken) {
      socket.connect();
    } else {
      socket.disconnect();
    }
  }
);

app.use(router);
app.use(store);

// Make socket globally available
app.config.globalProperties.$socket = getSocket;

app.mount("#app");
app.config.globalProperties.$bootstrap = bootstrap;
