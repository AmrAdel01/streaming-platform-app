<template>
  <div class="card">
    <img
      :src="
        video.thumbnail
          ? `http://localhost:3000${video.thumbnail}`
          : 'https://via.placeholder.com/320x180?text=Thumbnail'
      "
      class="card-img-top"
      alt="Video Thumbnail"
      @error="handleThumbnailError"
    />
    <div class="card-body">
      <h5 class="card-title">{{ video.title }}</h5>
      <p class="card-text">
        <router-link :to="'/profile/' + video.uploader._id">
          {{ video.uploader.username }}
        </router-link>
        • {{ video.views }} views • {{ formatDuration(video.duration) }}
      </p>
      <router-link :to="'/videos/stream/' + video._id" class="btn btn-primary">
        Watch Now
      </router-link>
    </div>
  </div>
</template>

<script>
export default {
  name: "VideoCard",
  props: {
    video: {
      type: Object,
      required: true,
    },
  },
  methods: {
    handleThumbnailError(event) {
      event.target.src = "https://via.placeholder.com/320x180?text=Thumbnail";
    },
    formatDuration(seconds) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      return `${minutes}:${
        remainingSeconds < 10 ? "0" : ""
      }${remainingSeconds}`;
    },
  },
};
</script>
