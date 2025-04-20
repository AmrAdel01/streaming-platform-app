const asyncHandler = require("express-async-handler");
const Comment = require("../model/Comment");
const Video = require("../model/Video");
const ApiError = require("../utils/ApiError");
const { sanitizeInput } = require("../utils/sanitize");

exports.addComment = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  const userId = req.user.id;
  const { text } = req.body;

  const sanitizedText = sanitizeInput(text);
  if (!sanitizedText) {
    return next(new ApiError("Comment text is required", 400));
  }
  if (sanitizedText.length > 500) {
    return next(new ApiError("Comment cannot exceed 500 characters", 400));
  }

  const video = await Video.findById(videoId);
  if (!video) {
    return next(new ApiError("Video not found", 404));
  }

  const comment = await Comment.create({
    text: sanitizedText,
    user: userId,
    video: videoId,
  });

  const populatedComment = await Comment.findById(comment._id)
    .populate("user", "username avatar")
    .lean()
    .select("text user createdAt");

  res.status(201).json({
    status: "success",
    message: "Comment added successfully",
    data: { comment: populatedComment },
  });
});

exports.getComments = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  const { limit = 20, skip = 0 } = req.query;

  const parsedLimit = parseInt(limit);
  const parsedSkip = parseInt(skip);
  if (
    isNaN(parsedLimit) ||
    parsedLimit < 1 ||
    isNaN(parsedSkip) ||
    parsedSkip < 0
  ) {
    return next(new ApiError("Invalid limit or skip parameters", 400));
  }

  const video = await Video.findById(videoId);
  if (!video) {
    return next(new ApiError("Video not found", 404));
  }

  const comments = await Comment.find({ video: videoId })
    .populate("user", "username avatar")
    .sort({ createdAt: -1 })
    .limit(parsedLimit)
    .skip(parsedSkip)
    .lean()
    .select("text user createdAt");

  const total = await Comment.countDocuments({ video: videoId });

  res.status(200).json({
    status: "success",
    message: "Comments retrieved successfully",
    data: { comments, total, page: Math.ceil(parsedSkip / parsedLimit) + 1 },
  });
});
