const mongoose = require("mongoose");

const playlistSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Playlist title is required"],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    videos: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Video",
      },
    ],
    isPublic: {
      type: Boolean,
      default: false, // Private by default
    },
  },
  {
    timestamps: true,
  }
);

const playlistModel = mongoose.model("Playlist", playlistSchema);
module.exports = playlistModel;
