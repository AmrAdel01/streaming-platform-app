<template>
  <div>
    <NavBar />
    <div class="container mt-4">
      <div v-if="loading" class="text-center">
        <div class="spinner-border" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>
      <div v-else-if="error" class="alert alert-danger">{{ error }}</div>
      <div v-else>
        <div class="row">
          <div class="col-md-3 text-center">
            <img
              :src="
                user.avatar
                  ? `http://localhost:3000${user.avatar}`
                  : 'https://via.placeholder.com/150?text=Avatar'
              "
              class="rounded-circle mb-3"
              alt="User Avatar"
              @error="handleAvatarError"
              style="width: 150px; height: 150px"
            />
            <h3>{{ user.username }}</h3>
            <p>{{ user.role }}</p>
            <button
              v-if="isAuthenticated && user._id !== currentUser._id"
              class="btn btn-primary"
              @click="toggleFollow"
            >
              {{ isFollowing ? "Unfollow" : "Follow" }}
            </button>
          </div>
          <div class="col-md-9">
            <h4>Uploaded Videos</h4>
            <div v-if="videos.length === 0" class="alert alert-info">
              No videos uploaded yet.
            </div>
            <div v-else class="row">
              <div
                v-for="video in videos"
                :key="video._id"
                class="col-md-4 mb-4"
              >
                <VideoCard :video="video" />
              </div>
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
import VideoCard from "../components/VideoCard.vue";

export default {
  name: "ProfilePage",
  components: {
    NavBar,
    VideoCard,
  },
  data() {
    return {
      user: null,
      videos: [],
      loading: true,
      error: null,
      isFollowing: false,
    };
  },
  computed: {
    isAuthenticated() {
      return this.$store.getters.isAuthenticated;
    },
    currentUser() {
      return this.$store.getters.user || {};
    },
  },
  async created() {
    await this.fetchUser();
    await this.fetchVideos();
    if (this.isAuthenticated) {
      await this.checkFollowStatus();
    }
  },
  methods: {
    async fetchUser() {
      try {
        const userId = this.$route.params.id;
        const response = await api.get(`/auth/user/${userId}`);
        this.user = response.data.user;
        this.loading = false;
      } catch (error) {
        console.error("Error fetching user:", error);
        this.error = "Failed to load user profile.";
        this.loading = false;
      }
    },
    async fetchVideos() {
      try {
        const userId = this.$route.params.id;
        const response = await api.get("/videos/user-videos", {
          params: { userId },
        });
        this.videos = response.data.videos;
      } catch (error) {
        console.error("Error fetching videos:", error);
        this.error = "Failed to load videos.";
      }
    },
    async checkFollowStatus() {
      try {
        const response = await api.get(`/auth/following/${this.user._id}`);
        this.isFollowing = response.data.isFollowing;
      } catch (error) {
        console.error("Error checking follow status:", error);
      }
    },
    async toggleFollow() {
      try {
        if (this.isFollowing) {
          await api.post(`/auth/unfollow/${this.user._id}`);
          this.isFollowing = false;
        } else {
          await api.post(`/auth/follow/${this.user._id}`);
          this.isFollowing = true;
        }
      } catch (error) {
        console.error("Error toggling follow:", error);
        this.error = "Failed to update follow status.";
      }
    },
    handleAvatarError(event) {
      event.target.src = "https://via.placeholder.com/150?text=Avatar";
    },
  },
};
</script>
