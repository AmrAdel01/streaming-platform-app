const { check } = require("express-validator");
const validatorMiddleware = require("../../middleware/validatorMiddleware");

exports.SignUpValidator = [
  check("username").trim().notEmpty().withMessage("UserName is required"),
  check("email").isEmail().withMessage("Please provide a valid email"),
  check("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 6 characters long"),
  validatorMiddleware,
];

exports.loginValidator = [
  check("email").isEmail().withMessage("Please provide a valid email"),
  check("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 6 characters long"),
  validatorMiddleware,
];
