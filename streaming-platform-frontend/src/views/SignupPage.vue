<template>
  <div>
    <NavBar />
    <div class="container mt-5">
      <div class="row justify-content-center">
        <div class="col-md-6">
          <div class="card">
            <div class="card-body">
              <h3 class="card-title text-center">Sign Up</h3>
              <div v-if="error" class="alert alert-danger">{{ error }}</div>
              <form @submit.prevent="signup">
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
                  <label for="email" class="form-label">Email</label>
                  <input
                    type="email"
                    class="form-control"
                    id="email"
                    v-model="email"
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
                <div class="mb-3">
                  <label for="role" class="form-label">Role</label>
                  <select class="form-select" id="role" v-model="role" required>
                    <option value="viewer">Viewer</option>
                    <option value="streamer">Streamer</option>
                  </select>
                </div>
                <button type="submit" class="btn btn-primary w-100">
                  Sign Up
                </button>
              </form>
              <p class="mt-3 text-center">
                Already have an account?
                <router-link to="/login">Login</router-link>
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
  name: "SignUpPage",
  components: {
    NavBar,
  },
  data() {
    return {
      username: "",
      email: "",
      password: "",
      role: "viewer",
      error: null,
    };
  },
  methods: {
    async signup() {
      try {
        const response = await api.post("/auth/register", {
          username: this.username,
          email: this.email,
          password: this.password,
          role: this.role,
        });
        this.$store.dispatch("login", response.data);
        this.$socket.connect();
        this.$socket.emit("joinNotifications", response.data.user._id);
        this.$router.push("/");
      } catch (error) {
        console.error("Sign up error:", error);
        this.error =
          error.response?.data?.message ||
          "Failed to sign up. Please try again.";
      }
    },
  },
};
</script>
