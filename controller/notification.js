const asyncHandler = require("express-async-handler");
const Notification = require("../model/Notification");
const mongoose = require("mongoose");
const ApiError = require("../utils/ApiError");

exports.createNotification = asyncHandler(
  async (userId, message, type, targetId, targetModel) => {
    if (
      ![
        "video_upload",
        "comment",
        "like",
        "follow",
        "live_stream",
        "video_pending", // Add this
        "video_approved",
        "video_rejected",
      ].includes(type)
    ) {
      throw new ApiError("Invalid notification type", 400);
    }
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      throw new ApiError("Invalid target ID", 400);
    }
    if (!["Video", "User", "Comment"].includes(targetModel)) {
      throw new ApiError("Invalid target model", 400);
    }

    return await Notification.create({
      user: userId,
      message,
      type,
      target: targetId,
      targetModel,
    });
  }
);

exports.getNotifications = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
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

  const notifications = await Notification.find({ user: userId })
    .populate({ path: "target", strictPopulate: false })
    .sort({ createdAt: -1 })
    .limit(parsedLimit)
    .skip(parsedSkip);

  const validNotifications = notifications.filter((n) => n.target);

  const total = validNotifications.length
    ? await Notification.countDocuments({
        user: userId,
        target: { $exists: true, $ne: null },
      })
    : 0;

  const unread = await Notification.countDocuments({
    user: userId,
    read: false,
  });

  res.status(200).json({
    message: "Notifications retrieved",
    notifications: validNotifications, // Return filtered notifications
    total,
    unread,
  });
});

exports.markAsRead = asyncHandler(async (req, res, next) => {
  const notificationId = req.params.id;
  const userId = req.user.id;

  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { read: true },
    { new: true }
  );

  if (!notification) {
    return next(new ApiError("Notification not found or unauthorized", 404));
  }

  res
    .status(200)
    .json({ message: "Notification marked as read", notification });
});
