const mongoose = require("mongoose");

const reportSchema = mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Reporter is required"],
    },
    target: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "targetModel",
      required: [true, "Target is required"],
    },
    targetModel: {
      type: String,
      enum: ["Video", "Comment", "User"],
      required: [true, "Target model is required"],
    },
    reason: {
      type: String,
      required: [true, "Reason is required"],
      maxlength: [500, "Reason cannot exceed 500 characters"],
    },
    status: {
      type: String,
      enum: ["pending", "resolved", "dismissed"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

const reportModel = mongoose.model("Report", reportSchema);
module.exports = reportModel;
