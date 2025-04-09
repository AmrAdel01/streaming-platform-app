const User = require("./../model/User");
const Video = require("./../model/Video");
const asyncHandler = require("express-async-handler");
const ApiError = require("./../utils/ApiError");
const jwt = require("jsonwebtoken");
// Generate token
const generateToken = (user) => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not defined");
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "5d",
  });
};

exports.signup = asyncHandler(async (req, res, next) => {
  const { username, email, password, role } = req.body;

  // Validate role
  if (role && !["user", "streamer"].includes(role)) {
    return next(
      new ApiError("Invalid role. Must be 'user' or 'streamer'", 400)
    );
  }

  const userExist = await User.findOne({ email });
  if (userExist) {
    return next(new ApiError("User already exists", 400));
  }

  const user = await User.create({
    username,
    email,
    password,
    role: role || "user",
  });
  user.password = undefined; // Remove password field
  res.status(201).json({
    message: "User registered successfully",
    user,
    token: generateToken(user), // Pass the user instance
  });
});

exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    return next(new ApiError("Invalid email or password", 401));
  }
  user.password = undefined; // Hide the password
  res.json({
    message: "User logged in successfully",
    user,
    token: generateToken(user), // Pass the user instance
  });
});

exports.updateProfile = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { username } = req.body;
  const user = await User.findById(userId);
  if (!user) return next(new ApiError("User not found", 404));
  if (username) user.username = username;
  if (req.file) user.avatar = req.file.path;
  await user.save();
  res.status(200).json({ message: "Profile updated", user });
});

exports.getProfile = asyncHandler(async (req, res, next) => {
  const userId = req.params.id || req.user.id;
  const user = await User.findById(userId).select("-password");
  if (!user) return next(new ApiError("User not found", 404));
  let stats = {};
  if (user.role === "streamer") {
    const videos = await Video.find({ uploader: userId });
    stats = {
      totalVideos: videos.length,
      totalViews: videos.reduce((sum, v) => sum + v.views, 0),
      totalLikes: videos.reduce((sum, v) => sum + v.likes.length, 0),
    };
  }
  res.status(200).json({ message: "Profile retrieved", user, stats });
});

exports.followUser = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const targetId = req.params.id;
  const targetUser = await User.findById(targetId);
  if (!targetUser) return next(new ApiError("User not found", 404));
  if (targetUser.followers.includes(userId))
    return next(new ApiError("Already following", 400));
  await User.findByIdAndUpdate(userId, { $push: { following: targetId } });
  await User.findByIdAndUpdate(targetId, { $push: { followers: userId } });
  res.status(200).json({ message: "Followed user" });
});

exports.unfollowUser = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const targetId = req.params.id;
  const targetUser = await User.findById(targetId);
  if (!targetUser) return next(new ApiError("User not found", 404));
  await User.findByIdAndUpdate(userId, { $pull: { following: targetId } });
  await User.findByIdAndUpdate(targetId, { $pull: { followers: userId } });
  res.status(200).json({ message: "Unfollowed user" });
});
