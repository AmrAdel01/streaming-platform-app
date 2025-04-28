const asyncHandler = require("express-async-handler");
const Notification = require("../model/Notification");
const mongoose = require("mongoose");
const ApiError = require("../utils/ApiError");

exports.createNotification = asyncHandler(
  async (userId, message, type, referenceId, referenceModel) => {
    if (
      ![
        "video_upload",
        "comment",
        "like",
        "follow",
        "live_stream",
        "video_pending",
        "video_approved",
        "video_rejected",
        "report_update",
        "transcode_failure",
      ].includes(type)
    ) {
      throw new ApiError("Invalid notification type", 400);
    }
    if (!mongoose.Types.ObjectId.isValid(referenceId)) {
      throw new ApiError("Invalid reference ID", 400);
    }
    if (!["Video", "Report"].includes(referenceModel)) {
      throw new ApiError("Invalid reference model", 400);
    }

    return await Notification.create({
      recipient: userId,
      message,
      type,
      referenceId,
      referenceModel,
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

  const notifications = await Notification.find({ recipient: userId })
    .populate({
      path: "referenceId",
      strictPopulate: false,
      model: (notification) => notification.referenceModel,
    })
    .sort({ createdAt: -1 })
    .limit(parsedLimit)
    .skip(parsedSkip)
    .lean()
    .select("message type referenceId referenceModel read createdAt");

  // Filter out notifications with invalid or deleted references
  const validNotifications = notifications.filter((n) => {
    if (!n.referenceId) {
      console.warn(`Notification ${n._id} has no valid reference`);
      return false;
    }
    return true;
  });

  const total = await Notification.countDocuments({
    recipient: userId,
    referenceId: { $exists: true },
  });

  const unread = await Notification.countDocuments({
    recipient: userId,
    read: false,
  });

  res.status(200).json({
    status: "success",
    message: "Notifications retrieved",
    data: { notifications: validNotifications, total, unread },
  });
});

exports.markAsRead = asyncHandler(async (req, res, next) => {
  const notificationId = req.params.id;
  const userId = req.user.id;

  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { read: true },
    { new: true }
  ).lean();

  if (!notification) {
    return next(new ApiError("Notification not found or unauthorized", 404));
  }

  res.status(200).json({
    status: "success",
    message: "Notification marked as read",
    data: { notification },
  });
});
