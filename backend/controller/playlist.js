const asyncHandler = require("express-async-handler");
const Playlist = require("../model/Playlist");
const Video = require("../model/Video");
const ApiError = require("../utils/ApiError");
const { sanitizeInput } = require("../utils/sanitize");

exports.createPlaylist = asyncHandler(async (req, res, next) => {
  const { title, isPublic } = req.body;
  const userId = req.user.id;

  const sanitizedTitle = sanitizeInput(title);
  if (!sanitizedTitle) {
    return next(new ApiError("Playlist title is required", 400));
  }
  if (sanitizedTitle.length > 100) {
    return next(new ApiError("Title cannot exceed 100 characters", 400));
  }

  const playlist = await Playlist.create({
    title: sanitizedTitle,
    user: userId,
    isPublic: !!isPublic,
  });

  res.status(201).json({
    status: "success",
    message: "Playlist created successfully",
    data: { playlist },
  });
});

exports.getUserPlaylists = asyncHandler(async (req, res, next) => {
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

  const playlists = await Playlist.find({ user: userId })
    .populate("videos", "title thumbnail")
    .limit(parsedLimit)
    .skip(parsedSkip)
    .lean()
    .select("title isPublic videos createdAt");

  const total = await Playlist.countDocuments({ user: userId });

  res.status(200).json({
    status: "success",
    message: "User playlists retrieved successfully",
    data: { playlists, total, page: Math.ceil(parsedSkip / parsedLimit) + 1 },
  });
});

exports.getPublicPlaylists = asyncHandler(async (req, res, next) => {
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

  const playlists = await Playlist.find({ isPublic: true })
    .populate("user", "username")
    .populate("videos", "title thumbnail")
    .limit(parsedLimit)
    .skip(parsedSkip)
    .lean()
    .select("title user videos createdAt");

  const total = await Playlist.countDocuments({ isPublic: true });

  res.status(200).json({
    status: "success",
    message: "Public playlists retrieved successfully",
    data: { playlists, total, page: Math.ceil(parsedSkip / parsedLimit) + 1 },
  });
});

exports.getPlaylist = asyncHandler(async (req, res, next) => {
  const playlistId = req.params.id;
  const userId = req.user.id;

  const playlist = await Playlist.findById(playlistId)
    .populate("user", "username")
    .populate("videos", "title thumbnail duration uploader")
    .lean()
    .select("title user videos isPublic createdAt");

  if (!playlist) {
    return next(new ApiError("Playlist not found", 404));
  }

  if (!playlist.isPublic && playlist.user._id.toString() !== userId) {
    return next(new ApiError("Unauthorized to access this playlist", 403));
  }

  res.status(200).json({
    status: "success",
    message: "Playlist retrieved successfully",
    data: { playlist },
  });
});

exports.updatePlaylist = asyncHandler(async (req, res, next) => {
  const playlistId = req.params.id;
  const userId = req.user.id;
  const { title, isPublic } = req.body;

  const sanitizedTitle = sanitizeInput(title);
  if (sanitizedTitle && sanitizedTitle.length > 100) {
    return next(new ApiError("Title cannot exceed 100 characters", 400));
  }

  const playlist = await Playlist.findById(playlistId);
  if (!playlist) {
    return next(new ApiError("Playlist not found", 404));
  }
  if (playlist.user.toString() !== userId) {
    return next(new ApiError("Unauthorized to update this playlist", 403));
  }

  if (sanitizedTitle) playlist.title = sanitizedTitle;
  if (typeof isPublic === "boolean") playlist.isPublic = isPublic;

  await playlist.save();

  res.status(200).json({
    status: "success",
    message: "Playlist updated successfully",
    data: { playlist },
  });
});

exports.deletePlaylist = asyncHandler(async (req, res, next) => {
  const playlistId = req.params.id;
  const userId = req.user.id;

  const playlist = await Playlist.findById(playlistId);
  if (!playlist) {
    return next(new ApiError("Playlist not found", 404));
  }
  if (playlist.user.toString() !== userId) {
    return next(new ApiError("Unauthorized to delete this playlist", 403));
  }

  await Playlist.findByIdAndDelete(playlistId);

  res.status(200).json({
    status: "success",
    message: "Playlist deleted successfully",
    data: null,
  });
});

exports.addVideoToPlaylist = asyncHandler(async (req, res, next) => {
  const { playlistId, videoId } = req.params;
  const userId = req.user.id;

  const playlist = await Playlist.findById(playlistId);
  if (!playlist) {
    return next(new ApiError("Playlist not found", 404));
  }
  if (playlist.user.toString() !== userId) {
    return next(new ApiError("Unauthorized to modify this playlist", 403));
  }

  const video = await Video.findById(videoId);
  if (!video) {
    return next(new ApiError("Video not found", 404));
  }

  if (playlist.videos.includes(videoId)) {
    return next(new ApiError("Video already in playlist", 400));
  }

  playlist.videos.push(videoId);
  await playlist.save();

  res.status(200).json({
    status: "success",
    message: "Video added to playlist successfully",
    data: { playlist },
  });
});

exports.removeVideoFromPlaylist = asyncHandler(async (req, res, next) => {
  const { playlistId, videoId } = req.params;
  const userId = req.user.id;

  const playlist = await Playlist.findById(playlistId);
  if (!playlist) {
    return next(new ApiError("Playlist not found", 404));
  }
  if (playlist.user.toString() !== userId) {
    return next(new ApiError("Unauthorized to modify this playlist", 403));
  }

  if (!playlist.videos.includes(videoId)) {
    return next(new ApiError("Video not found in playlist", 400));
  }

  playlist.videos = playlist.videos.filter((id) => id.toString() !== videoId);
  await playlist.save();

  res.status(200).json({
    status: "success",
    message: "Video removed from playlist successfully",
    data: { playlist },
  });
});
