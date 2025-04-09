const mongoose = require("mongoose");

const videoSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      unique: true,
    },
    filePath: {
      type: String,
      required: [true, "File path is required"],
    },
    uploader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: [],
      },
    ],
    dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Ensure dislikes field exists
    views: { type: Number, default: 0 },
    category: {
      type: String,
      enum: ["Gaming", "Music", "Tutorials", "Vlogs", "Other"],
      default: "Other",
    },
    comments: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    status: {
      type: String,
      enum: ["pending", "live", "removed"],
      default: "pending",
    }, // New field
  },

  {
    timestamps: true,
  }
);

const videoModel = mongoose.model("Video", videoSchema);

module.exports = videoModel;
