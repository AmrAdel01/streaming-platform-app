const express = require("express");
const multer = require("multer");
const path = require("path");
const fsPromises = require("fs").promises;
const ApiError = require("../utils/ApiError");
const { protect } = require("../middleware/authMiddleware");
const {
  uploadSubtitles,
  getSubtitles,
  deleteSubtitles,
  setDefaultSubtitle,
} = require("../controller/subtitle");

const router = express.Router({ mergeParams: true });

// Configure multer for subtitle uploads
const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    const uploadDir = path.join(__dirname, "../../Uploads/temp");
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
    cb(null, `subtitle-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["text/vtt", "application/x-subrip", "text/plain"];
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(
      new ApiError("Only VTT, SRT, and SCC subtitle files are allowed", 400),
      false
    );
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Routes
router.get("/", getSubtitles);
router.post("/", protect, upload.single("subtitle"), uploadSubtitles);
router.delete("/:language", protect, deleteSubtitles);
router.put("/:language/default", protect, setDefaultSubtitle);

module.exports = router;
