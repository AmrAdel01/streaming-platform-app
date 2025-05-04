const express = require("express");
const {
  createPlaylist,
  getUserPlaylists,
  getPlaylist,
  updatePlaylist,
  deletePlaylist,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  getPublicPlaylists,
} = require("../controller/playlist");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, createPlaylist);
router.get("/", protect, getUserPlaylists);
router.get("/public", getPublicPlaylists);
router.get("/:id", protect, getPlaylist);
router.put("/:id", protect, updatePlaylist);
router.delete("/:id", protect, deletePlaylist);
router.post("/:playlistId/videos/:videoId", protect, addVideoToPlaylist);
router.delete("/:playlistId/videos/:videoId", protect, removeVideoFromPlaylist);

module.exports = router;
