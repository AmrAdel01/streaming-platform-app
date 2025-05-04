const express = require("express");
const { check } = require("express-validator");
const { protect } = require("../middleware/authMiddleware");
const {
  createLiveStream,
  getLiveStreams,
  getLiveStream,
  updateLiveStream,
  deleteLiveStream,
  startLiveStream,
  endLiveStream,
  addChatMessage,
  getStreamKey,
  regenerateStreamKey,
} = require("../controller/liveStream");

const router = express.Router();

// Validation middleware
const createStreamValidation = [
  check("title", "Title is required").not().isEmpty(),
  check("title", "Title must be between 3 and 100 characters").isLength({
    min: 3,
    max: 100,
  }),
  check("description", "Description must be less than 5000 characters")
    .optional()
    .isLength({ max: 5000 }),
  check("category", "Category is required").not().isEmpty(),
  check("category", "Invalid category").isIn([
    "Gaming",
    "Music",
    "Education",
    "Entertainment",
    "Sports",
    "Technology",
    "Other",
  ]),
  check("scheduledStartTime", "Invalid date format").optional().isISO8601(),
  check("recordingEnabled", "Recording enabled must be a boolean")
    .optional()
    .isBoolean(),
];

const updateStreamValidation = [
  check("title", "Title must be between 3 and 100 characters")
    .optional()
    .isLength({ min: 3, max: 100 }),
  check("description", "Description must be less than 5000 characters")
    .optional()
    .isLength({ max: 5000 }),
  check("category", "Invalid category")
    .optional()
    .isIn([
      "Gaming",
      "Music",
      "Education",
      "Entertainment",
      "Sports",
      "Technology",
      "Other",
    ]),
  check("scheduledStartTime", "Invalid date format").optional().isISO8601(),
  check("recordingEnabled", "Recording enabled must be a boolean")
    .optional()
    .isBoolean(),
  check("chatEnabled", "Chat enabled must be a boolean").optional().isBoolean(),
];

const chatMessageValidation = [
  check("message", "Message is required").not().isEmpty(),
  check("message", "Message must be less than 500 characters").isLength({
    max: 500,
  }),
];

// Public routes
router.get("/", getLiveStreams);
router.get("/:id", getLiveStream);

// Protected routes
router.post("/", protect, createStreamValidation, createLiveStream);
router.put("/:id", protect, updateStreamValidation, updateLiveStream);
router.delete("/:id", protect, deleteLiveStream);
router.put("/:id/start", protect, startLiveStream);
router.put("/:id/end", protect, endLiveStream);
router.post("/:id/chat", protect, chatMessageValidation, addChatMessage);
router.get("/:id/key", protect, getStreamKey);
router.put("/:id/key", protect, regenerateStreamKey);

module.exports = router;
