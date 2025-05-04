const express = require("express");
const {
  getModerationQueue,
  updateVideoStatus,
} = require("../controller/moderation");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// Admin-only middleware
const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

router.get("/queue", protect, adminOnly, getModerationQueue);
router.put("/queue/:id", protect, adminOnly, updateVideoStatus);

module.exports = router;
