const express = require("express");
const ApiError = require("./../utils/ApiError");
const multer = require("multer");
const path = require("path");
const fsPromises = require("fs").promises;
const rateLimit = require("express-rate-limit");
const {
  uploadVideo,
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
  getViewerCount,
  getTrendingVideos,
  getVideoDetails,
} = require("./../controller/video");
const { protect } = require("./../middleware/authMiddleware");

const router = express.Router({ mergeParams: true });

const actionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: "Too many actions, please try again later.",
});

const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    const uploadDir = path.join(__dirname, "../../Uploads");
    try {
      await fsPromises.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(new ApiError("Failed to create upload directory", 500));
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === "video") {
    const allowedVideoTypes = ["video/mp4", "video/webm"];
    if (!allowedVideoTypes.includes(file.mimetype)) {
      return cb(
        new ApiError("Only MP4 and WebM video files are allowed", 400),
        false
      );
    }
    cb(null, true);
  } else if (file.fieldname === "thumbnail") {
    const allowedImageTypes = ["image/jpeg", "image/png"];
    if (!allowedImageTypes.includes(file.mimetype)) {
      return cb(
        new ApiError(
          "Only JPG and PNG image files are allowed for thumbnail",
          400
        ),
        false
      );
    }
    cb(null, true);
  } else {
    cb(new ApiError("Unexpected field", 400), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 1024 * 1024 * 100 },
}).fields([
  { name: "video", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
]);

router.post("/upload", protect, actionLimiter, upload, uploadVideo);
router.get("/user-videos", protect, getUserVideos);
router.get("/search", searchVideo);
router.get("/stream/:id", streamVideo);
router.get("/:id/viewers", getViewerCount);
router.get("/trending", getTrendingVideos);
router.delete("/:id", protect, deleteVideo);
router.post("/:id/like", protect, actionLimiter, likeVideo);
router.get("/:id/views", incrementViews);
router.post("/:id/dislike", protect, actionLimiter, dislikeVideo);
router.get("/category/:category", getVideosByCategory);
router.post("/:id/comment", protect, actionLimiter, postComment);
router.put("/:id/status", protect, toggleVideoStatus);
router.get("/followed", protect, getFollowedVideos);
router.get("/:id/share", getShareLink);
router.get("/stats", protect, getVideoStats);
router.get("/:id", getVideoDetails);

module.exports = router;
