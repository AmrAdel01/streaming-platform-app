<template>
  <div>
    <NavBar />
    <div class="container mt-4">
      <h2>Trending Videos</h2>
      <div v-if="loading" class="text-center">
        <div class="spinner-border" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>
      <div v-else-if="error" class="alert alert-danger">{{ error }}</div>
      <div v-else class="row">
        <div v-for="video in videos" :key="video._id" class="col-md-4 mb-4">
          <VideoCard :video="video" />
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
  name: "HomePage",
  components: {
    NavBar,
    VideoCard,
  },
  data() {
    return {
      videos: [],
      loading: true,
      error: null,
    };
  },
  async created() {
    await this.fetchVideos();
  },
  methods: {
    async fetchVideos() {
      try {
        const response = await api.get("/videos/trending");
        this.videos = response.data.videos;
        this.loading = false;
      } catch (error) {
        console.error("Error fetching videos:", error);
        this.error = "Failed to load videos. Please try again later.";
        this.loading = false;
      }
    },
  },
};
</script>
