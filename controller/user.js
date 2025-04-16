const User = require("./../model/User");
const Video = require("./../model/Video");
const asyncHandler = require("express-async-handler");
const ApiError = require("./../utils/ApiError");
const jwt = require("jsonwebtoken");
const fs = require("fs").promises;
const path = require("path");

// Helper to format user response
const formatUserResponse = (user) => ({
  id: user._id,
  username: user.username,
  email: user.email,
  role: user.role,
  avatar: user.avatar,
  followers: user.followers || [],
  following: user.following || [],
});

// Generate token
const generateToken = (user) => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not defined");
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "5d",
  });
};

exports.signup = asyncHandler(async (req, res, next) => {
  const { username, email, password, role } = req.body;

  if (role && !["user", "streamer"].includes(role)) {
    return next(
      new ApiError("Invalid role. Must be 'user' or 'streamer'", 400)
    );
  }

  const userExist = await User.findOne({ email });
  if (userExist) {
    return next(new ApiError("User already exists", 400));
  }

  const userData = {
    username,
    email,
    password,
    role: role || "user",
  };

  if (req.file) {
    userData.avatar = req.file.path;
  }

  const user = await User.create(userData);

  res.status(201).json({
    message: "User registered successfully",
    user: formatUserResponse(user),
    token: generateToken(user),
  });
});

exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return next(new ApiError("Email and password are required", 400));
  }

  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    return next(new ApiError("Invalid email or password", 401));
  }

  res.json({
    message: "User logged in successfully",
    user: formatUserResponse(user),
    token: generateToken(user),
  });
});

exports.createAdmin = asyncHandler(async (req, res, next) => {
  const { username, email, password, adminSecret } = req.body;

  if (adminSecret !== process.env.ADMIN_SECRET) {
    return next(new ApiError("Invalid admin secret", 403));
  }

  const userExist = await User.findOne({ email });
  if (userExist) {
    return next(new ApiError("User already exists", 400));
  }

  const user = await User.create({
    username,
    email,
    password,
    role: "admin",
  });

  res.status(201).json({
    message: "Admin created successfully",
    user: formatUserResponse(user),
    token: generateToken(user),
  });
});

exports.updateProfile = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { username } = req.body;
  const user = await User.findById(userId);
  if (!user) return next(new ApiError("User not found", 404));

  if (username) user.username = username;
  if (req.file) {
    if (user.avatar && user.avatar !== "default-avatar.png") {
      const oldAvatarPath = path.join(__dirname, "..", user.avatar);
      try {
        await fs.unlink(oldAvatarPath);
      } catch (error) {
        console.error("Error deleting old avatar:", error);
      }
    }
    user.avatar = req.file.path;
  }

  await user.save();
  res
    .status(200)
    .json({ message: "Profile updated", user: formatUserResponse(user) });
});

exports.getProfile = asyncHandler(async (req, res, next) => {
  const userId = req.params.id || req.user.id;
  const user = await User.findById(userId)
    .select("-password")
    .populate("followers following");
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
  res.status(200).json({
    message: "Profile retrieved",
    user: formatUserResponse(user),
    stats,
  });
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

exports.getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id).populate("followers following");
  res.status(200).json({
    status: "success",
    data: {
      user: formatUserResponse(user),
    },
  });
});
