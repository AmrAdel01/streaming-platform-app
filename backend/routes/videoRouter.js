const express = require("express");
const ApiError = require("./../utils/ApiError");
const multer = require("multer");
const path = require("path");
const fsPromises = require("fs").promises;
const {
  actionLimiter,
  uploadLimiter,
  searchLimiter,
} = require("../utils/rateLimiter");
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

// Standardized upload directory path
const uploadDir = path.join(__dirname, "../../Uploads/temp");
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit

// Ensure upload directory exists
const ensureUploadDir = async () => {
  try {
    await fsPromises.mkdir(uploadDir, { recursive: true });
  } catch (err) {
    console.error("Failed to create upload directory:", err);
    throw new ApiError("Failed to create upload directory", 500);
  }
};

// Cleanup function for failed uploads
const cleanupFailedUpload = async (filePath) => {
  try {
    await fsPromises.unlink(filePath);
    console.log(`Cleaned up failed upload: ${filePath}`);
  } catch (err) {
    console.error(`Failed to cleanup file ${filePath}:`, err);
  }
};

const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    try {
      await ensureUploadDir();
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
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
  limits: { fileSize: MAX_FILE_SIZE },
}).fields([
  { name: "video", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
]);

// Middleware to handle upload errors and cleanup
const handleUpload = (req, res, next) => {
  upload(req, res, async (err) => {
    if (err) {
      // Cleanup any uploaded files if there was an error
      if (req.files) {
        for (const field in req.files) {
          for (const file of req.files[field]) {
            await cleanupFailedUpload(file.path);
          }
        }
      }

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(
            new ApiError(
              `File size should not exceed ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
              400
            )
          );
        }
        return next(new ApiError(err.message, 400));
      }
      return next(err);
    }
    next();
  });
};

router.post("/upload", protect, uploadLimiter, handleUpload, uploadVideo);
router.get("/user-videos", protect, getUserVideos);
router.get("/search", searchLimiter, searchVideo);
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
