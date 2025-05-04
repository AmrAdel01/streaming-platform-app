const asyncHandler = require("express-async-handler");
const Video = require("../model/Video");
const ApiError = require("../utils/ApiError");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs").promises;

// Upload subtitles for a video
exports.uploadSubtitles = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  const { language, label, isDefault } = req.body;

  if (!req.file) {
    return next(new ApiError("No subtitle file uploaded", 400));
  }

  const video = await Video.findById(videoId);
  if (!video) {
    return next(new ApiError("Video not found", 404));
  }

  // Check if user is the video owner or an admin
  if (video.uploader.toString() !== req.user.id && req.user.role !== "admin") {
    return next(new ApiError("Unauthorized", 403));
  }

  // Validate file extension
  const fileExt = path.extname(req.file.originalname).toLowerCase();
  const allowedFormats = [".vtt", ".srt", ".scc"];

  if (!allowedFormats.includes(fileExt)) {
    // Clean up the uploaded file
    await fsPromises.unlink(req.file.path);
    return next(
      new ApiError(
        "Invalid subtitle format. Allowed formats: VTT, SRT, SCC",
        400
      )
    );
  }

  // Determine format from extension
  const format = fileExt.substring(1);

  // Create subtitles directory if it doesn't exist
  const subtitlesDir = path.join("uploads", "subtitles", videoId);
  await fsPromises.mkdir(subtitlesDir, { recursive: true });

  // Generate unique filename
  const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
  const filename = `subtitle-${language}-${uniqueSuffix}${fileExt}`;
  const targetPath = path.join(subtitlesDir, filename);

  // Move file to final location
  await fsPromises.rename(req.file.path, targetPath);

  // If this is set as default, unset any other default subtitles
  if (isDefault) {
    video.subtitles.forEach((subtitle) => {
      subtitle.isDefault = false;
    });
  }

  // Add subtitle to video
  const subtitlePath = path.relative("uploads", targetPath);
  video.subtitles.push({
    language,
    label,
    path: subtitlePath,
    format,
    isDefault: isDefault || false,
  });

  await video.save();

  res.status(201).json({
    message: "Subtitles uploaded successfully",
    subtitle: {
      language,
      label,
      format,
      isDefault: isDefault || false,
      path: subtitlePath,
    },
  });
});

// Get subtitles for a video
exports.getSubtitles = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;

  const video = await Video.findById(videoId);
  if (!video) {
    return next(new ApiError("Video not found", 404));
  }

  res.status(200).json({
    message: "Subtitles retrieved successfully",
    subtitles: video.subtitles,
  });
});

// Delete subtitles
exports.deleteSubtitles = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  const { language } = req.params;

  const video = await Video.findById(videoId);
  if (!video) {
    return next(new ApiError("Video not found", 404));
  }

  // Check if user is the video owner or an admin
  if (video.uploader.toString() !== req.user.id && req.user.role !== "admin") {
    return next(new ApiError("Unauthorized", 403));
  }

  // Find the subtitle to delete
  const subtitleIndex = video.subtitles.findIndex(
    (sub) => sub.language === language
  );
  if (subtitleIndex === -1) {
    return next(new ApiError("Subtitle not found", 404));
  }

  const subtitle = video.subtitles[subtitleIndex];

  // Delete the file
  const filePath = path.join("uploads", subtitle.path);
  try {
    await fsPromises.unlink(filePath);
  } catch (err) {
    console.error(`Failed to delete subtitle file: ${err.message}`);
    // Continue with removing from database even if file deletion fails
  }

  // Remove from database
  video.subtitles.splice(subtitleIndex, 1);
  await video.save();

  res.status(200).json({
    message: "Subtitles deleted successfully",
  });
});

// Set default subtitle
exports.setDefaultSubtitle = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  const { language } = req.params;

  const video = await Video.findById(videoId);
  if (!video) {
    return next(new ApiError("Video not found", 404));
  }

  // Check if user is the video owner or an admin
  if (video.uploader.toString() !== req.user.id && req.user.role !== "admin") {
    return next(new ApiError("Unauthorized", 403));
  }

  // Find the subtitle to set as default
  const subtitleIndex = video.subtitles.findIndex(
    (sub) => sub.language === language
  );
  if (subtitleIndex === -1) {
    return next(new ApiError("Subtitle not found", 404));
  }

  // Unset all other default subtitles
  video.subtitles.forEach((subtitle) => {
    subtitle.isDefault = false;
  });

  // Set the selected subtitle as default
  video.subtitles[subtitleIndex].isDefault = true;
  await video.save();

  res.status(200).json({
    message: "Default subtitle set successfully",
    subtitle: video.subtitles[subtitleIndex],
  });
});
