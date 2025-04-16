const express = require("express");
const { getNotifications, markAsRead } = require("../controller/notification");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, getNotifications);
router.put("/:id/read", protect, markAsRead);

module.exports = router;
