const asyncHandler = require("express-async-handler");
const User = require("../model/User");
const Video = require("../model/Video");
const ApiError = require("../utils/ApiError");

exports.getRecommendedVideos = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { limit = 10, skip = 0 } = req.query;

  const user = await User.findById(userId).populate(
    "watchHistory.video following"
  );
  if (!user) return next(new ApiError("User not found", 404));

  // Get categories from watch history
  const watchedVideos = user.watchHistory
    .map((entry) => entry.video)
    .filter(Boolean);
  const watchedCategories = [...new Set(watchedVideos.map((v) => v.category))];

  // Get followed streamers
  const followedIds = user.following.map((f) => f._id);

  // Build recommendation query
  const query = {
    status: "live", // Only recommend live videos
    _id: { $nin: watchedVideos.map((v) => v._id) }, // Exclude already watched
    $or: [
      {
        category: {
          $in: watchedCategories.length ? watchedCategories : ["Other"],
        },
      },
      { uploader: { $in: followedIds } },
    ],
  };

  const videos = await Video.find(query)
    .populate("uploader", "username role")
    .sort({ views: -1, createdAt: -1 }) // Prioritize popular and recent videos
    .limit(parseInt(limit))
    .skip(parseInt(skip));

  const total = await Video.countDocuments(query);

  res.status(200).json({
    message: "Recommended videos retrieved",
    videos,
    total,
    page: Math.ceil(skip / limit) + 1,
  });
});
