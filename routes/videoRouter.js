const express = require("express");
const ApiError = require("./../utils/ApiError"); // Add this at the top
const multer = require("multer");
const {
  uploadVideos,
  streamVideo,
  getUserVideos,
  deleteVideo,
  likeVideo,
  incrementViews,
  getVideosByCategory,
  searchVideo,
  dislikeVideo,
  postComment,
  toggleVideoStatus,
  getFollowedVideos,
  getShareLink,
  getVideoStats,
} = require("./../controller/video");
const { protect } = require("./../middleware/authMiddleware");

const router = express.Router({ mergeParams: true }); // For :id from parent route

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, new Date().toISOString().replace(/:/g, "-") + file.originalname);
  },
});

const fileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith("video/")) {
    return cb(new ApiError("Only video files are allowed", 400), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 1024 * 1024 * 50 },
});

router.post("/upload", upload.single("video"), protect, uploadVideos);

router.get("/user-videos", protect, getUserVideos);

router.get("/stream/:id", streamVideo);

router.delete("/:id", protect, deleteVideo);
router.post("/:id/like", protect, likeVideo);
router.get("/:id/views", incrementViews);
router.post("/:id/dislike", protect, dislikeVideo);
router.get("/category/:category", getVideosByCategory);
router.get("/search", searchVideo);
router.post("/:id/comment", protect, postComment);
router.put("/:id/status", protect, toggleVideoStatus);
router.get("/followed", protect, getFollowedVideos);
router.get("/:id/share", getShareLink);
router.get("/stats", protect, getVideoStats);

module.exports = router;
