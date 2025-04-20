const asyncHandler = require("express-async-handler");
const ChatMessage = require("../model/ChatMessage");
const Video = require("../model/Video");
const ApiError = require("../utils/ApiError");
const { getIO } = require("../utils/socket");
const { sanitizeInput } = require("../utils/sanitize");

exports.sendMessage = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  const userId = req.user.id;
  const { text } = req.body;

  const sanitizedText = sanitizeInput(text, true);
  if (!sanitizedText) {
    return next(new ApiError("Message text is required or invalid", 400));
  }
  if (sanitizedText.length > 500) {
    return next(new ApiError("Message cannot exceed 500 characters", 400));
  }

  const video = await Video.findById(videoId);
  if (!video) {
    return next(new ApiError("Video not found", 404));
  }

  const recentMessages = await ChatMessage.countDocuments({
    user: userId,
    video: videoId,
    createdAt: { $gte: new Date(Date.now() - 60 * 1000) },
  });
  if (recentMessages >= 5) {
    return next(
      new ApiError("Rate limit exceeded. Please try again later.", 429)
    );
  }

  const message = await ChatMessage.create({
    video: videoId,
    user: userId,
    text: sanitizedText,
  });

  const populatedMessage = await ChatMessage.findById(message._id)
    .populate("user", "username")
    .lean();

  getIO().to(videoId).emit("newChatMessage", populatedMessage);

  res.status(201).json({
    status: "success",
    message: "Chat message sent",
    data: { chatMessage: populatedMessage },
  });
});

exports.getChatHistory = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  const { limit = 50, skip = 0 } = req.query;

  const video = await Video.findById(videoId);
  if (!video) {
    return next(new ApiError("Video not found", 404));
  }

  const messages = await ChatMessage.find({ video: videoId })
    .populate("user", "username")
    .sort({ createdAt: 1 })
    .limit(parseInt(limit))
    .skip(parseInt(skip))
    .lean()
    .select("text user createdAt");

  const total = await ChatMessage.countDocuments({ video: videoId });

  res.status(200).json({
    status: "success",
    message: "Chat history retrieved",
    data: { messages, total },
  });
});
