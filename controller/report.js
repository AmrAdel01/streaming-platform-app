const asyncHandler = require("express-async-handler");
const Report = require("../model/Report");
const Video = require("../model/Video");
const Comment = require("../model/Comment");
const User = require("../model/User");
const { createNotification } = require("./notification");
const ApiError = require("../utils/ApiError");

exports.submitReport = asyncHandler(async (req, res, next) => {
  const { targetId, targetModel, reason } = req.body;
  const reporterId = req.user.id;

  if (!["Video", "Comment", "User"].includes(targetModel)) {
    return next(new ApiError("Invalid target model", 400));
  }
  if (!reason) {
    return next(new ApiError("Reason is required", 400));
  }

  // Verify the target exists
  let target;
  if (targetModel === "Video") {
    target = await Video.findById(targetId);
  } else if (targetModel === "Comment") {
    target = await Comment.findById(targetId);
  } else if (targetModel === "User") {
    target = await User.findById(targetId);
  }
  if (!target) {
    return next(new ApiError(`${targetModel} not found`, 404));
  }

  const report = await Report.create({
    reporter: reporterId,
    target: targetId,
    targetModel,
    reason,
  });

  res.status(201).json({ message: "Report submitted", report });
});

exports.getReports = asyncHandler(async (req, res, next) => {
  if (req.user.role !== "admin") {
    return next(new ApiError("Unauthorized", 403));
  }

  const { limit = 10, skip = 0, status = "pending" } = req.query;

  const reports = await Report.find({ status })
    .populate("reporter", "username")
    .populate("target") // Dynamically populates based on targetModel
    .sort({ createdAt: -1 }) // Newest first
    .limit(parseInt(limit))
    .skip(parseInt(skip));

  const total = await Report.countDocuments({ status });

  res.status(200).json({
    message: `Reports with status '${status}' retrieved`,
    reports,
    total,
  });
});

exports.resolveReport = asyncHandler(async (req, res, next) => {
  if (req.user.role !== "admin") {
    return next(new ApiError("Unauthorized", 403));
  }

  const reportId = req.params.id;
  const { action } = req.body;

  const report = await Report.findById(reportId).populate("target");
  if (!report) {
    return next(new ApiError("Report not found", 404));
  }
  if (report.status !== "pending") {
    return next(new ApiError("Report already resolved", 400));
  }

  let actionMessage;
  switch (action) {
    case "remove":
      if (report.targetModel === "Video") {
        await Video.findByIdAndUpdate(report.target._id, { status: "removed" });
        actionMessage = "The reported video has been removed.";
      } else if (report.targetModel === "Comment") {
        await Comment.findByIdAndDelete(report.target._id);
        await Video.updateOne(
          { _id: report.target.video },
          { $pull: { comments: { _id: report.target._id } } }
        );
        actionMessage = "The reported comment has been removed.";
      }
      report.status = "resolved";
      break;
    case "ban":
      if (report.targetModel === "User") {
        await User.findByIdAndUpdate(report.target._id, { role: "banned" });
        actionMessage = "The reported user has been banned.";
      }
      report.status = "resolved";
      break;
    case "dismiss":
      report.status = "dismissed";
      actionMessage = "Your report was reviewed and dismissed.";
      break;
    default:
      return next(new ApiError("Invalid action", 400));
  }

  await report.save();

  // Notify the reporter
  await createNotification(
    report.reporter,
    actionMessage,
    "report_update",
    report._id,
    "Report"
  );
  getIO().to(report.reporter.toString()).emit("newNotification", {
    user: report.reporter,
    message: actionMessage,
    type: "report_update",
    target: report._id,
    targetModel: "Report",
  });

  res.status(200).json({ message: `Report ${action}ed`, report });
});
