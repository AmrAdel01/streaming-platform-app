const express = require("express");
const {
  submitReport,
  getReports,
  resolveReport,
} = require("../controller/report");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/submit", protect, submitReport);
router.get("/", protect, getReports); // Admin only (checked in controller)
router.put("/:id/resolve", protect, resolveReport); // Admin only

module.exports = router;
