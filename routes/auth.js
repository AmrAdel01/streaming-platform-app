const express = require("express");
const multer = require("multer");
const {
  signup,
  login,
  updateProfile,
  getProfile,
  followUser,
  unfollowUser,
} = require("./../controller/user");
const {
  SignUpValidator,
  loginValidator,
} = require("./../utils/validator/userValidations");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

router.route("/signup").post(SignUpValidator, signup);
router.route("/login").post(loginValidator, login);
router.route("/profile").put(upload.single("avatar"), protect, updateProfile);
router.route("/profile/:id").get(protect, getProfile); // Fixed line
router.route("/follow/:id").post(protect, followUser);
router.route("/unfollow/:id").post(protect, unfollowUser);

module.exports = router;
