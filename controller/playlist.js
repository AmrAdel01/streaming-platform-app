const asyncHandler = require("express-async-handler");
const Playlist = require("../model/Playlist");
const Video = require("../model/Video");
const ApiError = require("../utils/ApiError");
const { sanitizeInput } = require("../utils/sanitize");

exports.createPlaylist = asyncHandler(async (req, res, next) => {
  const { title, isPublic } = req.body;
  const userId = req.user.id;

  const sanitizedTitle = sanitizeInput(title); // Sanitize title
  if (!sanitizedTitle) {
    return next(new ApiError("Playlist title is required or invalid", 400));
  }

  const playlist = await Playlist.create({
    title: sanitizedTitle, // Use sanitized title
    user: userId,
    isPublic: isPublic || false,
  });

  res.status(201).json({ message: "Playlist created", playlist });
});

exports.updatePlaylist = asyncHandler(async (req, res, next) => {
  const playlistId = req.params.id;
  const { title, isPublic } = req.body;

  const playlist = await Playlist.findById(playlistId);
  if (!playlist) return next(new ApiError("Playlist not found", 404));
  if (playlist.user.toString() !== req.user.id) {
    return next(new ApiError("Unauthorized", 403));
  }

  if (title) {
    const sanitizedTitle = sanitizeInput(title); // Sanitize title
    if (!sanitizedTitle) {
      return next(new ApiError("Invalid playlist title", 400));
    }
    playlist.title = sanitizedTitle;
  }
  if (typeof isPublic === "boolean") playlist.isPublic = isPublic;
  await playlist.save();

  res.status(200).json({ message: "Playlist updated", playlist });
});

exports.getUserPlaylists = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { limit = 10, skip = 0 } = req.query;

  const playlists = await Playlist.find({ user: userId })
    .populate("videos", "title thumbnail duration")
    .limit(parseInt(limit))
    .skip(parseInt(skip));

  const total = await Playlist.countDocuments({ user: userId });

  res.status(200).json({
    message: "User playlists retrieved",
    playlists,
    total,
    page: Math.ceil(skip / limit) + 1,
  });
});

exports.getPlaylist = asyncHandler(async (req, res, next) => {
  const playlistId = req.params.id;

  const playlist = await Playlist.findById(playlistId).populate(
    "videos",
    "title thumbnail duration uploader views"
  );
  if (!playlist) return next(new ApiError("Playlist not found", 404));

  // Allow access if owned or public
  if (
    playlist.user.toString() !== req.user.id &&
    !playlist.isPublic &&
    req.user.role !== "admin"
  ) {
    return next(new ApiError("Unauthorized", 403));
  }

  res.status(200).json({ message: "Playlist retrieved", playlist });
});

exports.deletePlaylist = asyncHandler(async (req, res, next) => {
  const playlistId = req.params.id;

  const playlist = await Playlist.findById(playlistId);
  if (!playlist) return next(new ApiError("Playlist not found", 404));
  if (playlist.user.toString() !== req.user.id) {
    return next(new ApiError("Unauthorized", 403));
  }

  await Playlist.findByIdAndDelete(playlistId);
  res.status(204).json();
});

exports.addVideoToPlaylist = asyncHandler(async (req, res, next) => {
  const { playlistId, videoId } = req.params;
  const userId = req.user.id;

  const playlist = await Playlist.findById(playlistId);
  if (!playlist) return next(new ApiError("Playlist not found", 404));
  if (playlist.user.toString() !== userId) {
    return next(new ApiError("Unauthorized", 403));
  }

  const video = await Video.findById(videoId);
  if (!video) return next(new ApiError("Video not found", 404));
  if (video.status !== "live" && req.user.role !== "admin") {
    return next(new ApiError("Video is not available", 403));
  }

  if (!playlist.videos.includes(videoId)) {
    playlist.videos.push(videoId);
    await playlist.save();
  }

  res.status(200).json({ message: "Video added to playlist", playlist });
});

exports.removeVideoFromPlaylist = asyncHandler(async (req, res, next) => {
  const { playlistId, videoId } = req.params;
  const userId = req.user.id;

  const playlist = await Playlist.findById(playlistId);
  if (!playlist) return next(new ApiError("Playlist not found", 404));
  if (playlist.user.toString() !== userId) {
    return next(new ApiError("Unauthorized", 403));
  }

  playlist.videos = playlist.videos.filter((id) => id.toString() !== videoId);
  await playlist.save();

  res.status(200).json({ message: "Video removed from playlist", playlist });
});

exports.getPublicPlaylists = asyncHandler(async (req, res, next) => {
  const { limit = 10, skip = 0 } = req.query;
  const playlists = await Playlist.find({ isPublic: true })
    .populate("user", "username")
    .populate("videos", "title thumbnail duration")
    .limit(parseInt(limit))
    .skip(parseInt(skip));
  const total = await Playlist.countDocuments({ isPublic: true });
  res
    .status(200)
    .json({ message: "Public playlists retrieved", playlists, total });
});
