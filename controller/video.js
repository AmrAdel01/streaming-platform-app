const mongoose = require("mongoose");
const Video = require("./../model/Video");
const User = require("./../model/User");
const asyncHandler = require("express-async-handler");
const ApiError = require("./../utils/ApiError");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fsPromises = require("fs").promises; // For promise-based methods
const fs = require("fs");
const { getIO } = require("../utils/socket");
const { createNotification } = require("./notification");
const { transcodeVideo } = require("../utils/transcode");
const { sanitizeInput } = require("../utils/sanitize");

if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}

const generateThumbnail = async (videoPath, thumbnailPath) => {
  console.log("Generating thumbnail with FFmpeg...");
  console.log("Video path:", videoPath);
  console.log("Thumbnail path:", thumbnailPath);

  try {
    if (
      !(await fsPromises
        .access(videoPath)
        .then(() => true)
        .catch(() => false))
    ) {
      throw new Error("Video file does not exist at path: " + videoPath);
    }

    const uploadsDir = path.dirname(thumbnailPath);
    await fsPromises.mkdir(uploadsDir, { recursive: true });
    console.log("Ensured uploads directory exists:", uploadsDir);

    const duration = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata.format.duration);
      });
    });

    const timemark = duration < 5 ? "0" : "5";

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .on("end", () => {
          console.log("Thumbnail generated successfully");
          resolve();
        })
        .on("error", (err, stdout, stderr) => {
          console.error("FFmpeg thumbnail error:", err.message);
          console.error("FFmpeg stdout:", stdout);
          console.error("FFmpeg stderr:", stderr);
          reject(new Error(`Thumbnail generation failed: ${err.message}`));
        })
        .screenshots({
          count: 1,
          folder: path.dirname(thumbnailPath),
          filename: path.basename(thumbnailPath),
          size: "320x180",
          timemarks: [timemark],
        });
    });
  } catch (err) {
    throw new ApiError(`Thumbnail generation failed: ${err.message}`, 500);
  }
};

exports.uploadVideos = asyncHandler(async (req, res, next) => {
  const { title, category } = req.body;
  const userId = req.user.id;

  const sanitizedTitle = sanitizeInput(title);
  const sanitizedCategory = sanitizeInput(category);
  if (!sanitizedTitle) {
    return next(new ApiError("Please provide a valid title", 400));
  }
  if (req.user.role !== "streamer") {
    return res
      .status(403)
      .json({ message: "Only streamers can upload videos" });
  }

  if (!req.files || !req.files.video) {
    return next(new ApiError("No video file uploaded", 400));
  }

  const videoFile = req.files.video[0];
  const tempPath = videoFile.path;
  const videoId = new mongoose.Types.ObjectId().toString();

  const getDuration = (filePath) =>
    new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata.format.duration || 0);
      });
    });

  let duration = 0;
  try {
    duration = await getDuration(tempPath);
  } catch (err) {
    console.error(`Failed to get duration: ${err.message}`);
  }

  let thumbnailPath;
  try {
    if (req.files.thumbnail && req.files.thumbnail[0]) {
      thumbnailPath = `/uploads/${path.basename(req.files.thumbnail[0].path)}`;
      if (
        !(await fsPromises
          .access(req.files.thumbnail[0].path)
          .then(() => true)
          .catch(() => false))
      ) {
        throw new Error("Uploaded thumbnail is inaccessible");
      }
    } else {
      const thumbnailName = `thumbnail-${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}.jpg`;
      const thumbnailFullPath = path.join("uploads", thumbnailName);
      await generateThumbnail(tempPath, thumbnailFullPath);
      thumbnailPath = `/uploads/${thumbnailName}`;
    }
  } catch (error) {
    console.error("Thumbnail error:", error);
    await fsPromises
      .unlink(tempPath)
      .catch((err) => console.error("Failed to delete temp file:", err));
    return next(
      new ApiError(
        `Failed to generate or upload thumbnail: ${error.message}`,
        500
      )
    );
  }

  let hlsPath;
  try {
    console.log("Transcoding video with parameters:", {
      inputPath: tempPath,
      outputDir: "uploads/videos",
      videoId,
    });
    hlsPath = await transcodeVideo(tempPath, "uploads/videos", videoId);
    console.log("Transcoding succeeded, hlsPath:", hlsPath);

    const absoluteHlsPath = path.join(__dirname, "../", hlsPath);
    if (
      !(await fsPromises
        .access(absoluteHlsPath)
        .then(() => true)
        .catch(() => false))
    ) {
      throw new Error("HLS master playlist file not found after transcoding");
    }
  } catch (error) {
    console.error("Transcoding failed:", error);
    await fsPromises
      .unlink(tempPath)
      .catch((err) => console.error("Failed to delete temp file:", err));
    if (thumbnailPath && !req.files.thumbnail) {
      await fsPromises
        .unlink(path.join(__dirname, "../", thumbnailPath))
        .catch((err) => console.error("Failed to delete thumbnail:", err));
    }
    return next(
      new ApiError(`Failed to transcode video: ${error.message}`, 500)
    );
  }

  await fsPromises
    .unlink(tempPath)
    .catch((err) => console.error("Failed to delete temp file:", err));

  const video = await Video.create({
    title: sanitizedTitle,
    hlsPath,
    uploader: userId,
    category: sanitizedCategory || "Other",
    status: "pending",
    thumbnail: thumbnailPath,
    duration: Math.round(duration),
  });

  const streamer = await User.findById(userId).populate("followers");
  const followers = streamer.followers || [];
  await Promise.all(
    followers.map(async (follower) => {
      const notification = await createNotification(
        follower._id,
        `${streamer.username} uploaded a new video: ${sanitizedTitle}`,
        "video_upload",
        video._id,
        "Video"
      );
      getIO().to(follower._id.toString()).emit("newNotification", notification);
    })
  );

  const admins = await User.find({ role: "admin" });
  await Promise.all(
    admins.map(async (admin) => {
      const notification = await createNotification(
        admin._id,
        `New video "${sanitizedTitle}" by ${streamer.username} awaits moderation`,
        "video_pending",
        video._id,
        "Video"
      );
      getIO().to(admin._id.toString()).emit("newNotification", notification);
    })
  );

  res.status(201).json({
    message: "Video uploaded and transcoded, awaiting review",
    videoId: video._id,
  });
});

