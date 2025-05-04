const mongoose = require("mongoose");

const subtitleSchema = new mongoose.Schema({
  videoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Video",
    required: true,
  },
  language: {
    type: String,
    required: true,
  },
  filePath: {
    type: String,
    required: true,
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt timestamp before saving
subtitleSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

const Subtitle = mongoose.model("Subtitle", subtitleSchema);

module.exports = Subtitle;
