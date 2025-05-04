const mongoose = require("mongoose");

const liveStreamSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 5000,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["scheduled", "live", "ended", "failed"],
      default: "scheduled",
    },
    scheduledStartTime: {
      type: Date,
    },
    startedAt: {
      type: Date,
    },
    endedAt: {
      type: Date,
    },
    viewers: {
      type: Number,
      default: 0,
    },
    peakViewers: {
      type: Number,
      default: 0,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "Gaming",
        "Music",
        "Education",
        "Entertainment",
        "Sports",
        "Technology",
        "Other",
      ],
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    isPublic: {
      type: Boolean,
      default: true,
    },
    streamKey: {
      type: String,
      unique: true,
    },
    recordingEnabled: {
      type: Boolean,
      default: false,
    },
    recordingPath: {
      type: String,
    },
    chatEnabled: {
      type: Boolean,
      default: true,
    },
    chatMessages: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        message: {
          type: String,
          required: true,
          trim: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Generate a unique stream key before saving
liveStreamSchema.pre("save", function (next) {
  if (!this.streamKey) {
    this.streamKey = generateStreamKey();
  }
  next();
});

// Helper function to generate a random stream key
function generateStreamKey() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "";
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

const LiveStream = mongoose.model("LiveStream", liveStreamSchema);

module.exports = LiveStream;
