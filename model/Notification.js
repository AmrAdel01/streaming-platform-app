const mongoose = require("mongoose");

const notificationSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    message: {
      type: String,
      required: [true, "Message is required"],
    },
    type: {
      type: String,
      enum: [
        "video_upload",
        "live_stream",
        "follow",
        "comment",
        "report_update",
        "video_pending",
      ],
      required: true,
    },
    target: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "targetModel", // Dynamic reference
    },
    targetModel: {
      type: String,
      enum: ["Video", "User", "Comment"], // Models that can be targeted
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const notificationModel = mongoose.model("Notification", notificationSchema);
module.exports = notificationModel;
