const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/ApiError");
const User = require("../model/User");

exports.protect = asyncHandler(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) return next(new ApiError("No token provided", 401));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (!user) return next(new ApiError("User not found", 401));
    if (user.role === "banned") {
      return next(new ApiError("Your account has been banned", 403));
    }
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return next(new ApiError("Token has expired", 401));
    } else if (error.name === "JsonWebTokenError") {
      return next(new ApiError("Invalid token", 401));
    }
    return next(new ApiError("Authentication failed", 401));
  }
});
