const asyncHandler = require("express-async-handler");
const Report = require("../model/Report");
const ApiError = require("../utils/ApiError");
const { createNotification } = require("./notification");
const { getIO } = require("../utils/socket");
const { sanitizeInput } = require("../utils/sanitize");

exports.submitReport = asyncHandler(async (req, res, next) => {
  const { target, targetModel, reason } = req.body;
  const reporterId = req.user.id;

  if (!["Video", "Comment", "User"].includes(targetModel)) {
    return next(new ApiError("Invalid target model", 400));
  }

  const sanitizedReason = sanitizeInput(reason);
  if (!sanitizedReason) {
    return next(new ApiError("Reason is required", 400));
  }
  if (sanitizedReason.length > 500) {
    return next(new ApiError("Reason cannot exceed 500 characters", 400));
  }

  const report = await Report.create({
    reporter: reporterId,
    target,
    targetModel,
    reason: sanitizedReason,
  });

  const admins = await require("../model/User").find({ role: "admin" });
  await Promise.all(
    admins.map(async (admin) => {
      const notification = await createNotification(
        admin._id,
        `New ${targetModel.toLowerCase()} report from user ${
          req.user.username
        }`,
        "report_update",
        report._id,
        "Report"
      );
      getIO().to(admin._id.toString()).emit("newNotification", notification);
    })
  );

  res.status(201).json({
    status: "success",
    message: "Report submitted successfully",
    data: { report },
  });
});

exports.getReports = asyncHandler(async (req, res, next) => {
  if (req.user.role !== "admin") {
    return next(new ApiError("Admin access required", 403));
  }

  const { limit = 10, skip = 0, status = "pending" } = req.query;

  const parsedLimit = parseInt(limit);
  const parsedSkip = parseInt(skip);
  if (
    isNaN(parsedLimit) ||
    parsedLimit < 1 ||
    isNaN(parsedSkip) ||
    parsedSkip < 0
  ) {
    return next(new ApiError("Invalid limit or skip parameters", 400));
  }

  if (!["pending", "resolved", "dismissed"].includes(status)) {
    return next(new ApiError("Invalid status filter", 400));
  }

  const reports = await Report.find({ status })
    .populate("reporter", "username")
    .populate("target", "title text username")
    .limit(parsedLimit)
    .skip(parsedSkip)
    .lean()
    .select("reporter target targetModel reason status createdAt");

  const total = await Report.countDocuments({ status });

  res.status(200).json({
    status: "success",
    message: "Reports retrieved successfully",
    data: { reports, total, page: Math.ceil(parsedSkip / parsedLimit) + 1 },
  });
});

exports.resolveReport = asyncHandler(async (req, res, next) => {
  if (req.user.role !== "admin") {
    return next(new ApiError("Admin access required", 403));
  }

  const reportId = req.params.id;
  const { status } = req.body;

  if (!["resolved", "dismissed"].includes(status)) {
    return next(
      new ApiError("Invalid status. Must be 'resolved' or 'dismissed'", 400)
    );
  }

  const report = await Report.findById(reportId);
  if (!report) {
    return next(new ApiError("Report not found", 404));
  }

  report.status = status;
  await report.save();

  const notification = await createNotification(
    report.reporter,
    `Your report on ${report.targetModel.toLowerCase()} has been ${status}`,
    "report_update",
    report._id,
    "Report"
  );
  getIO().to(report.reporter.toString()).emit("newNotification", notification);

  res.status(200).json({
    status: "success",
    message: `Report ${status} successfully`,
    data: { report },
  });
});