exports.streamVideo = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  console.log("Streaming video with ID:", videoId);
  console.log("Request path:", req.path);

  const video = await Video.findById(videoId);
  if (!video) {
    console.error("Video not found for ID:", videoId);
    return next(new ApiError("Video not found", 404));
  }

  const hlsPath = video.hlsPath;
  console.log("Stored hlsPath:", hlsPath);

  // Construct the base directory of the HLS files
  const hlsBaseDir = path.dirname(hlsPath); // e.g., "uploads/videos/12345"
  let requestedPath;

  // Check if the request is for the master playlist or a segment
  const pathParts = req.path.split("/stream/")[1]; // e.g., "12345" or "12345/v0/segment_000.ts"
  const isMasterRequest = pathParts === videoId; // Request for master playlist (e.g., "/api/videos/stream/12345")

  if (isMasterRequest) {
    requestedPath = hlsPath; // Master playlist (e.g., "uploads/videos/12345/master.m3u8")
  } else {
    // For segment files (e.g., "/api/videos/stream/12345/v0/segment_000.ts")
    const segmentPath = pathParts; // e.g., "12345/v0/segment_000.ts"
    requestedPath = path.join(
      hlsBaseDir,
      segmentPath.split("/").slice(1).join("/")
    ); // e.g., "uploads/videos/12345/v0/segment_000.ts"
  }

  // Convert to absolute path
  const absolutePath = path.join(__dirname, "../", requestedPath);
  console.log("Attempting to access file at:", absolutePath);

  // Check if the path exists
  if (
    !(await fsPromises
      .access(absolutePath)
      .then(() => true)
      .catch(() => false))
  ) {
    console.error("HLS file not found at path:", absolutePath);
    return next(new ApiError("HLS file not found", 404));
  }

  // Check if the path is a file, not a directory
  const stats = await fsPromises.stat(absolutePath);
  if (stats.isDirectory()) {
    console.error("Requested path is a directory, not a file:", absolutePath);
    return next(new ApiError("Requested path is a directory", 400));
  }

  const ext = path.extname(absolutePath);
  const contentType =
    ext === ".m3u8"
      ? "application/vnd.apple.mpegurl"
      : ext === ".ts"
      ? "video/mp2t"
      : "application/octet-stream";

  // Add range request support for .ts files
  if (ext === ".ts") {
    const fileSize = stats.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const fileStream = fs.createReadStream(absolutePath, { start, end });
      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": contentType,
      };
      res.writeHead(206, head);
      fileStream.pipe(res);
    } else {
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", fileSize);
      const fileStream = fs.createReadStream(absolutePath);
      fileStream.pipe(res);
    }
  } else {
    res.setHeader("Content-Type", contentType);
    const fileStream = fs.createReadStream(absolutePath);
    fileStream.pipe(res);
  }

  video.views += 1;
  await video.save();
});

