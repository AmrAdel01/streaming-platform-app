<template>
  <div>
    <NavBar />
    <div class="container mt-4">
      <h2 v-if="loading">Loading video...</h2>
      <div v-else-if="error" class="alert alert-danger">{{ error }}</div>
      <div v-else class="video-player-container">
        <!-- Video Player -->
        <div class="video-player-section">
          <video
            :id="`w-video_${video._id}`"
            controls
            class="video-player"
            :poster="
              video.thumbnail ? `http://localhost:3000${video.thumbnail}` : ''
            "
            @error="handleVideoError"
            autoplay
          ></video>
          <div class="video-info mt-3">
            <h3>{{ video.title }}</h3>
            <p class="text-muted">
              {{ video.uploader.username }} • {{ video.views }} views •
              {{ formatDuration(video.duration) }} •
              <span>{{ viewerCount }} viewers</span>
            </p>
            <div class="d-flex align-items-center action-buttons">
              <button
                class="btn btn-outline-success me-2"
                @click="likeVideo"
                :disabled="!isAuthenticated"
              >
                <i class="bi bi-hand-thumbs-up"></i> {{ video.likes.length }}
              </button>
              <button
                class="btn btn-outline-danger me-2"
                @click="dislikeVideo"
                :disabled="!isAuthenticated"
              >
                <i class="bi bi-hand-thumbs-down"></i>
                {{ video.dislikes.length }}
              </button>
              <button class="btn btn-outline-primary" @click="shareVideo">
                <i class="bi bi-share"></i> Share
              </button>
            </div>
          </div>
        </div>

        <!-- Live Chat Section -->
        <div class="live-chat-section">
          <h4>Live Chat</h4>
          <div v-if="!isAuthenticated" class="alert alert-info">
            Please <router-link to="/login">log in</router-link> to join the
            live chat.
          </div>
          <div v-else>
            <div class="chat-messages">
              <div
                v-for="(message, index) in chatMessages"
                :key="index"
                class="chat-message"
              >
                <div class="d-flex align-items-start">
                  <img
                    :src="
                      message.user.avatar
                        ? `http://localhost:3000${message.user.avatar}`
                        : 'https://via.placeholder.com/30?text=Avatar'
                    "
                    class="rounded-circle me-2 chat-avatar"
                    alt="User Avatar"
                    @error="handleAvatarError"
                  />
                  <div>
                    <strong>{{ message.user.username }}</strong>
                    <small class="text-muted ms-2">{{
                      formatTimestamp(message.timestamp)
                    }}</small>
                    <p class="mb-0">{{ message.message }}</p>
                  </div>
                </div>
              </div>
            </div>
            <div class="input-group mt-3">
              <input
                type="text"
                class="form-control"
                v-model="newChatMessage"
                placeholder="Type a message..."
                @keyup.enter="sendMessage"
              />
              <button class="btn btn-primary" @click="sendMessage">Send</button>
            </div>
          </div>
        </div>

        <!-- Comments Section -->
        <div class="comments-section mt-4">
          <h4>Comments ({{ video.comments.length }})</h4>
          <div v-if="video.comments.length === 0" class="alert alert-info">
            No comments yet. Be the first to comment!
          </div>
          <div v-else class="comments-list">
            <div
              v-for="comment in video.comments"
              :key="comment._id"
              class="comment mb-3"
            >
              <div class="d-flex align-items-center">
                <img
                  :src="`http://localhost:3000${comment.user.avatar}`"
                  class="rounded-circle me-2 comment-avatar"
                  alt="User Avatar"
                  @error="handleAvatarError"
                />
                <div>
                  <strong>{{ comment.user.username }}</strong>
                  <small class="text-muted ms-2">{{
                    new Date(comment.createdAt).toLocaleString()
                  }}</small>
                  <p class="mb-0">{{ comment.text }}</p>
                </div>
              </div>
            </div>
          </div>
          <div v-if="isAuthenticated" class="input-group mt-3">
            <input
              type="text"
              class="form-control"
              v-model="newComment"
              placeholder="Add a comment..."
              @keyup.enter="addComment"
            />
            <button class="btn btn-primary" @click="addComment">Post</button>
          </div>
          <p v-else class="text-muted mt-2">
            Please <router-link to="/login">log in</router-link> to comment.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import api from "../api/api";
import Hls from "hls.js";
import NavBar from "../components/NavBar.vue";

