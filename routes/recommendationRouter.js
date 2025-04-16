const express = require("express");
const { getRecommendedVideos } = require("../controller/recommendation");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, getRecommendedVideos);

module.exports = router;
