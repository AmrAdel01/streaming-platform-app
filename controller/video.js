const mongoose = require("mongoose");
const Video = require("../model/Video");
const User = require("../model/User");
const asyncHandler = require("express-async-handler");
const ApiError = require("./../utils/ApiError");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs").promises;
const { Queue } = require("bullmq");
const { getIO } = require("../utils/socket");
const { createNotification } = require("./notification");
const { sanitizeInput } = require("../utils/sanitize");
// const { getRedisClient } = require("../utils/redis");
const redisClient = require("../utils/redis");

// Constants for video validation
const ALLOWED_FORMATS = ["mp4", "mov", "avi", "mkv", "webm"];
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 1000;

const transcodeQueue = new Queue("transcodeQueue", { connection: redisClient });

const generateThumbnail = async (videoPath, outputDir, options = {}) => {
  console.log("Generating thumbnail with FFmpeg...");
  console.log("Video path:", videoPath);
  console.log("Output directory:", outputDir);

  const { time = 5, size = "320x180" } = options;

  const ffmpeg = require("fluent-ffmpeg");
  if (process.env.FFMPEG_PATH) {
    ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
  }

  try {
    if (
      !(await fsPromises
        .access(videoPath)
        .then(() => true)
        .catch(() => false))
    ) {
      throw new Error("Video file does not exist at path: " + videoPath);
    }

    // Ensure output directory exists
    await fsPromises.mkdir(outputDir, { recursive: true });
    console.log("Ensured output directory exists:", outputDir);

    // Generate a unique filename for the thumbnail
    const thumbnailName = `thumbnail-${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}.jpg`;
    const thumbnailPath = path.join(outputDir, thumbnailName);

    const duration = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata.format.duration);
      });
    });

    const timemark = duration < time ? "0" : time.toString();

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .on("end", () => {
          console.log("Thumbnail generated successfully at:", thumbnailPath);
          resolve(thumbnailPath);
        })
        .on("error", (err, stdout, stderr) => {
          console.error("FFmpeg thumbnail error:", err.message);
          console.error("FFmpeg stdout:", stdout);
          console.error("FFmpeg stderr:", stderr);
          reject(new Error(`Thumbnail generation failed: ${err.message}`));
        })
        .screenshots({
          count: 1,
          folder: outputDir,
          filename: thumbnailName,
          size: size,
          timemarks: [timemark],
        });
    });
  } catch (err) {
    throw new ApiError(`Thumbnail generation failed: ${err.message}`, 500);
  }
};

const getVideoMetadata = async (videoPath) => {
  console.log("Getting video metadata with FFmpeg...");
  console.log("Video path:", videoPath);

  const ffmpeg = require("fluent-ffmpeg");
  if (process.env.FFMPEG_PATH) {
    ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
  }

  try {
    if (
      !(await fsPromises
        .access(videoPath)
        .then(() => true)
        .catch(() => false))
    ) {
      throw new Error("Video file does not exist at path: " + videoPath);
    }

    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          console.error("FFmpeg metadata error:", err.message);
          return reject(
            new Error(`Failed to get video metadata: ${err.message}`)
          );
        }

        const videoStream = metadata.streams.find(
          (s) => s.codec_type === "video"
        );
        const audioStream = metadata.streams.find(
          (s) => s.codec_type === "audio"
        );

        if (!videoStream) {
          return reject(new Error("No video stream found in file"));
        }

        const result = {
          format: metadata.format.format_name,
          duration: metadata.format.duration,
          size: metadata.format.size,
          bitrate: metadata.format.bit_rate,
          video: {
            codec: videoStream.codec_name,
            width: videoStream.width,
            height: videoStream.height,
            fps: eval(videoStream.r_frame_rate) || null,
          },
          audio: {
            codec: audioStream ? audioStream.codec_name : null,
          },
        };

        console.log("Video metadata extracted successfully");
        resolve(result);
      });
    });
  } catch (err) {
    throw new ApiError(`Failed to get video metadata: ${err.message}`, 500);
  }
};