exports.deleteVideo = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  const userId = req.user.id;
  const video = await Video.findById(videoId);
  if (!video) return next(new ApiError("Video not found", 404));
  if (video.uploader.toString() !== userId)
    return next(new ApiError("Unauthorized", 403));

  try {
    const hlsDir = path.dirname(video.hlsPath);
    await fsPromises
      .rm(hlsDir, { recursive: true, force: true })
      .catch((err) => {
        console.error(`HLS directory deletion failed: ${err.message}`);
      });

    await fsPromises.unlink(video.thumbnail).catch((err) => {
      console.error(`Thumbnail deletion failed: ${err.message}`);
    });

    await Video.findByIdAndDelete(videoId);
    res.status(204).json();
  } catch (err) {
    next(new ApiError("Failed to delete video files", 500));
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
    videos, // thumbnail and duration are included automatically
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

  const sanitizedQuery = sanitizeInput(query);
  if (!sanitizedQuery) {
    return next(new ApiError("Please provide a valid search query", 400));
  }

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

  // Escape special characters for $text search
  const escapedQuery = sanitizedQuery.replace(
    /[-[\]{}()*+?.,\\^$|#\s]/g,
    "\\$&"
  );

  const streamers = await User.find({ role: "streamer" }).select("_id");
  const streamerIds = streamers.map((s) => s._id);

  let videos;
  try {
    videos = await Video.find({
      $text: { $search: escapedQuery },
      uploader: { $in: streamerIds },
      status: "live",
    })
      .populate("uploader", "username role")
      .populate("comments.user", "username")
      .sort({ score: { $meta: "textScore" } })
      .limit(parsedLimit)
      .skip(parsedSkip);
  } catch (error) {
    if (error.message.includes("text index required")) {
      return next(new ApiError("Text search index is missing", 500));
    }
    return next(new ApiError("Search failed", 500));
  }

  const total = await Video.countDocuments({
    $text: { $search: escapedQuery },
    uploader: { $in: streamerIds },
    status: "live",
  });

  res.status(200).json({
    message: `Videos matching "${sanitizedQuery}"`,
    videos,
    total,
    page: Math.ceil(parsedSkip / parsedLimit) + 1,
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
  res.status(200).json({
    message: liked ? "Unliked" : "Liked",
    likes: video.likes.length,
    dislikes: video.dislikes.length,
  });
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
    likes: video.likes.length,
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

  const sanitizedText = sanitizeInput(text);
  if (!sanitizedText)
    return next(new ApiError("Comment text is required", 400));
  if (sanitizedText.length > 500)
    return next(new ApiError("Comment cannot exceed 500 characters", 400));

  const video = await Video.findById(videoId);
  if (!video) return next(new ApiError("Video not found", 404));

  const newComment = { user: userId, text: sanitizedText };
  video.comments.push(newComment);
  await video.save();

  const updatedVideo = await Video.findById(videoId).populate(
    "comments.user",
    "username avatar"
  );

  const addedComment = updatedVideo.comments[updatedVideo.comments.length - 1];

  res.status(201).json({
    message: "Comment posted",
    comment: {
      _id: addedComment._id,
      user: addedComment.user,
      text: addedComment.text,
      createdAt: addedComment.createdAt,
    },
  });
});

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

  // Notify followers when video goes live
  if (status === "live") {
    const streamer = await User.findById(video.uploader).populate("followers");
    const followers = streamer.followers;
    for (const follower of followers) {
      const notification = await createNotification(
        follower._id,
        `${streamer.username} is now live with: ${video.title}`,
        "live_stream",
        video._id,
        "Video"
      );
      getIO().to(follower._id.toString()).emit("newNotification", notification);
    }
  }

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

exports.getViewerCount = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  const video = await Video.findById(videoId);
  if (!video) return next(new ApiError("Video not found", 404));

  const io = getIO();
  const viewers = io.sockets.adapter.rooms.get(videoId);
  const viewerCount = viewers ? viewers.size : 0;

  res.status(200).json({
    message: "Viewer count retrieved",
    videoId,
    count: viewerCount,
  });
});
exports.getTrendingVideos = asyncHandler(async (req, res, next) => {
  const { limit = 6 } = req.query; // Default to 6 videos if limit is not provided
  const videos = await Video.find({ status: "live" })
    .sort({ views: -1, createdAt: -1 }) // Sort by views (descending) and creation date (descending)
    .limit(parseInt(limit))
    .populate("uploader", "username"); // Populate uploader's username
  res.status(200).json({
    videos,
  });
});

exports.getVideoDetails = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  const video = await Video.findById(videoId)
    .populate("uploader", "username avatar")
    .populate("comments.user", "username avatar"); // Add this to populate comment users
  if (!video) {
    return next(new ApiError("Video not found", 404));
  }
  res.status(200).json({
    video,
  });
});
