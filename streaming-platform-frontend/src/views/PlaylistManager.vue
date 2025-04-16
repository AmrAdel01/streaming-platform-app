<template>
  <div>
    <NavBar />
    <div class="container mt-4">
      <h2>My Playlists</h2>
      <div v-if="!isAuthenticated" class="alert alert-info">
        Please <router-link to="/login">log in</router-link> to manage your
        playlists.
      </div>
      <div v-else>
        <div class="mb-3">
          <h4>Create New Playlist</h4>
          <div class="input-group">
            <input
              type="text"
              class="form-control"
              v-model="newPlaylistName"
              placeholder="Enter playlist name..."
            />
            <button class="btn btn-primary" @click="createPlaylist">
              Create
            </button>
          </div>
        </div>
        <div v-if="playlists.length === 0" class="alert alert-info">
          No playlists yet. Create one to get started!
        </div>
        <div v-else>
          <div
            v-for="playlist in playlists"
            :key="playlist.id"
            class="card mb-3"
          >
            <div class="card-body">
              <h5 class="card-title">{{ playlist.name }}</h5>
              <p
                v-if="playlist.videos.length === 0"
                class="card-text text-muted"
              >
                No videos in this playlist.
              </p>
              <div v-else class="row">
                <div
                  v-for="video in playlist.videos"
                  :key="video._id"
                  class="col-md-4 mb-4"
                >
                  <VideoCard :video="video" />
                </div>
              </div>
              <button
                class="btn btn-danger"
                @click="deletePlaylist(playlist.id)"
              >
                Delete Playlist
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import NavBar from "../components/NavBar.vue";
import VideoCard from "../components/VideoCard.vue";

export default {
  name: "PlaylistManager",
  components: {
    NavBar,
    VideoCard,
  },
  data() {
    return {
      playlists: [],
      newPlaylistName: "",
    };
  },
  computed: {
    isAuthenticated() {
      return this.$store.getters.isAuthenticated;
    },
  },
  methods: {
    createPlaylist() {
      if (!this.newPlaylistName.trim()) return;
      const newPlaylist = {
        id: Date.now().toString(),
        name: this.newPlaylistName,
        videos: [],
      };
      this.playlists.push(newPlaylist);
      this.newPlaylistName = "";
      // TODO: Save to backend when API is available
    },
    deletePlaylist(playlistId) {
      this.playlists = this.playlists.filter((p) => p.id !== playlistId);
      // TODO: Update backend when API is available
    },
  },
};
</script>
