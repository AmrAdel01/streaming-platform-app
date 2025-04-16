import { createRouter, createWebHistory } from "vue-router";
import HomePage from "../views/HomePage.vue";
import VideoPlayer from "../views/VideoPlayer.vue";
import Login from "../views/LoginPage.vue";
import Signup from "../views/SignupPage.vue";
import Profile from "../views/ProfilePage.vue";

const routes = [
  {
    path: "/",
    name: "Home",
    component: HomePage,
  },
  {
    path: "/video/:id",
    name: "VideoPlayer",
    component: VideoPlayer,
  },
  {
    path: "/login",
    name: "Login",
    component: Login,
  },
  {
    path: "/signup",
    name: "Signup",
    component: Signup,
  },
  {
    path: "/profile/:id?",
    name: "Profile",
    component: Profile,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
