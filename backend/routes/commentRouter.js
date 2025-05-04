const express = require("express");
const { addComment, getComments } = require("../controller/comment");
const { protect } = require("../middleware/authMiddleware");
const router = express.Router({ mergeParams: true }); // For :id from parent route

router.post("/:id/comments", protect, addComment);
router.get("/:id/comments", getComments);

module.exports = router;
