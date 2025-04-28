const asyncHandler = require("express-async-handler");
const User = require("../model/User");
const jwt = require("jsonwebtoken");
const ApiError = require("../utils/ApiError");
const path = require("path");
const fsPromises = require("fs").promises;
const { sanitizeInput } = require("../utils/sanitize");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

// Email transporter setup
console.log("Setting up email transporter with config:", {
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_SECURE === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD ? "****" : "not set",
  },
});

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_SECURE === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Verify transporter configuration
transporter.verify(function (error, success) {
  if (error) {
    console.error("Email transporter verification failed:", error);
  } else {
    console.log("Email transporter is ready to send messages");
  }
});

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
  const {
    displayName,
    bio,
    email,
    currentPassword,
    newPassword,
    preferences,
    socialLinks,
  } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    return next(new ApiError("User not found", 404));
  }

  // Update basic profile info
  if (displayName) user.displayName = sanitizeInput(displayName);
  if (bio) user.bio = sanitizeInput(bio);

  // Update email if provided and different from current
  if (email && email !== user.email) {
    const emailExists = await User.findOne({ email: sanitizeInput(email) });
    if (emailExists) {
      return next(new ApiError("Email already in use", 400));
    }
    user.email = sanitizeInput(email);
    user.isEmailVerified = false;
    // Generate new verification token
    const verificationToken = user.generateEmailVerificationToken();
    await user.save();

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    await transporter.sendMail({
      to: user.email,
      subject: "Verify your email",
      html: `Please click <a href="${verificationUrl}">here</a> to verify your email.`,
    });
  }

  // Update password if provided
  if (currentPassword && newPassword) {
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return next(new ApiError("Current password is incorrect", 400));
    }
    user.password = newPassword;
  }

  // Update avatar if provided
  if (req.file) {
    // Delete old avatar if it's not the default
    if (user.avatar !== "default-avatar.png") {
      const oldAvatarPath = path.join(__dirname, "..", user.avatar);
      try {
        await fsPromises.unlink(oldAvatarPath);
      } catch (error) {
        console.error("Error deleting old avatar:", error);
      }
    }
    user.avatar = `/uploads/${path.basename(req.file.path)}`;
  }

  // Update preferences if provided
  if (preferences) {
    user.preferences = {
      ...user.preferences,
      ...preferences,
    };
  }

  // Update social links if provided
  if (socialLinks) {
    user.socialLinks = {
      ...user.socialLinks,
      ...socialLinks,
    };
  }

  await user.save();

  res.status(200).json({
    status: "success",
    message: "Profile updated successfully",
    data: {
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        bio: user.bio,
        avatar: user.avatar,
        role: user.role,
        preferences: user.preferences,
        socialLinks: user.socialLinks,
        followers: user.followers.length,
        following: user.following.length,
        isEmailVerified: user.isEmailVerified,
      },
    },
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

// Get user preferences
exports.getPreferences = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id).select("preferences");
  if (!user) {
    return next(new ApiError("User not found", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      preferences: user.preferences,
    },
  });
});

// Update user preferences
exports.updatePreferences = asyncHandler(async (req, res, next) => {
  const { preferences } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    return next(new ApiError("User not found", 404));
  }

  user.preferences = {
    ...user.preferences,
    ...preferences,
  };

  await user.save();

  res.status(200).json({
    status: "success",
    message: "Preferences updated successfully",
    data: {
      preferences: user.preferences,
    },
  });
});

// Request password reset
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  const user = await User.findOne({ email: sanitizeInput(email) });
  if (!user) {
    return next(new ApiError("No user found with that email", 404));
  }

  // Generate reset token
  const resetToken = user.generatePasswordResetToken();
  await user.save();

  // Create reset url
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  // Send email
  await transporter.sendMail({
    to: user.email,
    subject: "Password Reset Request",
    html: `You requested a password reset. Please click <a href="${resetUrl}">here</a> to reset your password. This link will expire in 10 minutes.`,
  });

  res.status(200).json({
    status: "success",
    message: "Password reset email sent",
  });
});

// Reset password
exports.resetPassword = asyncHandler(async (req, res, next) => {
  const { token, password } = req.body;

  // Get hashed token
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    return next(new ApiError("Invalid or expired reset token", 400));
  }

  // Set new password
  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  res.status(200).json({
    status: "success",
    message: "Password reset successful",
  });
});

// Verify email
exports.verifyEmail = asyncHandler(async (req, res, next) => {
  const { token } = req.params;

  // Get hashed token
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() },
  });

  if (!user) {
    return next(new ApiError("Invalid or expired verification token", 400));
  }

  // Mark email as verified
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();

  res.status(200).json({
    status: "success",
    message: "Email verified successfully",
  });
});

// Resend verification email
exports.resendVerificationEmail = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  if (!user) {
    return next(new ApiError("User not found", 404));
  }

  if (user.isEmailVerified) {
    return next(new ApiError("Email already verified", 400));
  }

  // Generate new verification token
  const verificationToken = user.generateEmailVerificationToken();
  await user.save();

  // Send verification email
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
  await transporter.sendMail({
    to: user.email,
    subject: "Verify your email",
    html: `Please click <a href="${verificationUrl}">here</a> to verify your email.`,
  });

  res.status(200).json({
    status: "success",
    message: "Verification email sent",
  });
});

// Get watch history
exports.getWatchHistory = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id)
    .populate({
      path: "watchHistory.video",
      select: "title thumbnail duration views createdAt",
    })
    .select("watchHistory");

  if (!user) {
    return next(new ApiError("User not found", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      watchHistory: user.watchHistory,
    },
  });
});

// Get watch later list
exports.getWatchLater = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id)
    .populate("watchLater", "title thumbnail duration views createdAt")
    .select("watchLater");

  if (!user) {
    return next(new ApiError("User not found", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      watchLater: user.watchLater,
    },
  });
});

// Add video to watch later
exports.addToWatchLater = asyncHandler(async (req, res, next) => {
  const { videoId } = req.params;

  const user = await User.findById(req.user._id);
  if (!user) {
    return next(new ApiError("User not found", 404));
  }

  // Check if video is already in watch later
  if (user.watchLater.includes(videoId)) {
    return next(new ApiError("Video already in watch later list", 400));
  }

  user.watchLater.push(videoId);
  await user.save();

  res.status(200).json({
    status: "success",
    message: "Video added to watch later",
  });
});

// Remove video from watch later
exports.removeFromWatchLater = asyncHandler(async (req, res, next) => {
  const { videoId } = req.params;

  const user = await User.findById(req.user._id);
  if (!user) {
    return next(new ApiError("User not found", 404));
  }

  user.watchLater = user.watchLater.filter((id) => id.toString() !== videoId);
  await user.save();

  res.status(200).json({
    status: "success",
    message: "Video removed from watch later",
  });
});
