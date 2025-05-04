const { sanitizeObject } = require("../utils/sanitize");
const asyncHandler = require("express-async-handler");

const sanitizeBody = asyncHandler(async (req, res, next) => {
  if (req.body && Object.keys(req.body).length > 0) {
    req.body = sanitizeObject(req.body);
  }
  next();
});

module.exports = sanitizeBody;
