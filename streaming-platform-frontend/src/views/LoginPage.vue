<template>
  <div>
    <NavBar />
    <div class="container mt-5">
      <div class="row justify-content-center">
        <div class="col-md-6">
          <div class="card">
            <div class="card-body">
              <h3 class="card-title text-center">Login</h3>
              <div v-if="error" class="alert alert-danger">{{ error }}</div>
              <form @submit.prevent="login">
                <div class="mb-3">
                  <label for="username" class="form-label">Username</label>
                  <input
                    type="text"
                    class="form-control"
                    id="username"
                    v-model="username"
                    required
                  />
                </div>
                <div class="mb-3">
                  <label for="password" class="form-label">Password</label>
                  <input
                    type="password"
                    class="form-control"
                    id="password"
                    v-model="password"
                    required
                  />
                </div>
                <button type="submit" class="btn btn-primary w-100">
                  Login
                </button>
              </form>
              <p class="mt-3 text-center">
                Don't have an account?
                <router-link to="/signup">Sign Up</router-link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import api from "../api/api";
import NavBar from "../components/NavBar.vue";

export default {
  name: "LoginPage",
  components: {
    NavBar,
  },
  data() {
    return {
      username: "",
      password: "",
      error: null,
    };
  },
  methods: {
    async login() {
      try {
        const response = await api.post("/auth/login", {
          username: this.username,
          password: this.password,
        });
        this.$store.dispatch("login", response.data);
        this.$socket.connect();
        this.$socket.emit("joinNotifications", response.data.user._id);
        this.$router.push("/");
      } catch (error) {
        console.error("Login error:", error);
        this.error =
          error.response?.data?.message || "Failed to login. Please try again.";
      }
    },
  },
};
</script>
