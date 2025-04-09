const fs = require("fs");
const asyncHandler = require("express-async-handler");
const ApiError = require("./../utils/ApiError");
const Video = require("./../model/Video");
const User = require("./../model/User");

exports.uploadVideos = asyncHandler(async (req, res, next) => {
  const { title, category } = req.body;
  if (!req.file) throw new ApiError("No video file uploaded", 400);
  const filePath = req.file.path;
  const userId = req.user.id;
  if (!title) throw new ApiError("Please provide title", 400);
  if (req.user.role !== "streamer") {
    return res
      .status(403)
      .json({ message: "Only streamers can upload videos" });
  }
  const video = await Video.create({
    title,
    filePath,
    uploader: userId,
    category,
    status: "pending", // Add this
  });
  res.status(201).json({
    message: "Video uploaded, awaiting review",
    videoId: video._id,
  });
});

exports.streamVideo = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  const video = await Video.findById(videoId);
  if (!video) return next(new ApiError("Video not found", 404));
  video.views += 1;
  await video.save();
  const filePath = video.filePath;
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": "video/mp4",
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

exports.deleteVideo = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  const userId = req.user.id;
  const video = await Video.findById(videoId);
  if (!video) return next(new ApiError("Video not found", 404));
  if (video.uploader.toString() !== userId)
    return next(new ApiError("Unauthorized", 403));
  try {
    await fs.promises.unlink(video.filePath).catch((err) => {
      console.error(`File deletion failed: ${err.message}`);
      throw new ApiError("File not found on server", 500);
    });
    await Video.findByIdAndDelete(videoId);
    res.status(204).json();
  } catch (err) {
    next(err);
  }
});

exports.getUserVideos = asyncHandler(async (req, res, next) => {
  const { limit = 10, skip = 0 } = req.query;
  const userId = req.user.id;
  let videos;
  if (req.user.role === "streamer") {
    videos = await Video.find({ uploader: userId })
      .populate("uploader", "username role")
      .limit(parseInt(limit))
      .skip(parseInt(skip));
  } else {
    const streamers = await User.find({ role: "streamer" }).select("_id");
    const streamerIds = streamers.map((s) => s._id);
    videos = await Video.find({
      uploader: { $in: streamerIds },
      status: "live",
    })
      .populate("uploader", "username role")
      .limit(parseInt(limit))
      .skip(parseInt(skip));
  }
  const total = await Video.countDocuments(
    req.user.role === "streamer"
      ? { uploader: userId }
      : { uploader: { $in: streamerIds }, status: "live" }
  );
  res.status(200).json({
    message: "Videos retrieved",
    videos,
    total,
    page: Math.ceil(skip / limit) + 1,
  });
});

exports.getVideosByCategory = asyncHandler(async (req, res, next) => {
  const { limit = 10, skip = 0 } = req.query;
  const { category } = req.params;
  const videos = await Video.find({ category })
    .populate("uploader", "username role")
    .populate("comments.user", "username")
    .limit(parseInt(limit))
    .skip(parseInt(skip));
  const total = await Video.countDocuments({ category });
  res.status(200).json({
    message: `Videos in category "${category}":`,
    videos,
    total,
    page: Math.ceil(skip / limit) + 1,
  });
});

exports.searchVideo = asyncHandler(async (req, res, next) => {
  const { query, limit = 10, skip = 0 } = req.query;
  const streamers = await User.find({ role: "streamer" }).select("_id");
  const streamerIds = streamers.map((s) => s._id);
  if (!query) return next(new ApiError("Please provide a search query", 400));
  const videos = await Video.find({
    uploader: { $in: streamerIds },
    $or: [
      { title: { $regex: query, $options: "i" } },
      { category: { $regex: query, $options: "i" } },
    ],
  })
    .populate("uploader", "username role")
    .populate("comments.user", "username")
    .limit(parseInt(limit))
    .skip(parseInt(skip));
  res.status(200).json({
    message: `Videos matching "${query}":`,
    videos,
  });
});

exports.likeVideo = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  const userId = req.user.id;
  const video = await Video.findById(videoId);
  if (!video) return next(new ApiError("Video not found", 404));
  const liked = video.likes.includes(userId);
  if (liked) {
    video.likes = video.likes.filter((id) => id.toString() !== userId);
  } else {
    video.likes.push(userId);
    video.dislikes = video.dislikes.filter((id) => id.toString() !== userId);
  }
  await video.save();
  res
    .status(200)
    .json({ message: liked ? "Unliked" : "Liked", likes: video.likes.length });
});

exports.dislikeVideo = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  const userId = req.user.id;
  const video = await Video.findById(videoId);
  if (!video) return next(new ApiError("Video not found", 404));
  const disliked = video.dislikes.includes(userId);
  if (disliked) {
    video.dislikes = video.dislikes.filter((id) => id.toString() !== userId);
  } else {
    video.dislikes.push(userId);
    video.likes = video.likes.filter((id) => id.toString() !== userId);
  }
  await video.save();

  res.status(200).json({
    message: disliked ? "Undisliked" : "Disliked",
    dislikes: video.dislikes.length,
  });
});

exports.incrementViews = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  const video = await Video.findById(videoId);
  if (!video) return next(new ApiError("Video not found", 404));
  video.views += 1;
  await video.save();
  res.status(200).json({ message: "View recorded", views: video.views });
});

exports.postComment = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  const userId = req.user.id;
  const { text } = req.body;

  if (!text) return next(new ApiError("Comment text is required", 400));

  const video = await Video.findById(videoId);
  if (!video) return next(new ApiError("Video not found", 404));

  video.comments.push({ user: userId, text });
  await video.save();

  // Populate the user field for the newly added comment
  const updatedVideo = await Video.findById(videoId).populate(
    "comments.user",
    "username"
  );

  res.status(201).json({
    message: "Comment posted",
    comments: updatedVideo.comments,
  });
});
// Allow streamers/admins to change status (add admin role if needed).
exports.toggleVideoStatus = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  const { status } = req.body;
  const video = await Video.findById(videoId);
  if (!video) return next(new ApiError("Video not found", 404));
  if (video.uploader.toString() !== req.user.id && req.user.role !== "admin") {
    return next(new ApiError("Unauthorized", 403));
  }
  if (!["pending", "live", "removed"].includes(status)) {
    return next(new ApiError("Invalid status", 400));
  }
  video.status = status;
  await video.save();
  res.status(200).json({ message: `Video status updated to ${status}`, video });
});

exports.getFollowedVideos = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id).populate("following");
  const followedIds = user.following.map((f) => f._id);
  const videos = await Video.find({
    uploader: { $in: followedIds },
    status: "live",
  }).populate("uploader", "username role");
  res.status(200).json({ message: "Videos from followed streamers", videos });
});

exports.getShareLink = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  const video = await Video.findById(videoId);
  if (!video) return next(new ApiError("Video not found", 404));
  const shareLink = `${process.env.BASE_URL}/videos/stream/${videoId}`;
  res.status(200).json({ message: "Shareable link", shareLink });
});

exports.getVideoStats = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  if (req.user.role !== "streamer")
    return next(new ApiError("Unauthorized", 403));
  const videos = await Video.find({ uploader: userId }).populate(
    "comments.user",
    "username"
  );
  const stats = videos.map((video) => ({
    videoId: video._id,
    title: video.title,
    views: video.views,
    likes: video.likes.length,
    dislikes: video.dislikes.length,
    comments: video.comments.length,
  }));
  res.status(200).json({ message: "Video stats", stats });
});
