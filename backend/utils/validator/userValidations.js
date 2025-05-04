const { check } = require("express-validator");
const validatorMiddleware = require("../../middleware/validatorMiddleware");

exports.SignUpValidator = [
  check("username").trim().notEmpty().withMessage("UserName is required"),
  check("email").isEmail().withMessage("Please provide a valid email"),
  check("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long"),
  validatorMiddleware,
];

exports.loginValidator = [
  check("email").isEmail().withMessage("Please provide a valid email"),
  check("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long"),
  validatorMiddleware,
];

exports.updateProfileValidator = [
  check("displayName")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Display name cannot exceed 50 characters"),
  check("bio")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Bio cannot exceed 500 characters"),
  check("email")
    .optional()
    .isEmail()
    .withMessage("Please provide a valid email"),
  check("currentPassword")
    .optional()
    .isLength({ min: 8 })
    .withMessage("Current password must be at least 8 characters long"),
  check("newPassword")
    .optional()
    .isLength({ min: 8 })
    .withMessage("New password must be at least 8 characters long"),
  check("preferences.notifications.email")
    .optional()
    .isBoolean()
    .withMessage("Email notification preference must be a boolean"),
  check("preferences.notifications.push")
    .optional()
    .isBoolean()
    .withMessage("Push notification preference must be a boolean"),
  check("preferences.notifications.inApp")
    .optional()
    .isBoolean()
    .withMessage("In-app notification preference must be a boolean"),
  check("preferences.videoQuality")
    .optional()
    .isIn(["auto", "1080p", "720p", "480p", "360p"])
    .withMessage("Invalid video quality preference"),
  check("preferences.language")
    .optional()
    .isLength({ min: 2, max: 5 })
    .withMessage("Invalid language code"),
  check("preferences.theme")
    .optional()
    .isIn(["light", "dark", "system"])
    .withMessage("Invalid theme preference"),
  check("socialLinks.youtube")
    .optional()
    .isURL()
    .withMessage("Invalid YouTube URL"),
  check("socialLinks.twitter")
    .optional()
    .isURL()
    .withMessage("Invalid Twitter URL"),
  check("socialLinks.instagram")
    .optional()
    .isURL()
    .withMessage("Invalid Instagram URL"),
  check("socialLinks.website")
    .optional()
    .isURL()
    .withMessage("Invalid website URL"),
  validatorMiddleware,
];

exports.forgotPasswordValidator = [
  check("email").isEmail().withMessage("Please provide a valid email"),
  validatorMiddleware,
];

exports.resetPasswordValidator = [
  check("token").notEmpty().withMessage("Reset token is required"),
  check("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long"),
  validatorMiddleware,
];
