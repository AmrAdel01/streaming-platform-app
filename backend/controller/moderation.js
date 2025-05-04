const asyncHandler = require("express-async-handler");
const Video = require("../model/Video");
const User = require("../model/User");
const ApiError = require("../utils/ApiError");
const { createNotification } = require("./notification");
const { getIO } = require("../utils/socket");

exports.getModerationQueue = asyncHandler(async (req, res, next) => {
  const { limit = 10, skip = 0 } = req.query;

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

  const videos = await Video.find({ status: "pending" })
    .populate("uploader", "username")
    .sort({ createdAt: 1 })
    .limit(parsedLimit)
    .skip(parsedSkip)
    .lean()
    .select("title thumbnail uploader createdAt");

  const total = await Video.countDocuments({ status: "pending" });

  res.status(200).json({
    status: "success",
    message: "Moderation queue retrieved successfully",
    data: { videos, total, page: Math.ceil(parsedSkip / parsedLimit) + 1 },
  });
});

exports.updateVideoStatus = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  const { status, reason } = req.body;

  if (!["live", "removed"].includes(status)) {
    return next(
      new ApiError("Invalid status. Must be 'live' or 'removed'", 400)
    );
  }

  const video = await Video.findById(videoId);
  if (!video) {
    return next(new ApiError("Video not found", 404));
  }

  video.status = status;
  await video.save();

  const notificationType =
    status === "live" ? "video_approved" : "video_rejected";
  const message =
    status === "live"
      ? `Your video "${video.title}" has been approved`
      : `Your video "${video.title}" was rejected${
          reason ? `: ${reason}` : ""
        }`;

  const notification = await createNotification(
    video.uploader,
    message,
    notificationType,
    video._id,
    "Video"
  );

  getIO().to(video.uploader.toString()).emit("newNotification", notification);

  if (status === "live") {
    const streamer = await User.findById(video.uploader).populate("followers");
    const followers = streamer.followers || [];
    await Promise.all(
      followers.map(async (follower) => {
        const followerNotification = await createNotification(
          follower._id,
          `${streamer.username}'s video "${video.title}" is now live`,
          "live_stream",
          video._id,
          "Video"
        );
        getIO()
          .to(follower._id.toString())
          .emit("newNotification", followerNotification);
      })
    );
  }

  res.status(200).json({
    status: "success",
    message: `Video status updated to ${status}`,
    data: { video },
  });
});
