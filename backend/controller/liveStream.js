const asyncHandler = require("express-async-handler");
const LiveStream = require("../model/LiveStream");
const { validationResult } = require("express-validator");
const sanitizeHtml = require("sanitize-html");
const chatModeration = require("../utils/chatModeration");

// @desc    Create a new live stream
// @route   POST /api/livestreams
// @access  Private
const createLiveStream = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array()[0].msg);
  }

  const {
    title,
    description,
    category,
    tags,
    isPublic,
    scheduledStartTime,
    recordingEnabled,
  } = req.body;

  // Create new live stream
  const liveStream = await LiveStream.create({
    title,
    description,
    category,
    tags: tags ? tags.split(",").map((tag) => tag.trim()) : [],
    isPublic,
    scheduledStartTime: scheduledStartTime
      ? new Date(scheduledStartTime)
      : null,
    recordingEnabled,
    user: req.user._id,
  });

  res.status(201).json({
    success: true,
    data: liveStream,
  });
});

// @desc    Get all live streams
// @route   GET /api/livestreams
// @access  Public
const getLiveStreams = asyncHandler(async (req, res) => {
  const { category, status, page = 1, limit = 10 } = req.query;

  // Build query
  const query = {};
  if (category) query.category = category;
  if (status) query.status = status;

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const liveStreams = await LiveStream.find(query)
    .populate("user", "username avatar")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await LiveStream.countDocuments(query);

  res.status(200).json({
    success: true,
    count: liveStreams.length,
    total,
    pages: Math.ceil(total / parseInt(limit)),
    data: liveStreams,
  });
});

// @desc    Get a single live stream
// @route   GET /api/livestreams/:id
// @access  Public
const getLiveStream = asyncHandler(async (req, res) => {
  const liveStream = await LiveStream.findById(req.params.id)
    .populate("user", "username avatar subscribers")
    .populate("chatMessages.user", "username avatar");

  if (!liveStream) {
    res.status(404);
    throw new Error("Live stream not found");
  }

  res.status(200).json({
    success: true,
    data: liveStream,
  });
});

// @desc    Update a live stream
// @route   PUT /api/livestreams/:id
// @access  Private
const updateLiveStream = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array()[0].msg);
  }

  const {
    title,
    description,
    category,
    tags,
    isPublic,
    scheduledStartTime,
    recordingEnabled,
    chatEnabled,
  } = req.body;

  const liveStream = await LiveStream.findById(req.params.id);

  if (!liveStream) {
    res.status(404);
    throw new Error("Live stream not found");
  }

  // Check if user is the owner of the stream
  if (liveStream.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Not authorized to update this stream");
  }

  // Check if stream is already live
  if (liveStream.status === "live") {
    res.status(400);
    throw new Error("Cannot update a live stream");
  }

  // Update fields
  liveStream.title = title || liveStream.title;
  liveStream.description = description || liveStream.description;
  liveStream.category = category || liveStream.category;
  liveStream.tags = tags
    ? tags.split(",").map((tag) => tag.trim())
    : liveStream.tags;
  liveStream.isPublic = isPublic !== undefined ? isPublic : liveStream.isPublic;
  liveStream.scheduledStartTime = scheduledStartTime
    ? new Date(scheduledStartTime)
    : liveStream.scheduledStartTime;
  liveStream.recordingEnabled =
    recordingEnabled !== undefined
      ? recordingEnabled
      : liveStream.recordingEnabled;
  liveStream.chatEnabled =
    chatEnabled !== undefined ? chatEnabled : liveStream.chatEnabled;

  const updatedLiveStream = await liveStream.save();

  res.status(200).json({
    success: true,
    data: updatedLiveStream,
  });
});