exports.uploadVideo = asyncHandler(async (req, res, next) => {
  const { title, category, description } = req.body;
  const userId = req.user.id;

  // Input validation
  const sanitizedTitle = sanitizeInput(title);
  const sanitizedCategory = sanitizeInput(category);
  const sanitizedDescription = sanitizeInput(description);

  if (!sanitizedTitle) {
    return next(new ApiError("Please provide a valid title", 400));
  }

  if (sanitizedTitle.length > MAX_TITLE_LENGTH) {
    return next(
      new ApiError(`Title cannot exceed ${MAX_TITLE_LENGTH} characters`, 400)
    );
  }

  if (
    sanitizedDescription &&
    sanitizedDescription.length > MAX_DESCRIPTION_LENGTH
  ) {
    return next(
      new ApiError(
        `Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`,
        400
      )
    );
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

  // File format validation
  const fileExt = path.extname(videoFile.originalname).toLowerCase().slice(1);
  if (!ALLOWED_FORMATS.includes(fileExt)) {
    return next(
      new ApiError(
        `Invalid video format. Allowed formats: ${ALLOWED_FORMATS.join(", ")}`,
        400
      )
    );
  }

  // File size validation
  if (videoFile.size > MAX_FILE_SIZE) {
    return next(
      new ApiError(
        `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
        400
      )
    );
  }

  const tempPath = videoFile.path;
  const videoId = new mongoose.Types.ObjectId();

  try {
    // Generate thumbnail
    const thumbnailDir = path.join("uploads", "thumbnails", videoId.toString());
    const thumbnailPath = await generateThumbnail(tempPath, thumbnailDir, {
      time: 5,
      size: "320x180",
    });

    // Get video metadata
    const metadata = await getVideoMetadata(tempPath);

    const outputDir = path.join(
      __dirname,
      "../Uploads/videos",
      videoId.toString()
    );

    const video = await Video.create({
      _id: videoId,
      title: sanitizedTitle,
      uploader: userId,
      category: sanitizedCategory || "Other",
      status: "pending",
      thumbnail: thumbnailPath,
      duration: Math.round(metadata.duration),
      metadata: {
        format: metadata.format,
        size: metadata.size,
        bitrate: metadata.bitrate,
        resolution: {
          width: metadata.video.width,
          height: metadata.video.height,
        },
        fps: metadata.video.fps,
        audioCodec: metadata.audio.codec,
        videoCodec: metadata.video.codec,
      },
    });

    // Add transcoding job to queue
    await transcodeQueue.add(
      "transcode",
      {
        inputPath: tempPath,
        outputDir,
        videoId: videoId.toString(),
        videoDocId: video._id,
      },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      }
    );

    // Notify followers
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
        getIO()
          .to(follower._id.toString())
          .emit("newNotification", notification);
      })
    );

    // Notify admins
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
      message: "Video uploaded and transcoding enqueued, awaiting review",
      videoId: video._id,
      thumbnail: thumbnailPath,
      metadata: video.metadata,
    });
  } catch (error) {
    // Cleanup on error
    if (fs.existsSync(tempPath)) {
      await fsPromises.unlink(tempPath);
    }
    return next(new ApiError(`Video upload failed: ${error.message}`, 500));
  }
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

  if (video.status !== "live") {
    console.error(`Video not available, status: ${video.status}`);
    return next(new ApiError("Video is not available for streaming", 403));
  }

  const hlsPath = video.hlsPath;
  console.log("Stored hlsPath:", hlsPath);

  if (!hlsPath) {
    console.error(`No hlsPath for video: ${videoId}`);
    return next(
      new ApiError(
        "Video stream not ready. Transcoding may be incomplete.",
        422
      )
    );
  }

  const hlsBaseDir = path.dirname(hlsPath);
  let requestedPath;

  const pathParts = req.path.split("/stream/")[1];
  const isMasterRequest = pathParts === videoId;

  if (isMasterRequest) {
    requestedPath = hlsPath;
  } else {
    const segmentPath = pathParts;
    requestedPath = path.join(
      hlsBaseDir,
      segmentPath.split("/").slice(1).join("/")
    );
  }

  const absolutePath = path.join(__dirname, "../", requestedPath);
  console.log("Attempting to access file at:", absolutePath);

  if (
    !(await fsPromises
      .access(absolutePath)
      .then(() => true)
      .catch(() => false))
  ) {
    console.error("HLS file not found at path:", absolutePath);
    return next(new ApiError("HLS file not found", 404));
  }

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
  const { limit = 6 } = req.query;
  const videos = await Video.find({ status: "live" })
    .sort({ views: -1, createdAt: -1 })
    .limit(parseInt(limit))
    .populate("uploader", "username");
  res.status(200).json({
    videos,
  });
});

exports.getVideoDetails = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  const video = await Video.findById(videoId)
    .populate("uploader", "username avatar")
    .populate("comments.user", "username avatar");
  if (!video) {
    return next(new ApiError("Video not found", 404));
  }
  res.status(200).json({
    video,
  });
});
