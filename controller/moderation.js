const asyncHandler = require("express-async-handler");
const Video = require("../model/Video");
const User = require("../model/User");
const ApiError = require("../utils/ApiError");
const { createNotification } = require("./notification");
const { getIO } = require("../utils/socket");
const { sanitizeInput } = require("../utils/sanitize");

exports.getModerationQueue = asyncHandler(async (req, res, next) => {
  const { limit = 10, skip = 0, category, uploader } = req.query;

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

  // Build query
  const query = { status: "pending" };
  if (category) {
    const sanitizedCategory = sanitizeInput(category);
    if (
      !["Gaming", "Music", "Tutorials", "Vlogs", "Other"].includes(
        sanitizedCategory
      )
    ) {
      return next(new ApiError("Invalid category", 400));
    }
    query.category = sanitizedCategory;
  }
  if (uploader) {
    const sanitizedUploader = sanitizeInput(uploader);
    const user = await User.findOne({ username: sanitizedUploader });
    if (!user) return next(new ApiError("Uploader not found", 404));
    query.uploader = user._id;
  }

  // Fetch videos
  const videos = await Video.find(query)
    .populate("uploader", "username email")
    .sort({ createdAt: 1 }) // Oldest first
    .limit(parsedLimit)
    .skip(parsedSkip);

  const total = await Video.countDocuments(query);

  res.status(200).json({
    message: "Moderation queue retrieved",
    videos,
    total,
    page: Math.ceil(parsedSkip / parsedLimit) + 1,
  });
});

exports.updateVideoStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { status, reason } = req.body;

  if (!["live", "removed"].includes(status)) {
    return next(
      new ApiError("Invalid status: must be 'live' or 'removed'", 400)
    );
  }

  const video = await Video.findById(id);
  if (!video) return next(new ApiError("Video not found", 404));
  if (video.status !== "pending") {
    return next(new ApiError("Video is not pending moderation", 400));
  }

  video.status = status;
  await video.save();

  // Notify uploader
  const streamer = await User.findById(video.uploader);
  const message =
    status === "live"
      ? `Your video "${video.title}" has been approved and is now live!`
      : `Your video "${video.title}" was rejected. Reason: ${
          sanitizeInput(reason) || "No reason provided"
        }`;
  const notification = await createNotification(
    streamer._id,
    message,
    status === "live" ? "video_approved" : "video_rejected",
    video._id,
    "Video"
  );
  getIO().to(streamer._id.toString()).emit("newNotification", notification);

  res.status(200).json({
    message: `Video ${status === "live" ? "approved" : "rejected"}`,
    video,
  });
});
