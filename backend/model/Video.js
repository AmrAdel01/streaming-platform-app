const mongoose = require("mongoose");

const videoSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    hlsPath: {
      type: String,
    },
    filePath: {
      type: String,
      required: [true, "Original file path is required"],
    },
    uploader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    thumbnail: {
      type: String,
      default: "default-thumbnail.png",
    },
    duration: {
      type: Number,
      default: 0,
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    dislikes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    views: {
      type: Number,
      default: 0,
    },
    category: {
      type: String,
      enum: [
        "Music",
        "Gaming",
        "Education",
        "Movies",
        "Series",
        "Documentaries",
        "Technology ",
        "Fitness",
        "Cooking",
        "Travel",
        "Animation",
      ],
      default: "Other",
    },
    comments: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        text: {
          type: String,
          required: true,
          maxlength: [500, "Comment cannot exceed 500 characters"],
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    status: {
      type: String,
      enum: ["pending", "live", "removed", "failed"],
      default: "pending",
    },
    subtitles: [
      {
        language: {
          type: String,
          required: true,
        },
        label: {
          type: String,
          required: true,
        },
        path: {
          type: String,
          required: true,
        },
        format: {
          type: String,
          enum: ["vtt", "srt", "scc"],
          default: "vtt",
        },
        isDefault: {
          type: Boolean,
          default: false,
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    watchHistory: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        progress: {
          type: Number,
          default: 0,
        },
        watchedAt: {
          type: Date,
          default: Date.now,
        },
        deviceInfo: {
          type: {
            type: String,
            enum: ["mobile", "desktop", "tablet", "other"],
          },
          browser: String,
          os: String,
        },
        country: String,
      },
    ],
    analytics: {
      peakViewers: {
        type: Number,
        default: 0,
      },
      averageWatchTime: {
        type: Number,
        default: 0,
      },
      viewerRetention: [
        {
          percentage: Number,
          viewers: Number,
        },
      ],
      viewerDemographics: {
        countries: {
          type: Map,
          of: Number,
        },
        devices: {
          type: Map,
          of: Number,
        },
        qualityPreferences: {
          type: Map,
          of: Number,
        },
      },
      peakViewingTimes: {
        hours: [Number],
        days: [Number],
      },
    },
    metadata: {
      format: String,
      size: Number,
      bitrate: Number,
      resolution: {
        width: Number,
        height: Number,
      },
      fps: Number,
      audioCodec: String,
      videoCodec: String,
    },
  },
  {
    timestamps: true,
  }
);

videoSchema.index({ title: "text" });

const Video = mongoose.model("Video", videoSchema);

module.exports = Video;
