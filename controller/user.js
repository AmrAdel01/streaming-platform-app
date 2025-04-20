const asyncHandler = require("express-async-handler");
const User = require("../model/User");
const jwt = require("jsonwebtoken");
const ApiError = require("../utils/ApiError");
const path = require("path");
const fsPromises = require("fs").promises;
const { sanitizeInput } = require("../utils/sanitize");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "5d" });
};

exports.signup = asyncHandler(async (req, res, next) => {
  const { username, email, password, role } = req.body;
  let avatarPath = "/uploads/default-avatar.png";

  const sanitizedUsername = sanitizeInput(username);
  const sanitizedEmail = sanitizeInput(email);
  if (!sanitizedUsername || !sanitizedEmail || !password) {
    return next(new ApiError("All fields are required", 400));
  }
  if (sanitizedUsername.length > 30) {
    return next(new ApiError("Username cannot exceed 30 characters", 400));
  }

  if (req.file) {
    avatarPath = `/uploads/${path.basename(req.file.path)}`;
  }

  const existingUser = await User.findOne({
    $or: [{ email: sanitizedEmail }, { username: sanitizedUsername }],
  });
  if (existingUser) {
    return next(new ApiError("Username or email already exists", 400));
  }

  const user = await User.create({
    username: sanitizedUsername,
    email: sanitizedEmail,
    password,
    role,
    avatar: avatarPath,
  });

  const token = generateToken(user._id);

  res.status(201).json({
    status: "success",
    message: "User registered successfully",
    data: {
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
      },
      token,
    },
  });
});

exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  const sanitizedEmail = sanitizeInput(email);
  if (!sanitizedEmail || !password) {
    return next(new ApiError("Email and password are required", 400));
  }

  const user = await User.findOne({ email: sanitizedEmail }).select(
    "+password"
  );
  if (!user || !(await user.comparePassword(password))) {
    return next(new ApiError("Invalid email or password", 401));
  }

  if (user.role === "banned") {
    return next(new ApiError("Your account has been banned", 403));
  }

  const token = generateToken(user._id);

  res.status(200).json({
    status: "success",
    message: "User logged in successfully",
    data: {
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
      },
      token,
    },
  });
});

exports.updateProfile = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { username, email } = req.body;

  const sanitizedUsername = sanitizeInput(username);
  const sanitizedEmail = sanitizeInput(email);

  const updates = {};
  if (sanitizedUsername) {
    if (sanitizedUsername.length > 30) {
      return next(new ApiError("Username cannot exceed 30 characters", 400));
    }
    updates.username = sanitizedUsername;
  }
  if (sanitizedEmail) {
    if (!/^\S+@\S+\.\S+$/.test(sanitizedEmail)) {
      return next(new ApiError("Invalid email format", 400));
    }
    updates.email = sanitizedEmail;
  }

  if (req.file) {
    updates.avatar = `/uploads/${path.basename(req.file.path)}`;
  }

  if (Object.keys(updates).length === 0) {
    return next(new ApiError("No valid fields provided for update", 400));
  }

  const existingUser = await User.findOne({
    $or: [{ email: updates.email }, { username: updates.username }],
    _id: { $ne: userId },
  });
  if (existingUser) {
    return next(new ApiError("Username or email already exists", 400));
  }

  const user = await User.findByIdAndUpdate(userId, updates, {
    new: true,
    runValidators: true,
  }).select("-password");

  if (!user) {
    return next(new ApiError("User not found", 404));
  }

  if (req.file && req.user.avatar && req.user.avatar !== "default-avatar.png") {
    const oldAvatarPath = path.join(__dirname, "../", req.user.avatar);
    await fsPromises
      .unlink(oldAvatarPath)
      .catch((err) => console.error("Failed to delete old avatar:", err));
  }

  res.status(200).json({
    status: "success",
    message: "Profile updated successfully",
    data: { user },
  });
});

exports.getProfile = asyncHandler(async (req, res, next) => {
  const userId = req.params.id;

  const user = await User.findById(userId)
    .populate("followers", "username avatar")
    .populate("following", "username avatar")
    .lean()
    .select("username avatar role followers following createdAt");

  if (!user) {
    return next(new ApiError("User not found", 404));
  }

  res.status(200).json({
    status: "success",
    message: "User profile retrieved successfully",
    data: { user },
  });
});

exports.followUser = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const targetId = req.params.id;

  if (userId === targetId) {
    return next(new ApiError("Cannot follow yourself", 400));
  }

  const user = await User.findById(userId);
  const targetUser = await User.findById(targetId);

  if (!targetUser) {
    return next(new ApiError("Target user not found", 404));
  }

  if (user.following.includes(targetId)) {
    return next(new ApiError("Already following this user", 400));
  }

  user.following.push(targetId);
  targetUser.followers.push(userId);

  await Promise.all([user.save(), targetUser.save()]);

  res.status(200).json({
    status: "success",
    message: `Successfully followed ${targetUser.username}`,
    data: {
      user: {
        _id: user._id,
        following: user.following,
      },
    },
  });
});

exports.unfollowUser = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const targetId = req.params.id;

  if (userId === targetId) {
    return next(new ApiError("Cannot unfollow yourself", 400));
  }

  const user = await User.findById(userId);
  const targetUser = await User.findById(targetId);

  if (!targetUser) {
    return next(new ApiError("Target user not found", 404));
  }

  if (!user.following.includes(targetId)) {
    return next(new ApiError("Not following this user", 400));
  }

  user.following = user.following.filter((id) => id.toString() !== targetId);
  targetUser.followers = targetUser.followers.filter(
    (id) => id.toString() !== userId
  );

  await Promise.all([user.save(), targetUser.save()]);

  res.status(200).json({
    status: "success",
    message: `Successfully unfollowed ${targetUser.username}`,
    data: {
      user: {
        _id: user._id,
        following: user.following,
      },
    },
  });
});

exports.getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id)
    .populate("followers", "username avatar")
    .populate("following", "username avatar")
    .lean()
    .select("username email avatar role followers following createdAt");

  if (!user) {
    return next(new ApiError("User not found", 404));
  }

  res.status(200).json({
    status: "success",
    message: "Authenticated user retrieved successfully",
    data: { user },
  });
});

exports.createAdmin = asyncHandler(async (req, res, next) => {
  const { username, email, password, adminSecret } = req.body;

  if (adminSecret !== process.env.ADMIN_SECRET) {
    return next(new ApiError("Invalid admin secret", 403));
  }

  const sanitizedUsername = sanitizeInput(username);
  const sanitizedEmail = sanitizeInput(email);
  if (!sanitizedUsername || !sanitizedEmail || !password) {
    return next(new ApiError("All fields are required", 400));
  }

  const existingUser = await User.findOne({
    $or: [{ email: sanitizedEmail }, { username: sanitizedUsername }],
  });
  if (existingUser) {
    return next(new ApiError("Username or email already exists", 400));
  }

  const user = await User.create({
    username: sanitizedUsername,
    email: sanitizedEmail,
    password,
    role: "admin",
  });

  const token = generateToken(user._id);

  res.status(201).json({
    status: "success",
    message: "Admin user created successfully",
    data: {
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      token,
    },
  });
});
