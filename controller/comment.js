const Comment = require("./../model/Comment");
const Video = require("./../model/Video");
const asyncHandler = require("express-async-handler");
const ApiError = require("./../utils/ApiError");

exports.addComment = asyncHandler(async (req, res, next) => {
  const { text } = req.body;
  const videoId = req.params.id;
  const userId = req.user.id;
  if (!text) {
    return next(new ApiError("Please provide a comment", 400));
  }
  const video = await Video.findById(videoId);
  if (!video) {
    return next(new ApiError("Video Not Found ", 404));
  }
  const comment = await Comment.create({ text, user: userId, video: videoId });
  res.status(201).json({ message: "Comment added", comment });
});

exports.getComments = asyncHandler(async (req, res, next) => {
  const videoId = req.params.id;
  const video = await Video.findById(videoId);
  if (!video) {
    return next(new ApiError("Video Not Found ", 404)); // Added video check
  }
  const comments = await Comment.find({ video: videoId }).populate(
    "user",
    "username"
  );
  res.status(200).json({ message: "Comments retrieved", comments });
});
