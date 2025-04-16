const express = require("express");
const { sendMessage, getChatHistory } = require("../controller/chat");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router({ mergeParams: true });

router.post("/:id/chat", protect, sendMessage);
router.get("/:id/chat", getChatHistory);

module.exports = router;
