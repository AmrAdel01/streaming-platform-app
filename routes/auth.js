const express = require("express");
const multer = require("multer");
const {
  signup,
  login,
  updateProfile,
  getProfile,
  followUser,
  unfollowUser,
  getMe,
  createAdmin,
  getPreferences,
  updatePreferences,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerificationEmail,
  getWatchHistory,
  getWatchLater,
  addToWatchLater,
  removeFromWatchLater,
} = require("./../controller/user");
const {
  SignUpValidator,
  loginValidator,
  updateProfileValidator,
  resetPasswordValidator,
  forgotPasswordValidator,
} = require("./../utils/validator/userValidations");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// Authentication routes
router.route("/signup").post(upload.single("avatar"), SignUpValidator, signup);
router.route("/login").post(loginValidator, login);
router.post("/create-admin", createAdmin);

// Profile management routes
router.route("/users/me").get(protect, getMe);
router
  .route("/profile")
  .put(upload.single("avatar"), protect, updateProfileValidator, updateProfile);
router.route("/profile/:id").get(protect, getProfile);
router.route("/follow/:id").post(protect, followUser);
router.route("/unfollow/:id").post(protect, unfollowUser);

// User preferences routes
router.route("/preferences").get(protect, getPreferences);
router.route("/preferences").put(protect, updatePreferences);

// Password management routes
router.route("/forgot-password").post(forgotPasswordValidator, forgotPassword);
router.route("/reset-password").post(resetPasswordValidator, resetPassword);

// Email verification routes
router.route("/verify-email/:token").get(verifyEmail);
router.route("/resend-verification").post(protect, resendVerificationEmail);

// Watch history and watch later routes
router.route("/watch-history").get(protect, getWatchHistory);
router.route("/watch-later").get(protect, getWatchLater);
router.route("/watch-later/:videoId").post(protect, addToWatchLater);
router.route("/watch-later/:videoId").delete(protect, removeFromWatchLater);

module.exports = router;
