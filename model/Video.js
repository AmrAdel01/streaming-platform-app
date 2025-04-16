const mongoose = require("mongoose");

const videoSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      unique: true,
    },
    hlsPath: {
      type: String,
      required: [true, "HLS playlist path is required"],
    },
    uploader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    uploaderUsername: { type: String },
    thumbnail: {
      type: String,
      required: [true, "Thumbnail is required"],
    },
    duration: {
      type: Number,
      default: 0,
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: [],
      },
    ],
    dislikes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: [],
      },
    ],
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
        text: {
          type: String,
          required: true,
          maxlength: [500, "Comment cannot exceed 500 characters"],
        },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    status: {
      type: String,
      enum: ["pending", "live", "removed"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

// Add text index
videoSchema.index({
  title: "text",
  category: "text",
  uploaderUsername: "text",
});

// Pre-save hook to populate uploaderUsername
videoSchema.pre("save", async function (next) {
  if (this.isModified("uploader")) {
    const user = await mongoose.model("User").findById(this.uploader);
    this.uploaderUsername = user ? user.username : null;
  }
  next();
});

const videoModel = mongoose.model("Video", videoSchema);

module.exports = videoModel;
