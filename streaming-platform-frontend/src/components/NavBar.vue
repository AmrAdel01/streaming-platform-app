<template>
  <nav class="navbar navbar-expand-lg navbar-light bg-light">
    <div class="container-fluid">
      <router-link class="navbar-brand" to="/">
        <img src="../assets/logo.png" alt="Logo" />
      </router-link>
      <button
        class="navbar-toggler"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#navbarNav"
        aria-controls="navbarNav"
        aria-expanded="false"
        aria-label="Toggle navigation"
      >
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="navbarNav">
        <ul class="navbar-nav me-auto">
          <li class="nav-item">
            <router-link class="nav-link" to="/">Home</router-link>
          </li>
          <li
            class="nav-item"
            v-if="isAuthenticated && user.role === 'streamer'"
          >
            <router-link class="nav-link" to="/upload"
              >Upload Video</router-link
            >
          </li>
          <li class="nav-item" v-if="isAuthenticated">
            <router-link class="nav-link" to="/playlists"
              >My Playlists</router-link
            >
          </li>
        </ul>
        <ul class="navbar-nav">
          <li class="nav-item" v-if="isAuthenticated">
            <router-link class="nav-link" :to="'/profile/' + user._id">
              {{ user.username }}
            </router-link>
          </li>
          <li class="nav-item" v-if="isAuthenticated">
            <button class="nav-link btn btn-link" @click="logout">
              Logout
            </button>
          </li>
          <li class="nav-item" v-else>
            <router-link class="nav-link" to="/login">Login</router-link>
          </li>
          <li class="nav-item" v-if="!isAuthenticated">
            <router-link class="nav-link" to="/signup">Sign Up</router-link>
          </li>
        </ul>
      </div>
    </div>
  </nav>
</template>

<script>
export default {
  name: "NavBar",
  computed: {
    isAuthenticated() {
      return this.$store.getters.isAuthenticated;
    },
    user() {
      return this.$store.getters.user || {};
    },
  },
  methods: {
    logout() {
      this.$store.dispatch("logout");
      this.$router.push("/login");
    },
  },
};
</script>