// @desc    Delete a live stream
// @route   DELETE /api/livestreams/:id
// @access  Private
const deleteLiveStream = asyncHandler(async (req, res) => {
  const liveStream = await LiveStream.findById(req.params.id);

  if (!liveStream) {
    res.status(404);
    throw new Error("Live stream not found");
  }

  // Check if user is the owner of the stream
  if (liveStream.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Not authorized to delete this stream");
  }

  // Check if stream is already live
  if (liveStream.status === "live") {
    res.status(400);
    throw new Error("Cannot delete a live stream");
  }

  await liveStream.remove();

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Start a live stream
// @route   PUT /api/livestreams/:id/start
// @access  Private
const startLiveStream = asyncHandler(async (req, res) => {
  const liveStream = await LiveStream.findById(req.params.id);

  if (!liveStream) {
    res.status(404);
    throw new Error("Live stream not found");
  }

  // Check if user is the owner of the stream
  if (liveStream.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Not authorized to start this stream");
  }

  // Check if stream is already live
  if (liveStream.status === "live") {
    res.status(400);
    throw new Error("Stream is already live");
  }

  // Update stream status
  liveStream.status = "live";
  liveStream.startedAt = new Date();

  const updatedLiveStream = await liveStream.save();

  // Emit socket event to notify viewers
  req.app.get("io").emit("stream:started", {
    streamId: liveStream._id,
    title: liveStream.title,
    user: {
      _id: req.user._id,
      username: req.user.username,
      avatar: req.user.avatar,
    },
  });

  res.status(200).json({
    success: true,
    data: updatedLiveStream,
  });
});

// @desc    End a live stream
// @route   PUT /api/livestreams/:id/end
// @access  Private
const endLiveStream = asyncHandler(async (req, res) => {
  const liveStream = await LiveStream.findById(req.params.id);

  if (!liveStream) {
    res.status(404);
    throw new Error("Live stream not found");
  }

  // Check if user is the owner of the stream
  if (liveStream.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Not authorized to end this stream");
  }

  // Check if stream is not live
  if (liveStream.status !== "live") {
    res.status(400);
    throw new Error("Stream is not live");
  }

  // Update stream status
  liveStream.status = "ended";
  liveStream.endedAt = new Date();

  const updatedLiveStream = await liveStream.save();

  // Emit socket event to notify viewers
  req.app.get("io").emit("stream:ended", {
    streamId: liveStream._id,
  });

  res.status(200).json({
    success: true,
    data: updatedLiveStream,
  });
});

// @desc    Add a chat message to a live stream
// @route   POST /api/livestreams/:id/chat
// @access  Private
const addChatMessage = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array()[0].msg);
  }

  const { message } = req.body;
  const streamId = req.params.id;

  // Get the live stream
  const liveStream = await LiveStream.findById(streamId);
  if (!liveStream) {
    res.status(404);
    throw new Error("Live stream not found");
  }

  // Check if chat is enabled
  if (!liveStream.chatEnabled) {
    res.status(400);
    throw new Error("Chat is disabled for this stream");
  }

  // Get recent messages for spam detection
  const recentMessages = liveStream.chatMessages
    .slice(-10)
    .map((msg) => msg.message);

  // Moderate the message
  const moderationResult = await chatModeration.moderateMessage(
    message,
    recentMessages
  );

  if (!moderationResult.isAllowed) {
    res.status(400);
    throw new Error(`Message rejected: ${moderationResult.reason}`);
  }

  // Create the chat message
  const chatMessage = {
    user: req.user._id,
    message: moderationResult.moderatedMessage,
    timestamp: new Date(),
  };

  // Add message to stream's chat history
  liveStream.chatMessages.push(chatMessage);
  await liveStream.save();

  // Emit the moderated message to all viewers
  req.app.get("io").to(`stream:${streamId}`).emit("stream:chat", {
    message: moderationResult.moderatedMessage,
    userId: req.user._id,
    username: req.user.username,
    avatar: req.user.avatar,
    timestamp: new Date(),
  });

  res.status(201).json({
    success: true,
    data: chatMessage,
  });
});

// @desc    Get stream key
// @route   GET /api/livestreams/:id/key
// @access  Private
const getStreamKey = asyncHandler(async (req, res) => {
  const liveStream = await LiveStream.findById(req.params.id);

  if (!liveStream) {
    res.status(404);
    throw new Error("Live stream not found");
  }

  // Check if user is the owner of the stream
  if (liveStream.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Not authorized to view this stream key");
  }

  res.status(200).json({
    success: true,
    data: {
      streamKey: liveStream.streamKey,
    },
  });
});

// @desc    Regenerate stream key
// @route   PUT /api/livestreams/:id/key
// @access  Private
const regenerateStreamKey = asyncHandler(async (req, res) => {
  const liveStream = await LiveStream.findById(req.params.id);

  if (!liveStream) {
    res.status(404);
    throw new Error("Live stream not found");
  }

  // Check if user is the owner of the stream
  if (liveStream.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Not authorized to regenerate this stream key");
  }

  // Generate new stream key
  liveStream.streamKey = generateStreamKey();

  await liveStream.save();

  res.status(200).json({
    success: true,
    data: {
      streamKey: liveStream.streamKey,
    },
  });
});

// Helper function to generate a random stream key
function generateStreamKey() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "";
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

module.exports = {
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
};
