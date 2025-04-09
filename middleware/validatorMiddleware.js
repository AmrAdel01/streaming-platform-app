const { validationResult } = require("express-validator");
const ApiError = require("../utils/ApiError");

const validatorMiddleware = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new ApiError(
        "Validation failed",
        400,
        errors.array().map((err) => ({ param: err.param, message: err.msg }))
      )
    );
  }
  next();
};

module.exports = validatorMiddleware;