export default {
  name: "VideoPlayer",
  components: {
    NavBar,
  },
  data() {
    return {
      video: null,
      loading: true,
      error: null,
      newComment: "",
      newChatMessage: "",
      chatMessages: [],
      avatarError: false,
      viewerCount: 0,
      hls: null,
    };
  },
  computed: {
    videoUrl() {
      if (!this.video) return "";
      return `http://localhost:3000/api/videos/stream/${this.video._id}`;
    },
    isAuthenticated() {
      return this.$store.getters.isAuthenticated;
    },
    user() {
      return this.$store.getters.user || {};
    },
  },
  async created() {
    await this.fetchVideo();
    await this.incrementViews();
    if (this.isAuthenticated) {
      this.setupSocket();
      this.fetchViewerCount();
      this.viewerCountInterval = setInterval(this.fetchViewerCount, 10000);
    }
  },
  mounted() {
    this.setupHls();
  },
  beforeUnmount() {
    this.cleanupSocket();
    if (this.viewerCountInterval) {
      clearInterval(this.viewerCountInterval);
    }
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
  },
  methods: {
    async fetchVideo() {
      try {
        const videoId = this.$route.params.id;
        const response = await api.get(`/videos/${videoId}`);
        this.video = response.data.video;
        this.loading = false;
      } catch (error) {
        console.error("Error fetching video:", error);
        if (error.response && error.response.status === 404) {
          this.error = "Video not found. It may have been deleted.";
        } else {
          this.error = "Failed to load video. Please try again later.";
        }
        this.loading = false;
      }
    },
    async incrementViews() {
      try {
        const videoId = this.$route.params.id;
        await api.get(`/videos/${videoId}/views`);
      } catch (error) {
        console.error("Error incrementing views:", error);
      }
    },
    async fetchViewerCount() {
      try {
        const videoId = this.$route.params.id;
        const response = await api.get(`/videos/${videoId}/viewers`);
        this.viewerCount = response.data.count;
      } catch (error) {
        console.error("Error fetching viewer count:", error);
      }
    },
    setupHls() {
      if (!this.video) return;

      const videoElement = document.getElementById(`w-video_${this.video._id}`);
      if (!videoElement) {
        console.error("Video element not found");
        this.error = "Video player failed to initialize.";
        return;
      }

      if (Hls.isSupported()) {
        console.log("HLS.js is supported, initializing HLS...");
        this.hls = new Hls();
        this.hls.loadSource(this.videoUrl);
        this.hls.attachMedia(videoElement);
        this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log("HLS manifest parsed, starting playback...");
          videoElement.play().catch((err) => {
            console.error("Playback failed:", err);
            this.error = "Failed to start video playback.";
          });
        });
        this.hls.on(Hls.Events.ERROR, (event, data) => {
          console.error("HLS error:", data);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                this.error = "Network error: Failed to load video stream.";
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                this.error = "Media error: The video cannot be played.";
                break;
              default:
                this.error = "An error occurred while loading the video.";
                break;
            }
          }
        });
      } else if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
        console.log("Browser natively supports HLS, using native playback...");
        videoElement.src = this.videoUrl;
        videoElement.addEventListener("loadedmetadata", () => {
          videoElement.play().catch((err) => {
            console.error("Native playback failed:", err);
            this.error = "Failed to start video playback.";
          });
        });
      } else {
        console.error("HLS is not supported by this browser.");
        this.error = "Your browser does not support HLS streaming.";
      }
    },
    handleVideoError(event) {
      console.error("Video playback error:", event);
      this.error =
        "Failed to play the video. The file may be missing or corrupted.";
    },
    handleAvatarError(event) {
      event.target.src = "https://via.placeholder.com/30?text=Avatar";
      this.avatarError = true;
    },
    async addComment() {
      if (!this.newComment.trim() || !this.isAuthenticated) return;
      try {
        const response = await api.post(
          `/videos/${this.$route.params.id}/comment`,
          {
            text: this.newComment,
          }
        );
        this.video.comments.push(response.data.comment);
        this.newComment = "";
      } catch (error) {
        console.error("Error adding comment:", error);
        this.error = error.response?.data?.message || "Failed to post comment";
      }
    },
    async likeVideo() {
      if (!this.isAuthenticated) return;
      try {
        const response = await api.post(
          `/videos/${this.$route.params.id}/like`
        );
        this.video.likes = new Array(response.data.likes).fill(null);
        this.video.dislikes = new Array(response.data.dislikes).fill(null);
      } catch (error) {
        console.error("Error liking video:", error);
        this.error = error.response?.data?.message || "Failed to like video";
      }
    },
    async dislikeVideo() {
      if (!this.isAuthenticated) return;
      try {
        const response = await api.post(
          `/videos/${this.$route.params.id}/dislike`
        );
        this.video.likes = new Array(response.data.likes).fill(null);
        this.video.dislikes = new Array(response.data.dislikes).fill(null);
      } catch (error) {
        console.error("Error disliking video:", error);
        this.error = error.response?.data?.message || "Failed to dislike video";
      }
    },
    async shareVideo() {
      try {
        const response = await api.get(
          `/videos/${this.$route.params.id}/share`
        );
        const shareLink = response.data.shareLink;
        await navigator.clipboard.writeText(shareLink);
        alert("Share link copied to clipboard!");
      } catch (error) {
        console.error("Error generating share link:", error);
        this.error =
          error.response?.data?.message || "Failed to generate share link";
      }
    },
    formatDuration(seconds) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      return `${minutes}:${
        remainingSeconds < 10 ? "0" : ""
      }${remainingSeconds}`;
    },
    formatTimestamp(timestamp) {
      return new Date(timestamp).toLocaleTimeString();
    },
    setupSocket() {
      const videoId = this.$route.params.id;
      this.$socket.emit("join-video", videoId);

      this.$socket.on("receive-message", (message) => {
        this.chatMessages.push(message);
        this.$nextTick(() => {
          const chatContainer = this.$el.querySelector(".chat-messages");
          chatContainer.scrollTop = chatContainer.scrollHeight;
        });
      });
    },
    cleanupSocket() {
      const videoId = this.$route.params.id;
      this.$socket.emit("leave-video", videoId);
      this.$socket.off("receive-message");
    },
    sendMessage() {
      if (!this.newChatMessage.trim()) return;
      const videoId = this.$route.params.id;
      const messageData = {
        videoId,
        message: this.newChatMessage,
      };
      this.$socket.emit("send-message", messageData);
      this.newChatMessage = "";
    },
  },
};
</script>
