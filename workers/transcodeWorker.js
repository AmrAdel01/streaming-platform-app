const { Worker } = require("bullmq");
const { transcodeVideo } = require("../utils/transcode");
const mongoose = require("mongoose");
const Video = require("../model/Video");
const User = require("../model/User");
const fsPromises = require("fs").promises;
const path = require("path");
const { createNotification } = require("../controller/notification");
const { getIO } = require("../utils/socket");
const dbConnection = require("../config/db");
const dotenv = require("dotenv");

// Load environment variables
const envResult = dotenv.config();
if (envResult.error) {
  console.error(
    "Failed to load .env file in transcodeWorker:",
    envResult.error.message
  );
  process.exit(1);
}

if (!process.env.DB_URL) {
  console.error("DB_URL is not defined in .env file for transcodeWorker");
  process.exit(1);
}

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT) || 6379,
};

// Initialize MongoDB connection
const initMongoDB = async () => {
  try {
    console.log("DB_URL in transcodeWorker:", process.env.DB_URL);
    await dbConnection();
    console.log("MongoDB connected in transcodeWorker");
    const collections = await mongoose.connection.db
      .listCollections()
      .toArray();
    console.log(
      "MongoDB collections:",
      collections.map((c) => c.name)
    );
  } catch (err) {
    console.error("MongoDB connection failed in transcodeWorker:", err.message);
    process.exit(1);
  }
};

// Retry logic for MongoDB operations
const withRetry = async (operation, maxRetries = 3, delay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.warn(
        `MongoDB operation failed, retrying (${attempt}/${maxRetries}):`,
        err.message
      );
      await new Promise((resolve) => setTimeout(resolve, delay * attempt));
    }
  }
};

initMongoDB();

const transcodeWorker = new Worker(
  "transcodeQueue",
  async (job) => {
    const { inputPath, outputDir, videoId, videoDocId } = job.data;
    console.log(
      `Processing transcoding job for videoId: ${videoId}, docId: ${videoDocId}`
    );
    console.log(`Job data:`, { inputPath, outputDir });

    try {
      // Verify input file exists
      console.log(`Checking input file: ${inputPath}`);
      if (
        !(await fsPromises
          .access(inputPath)
          .then(() => true)
          .catch(() => false))
      ) {
        throw new Error(`Input video file not found at: ${inputPath}`);
      }
      console.log(`Input file verified: ${inputPath}`);

      // Ensure output directory exists
      console.log(`Creating output directory: ${outputDir}`);
      await fsPromises.mkdir(outputDir, { recursive: true });
      console.log(`Output directory ensured: ${outputDir}`);

      // Run transcoding
      console.log(`Starting transcoding for videoId: ${videoId}`);
      const hlsPath = await transcodeVideo(inputPath, outputDir, videoId);
      const absoluteHlsPath = path.join(__dirname, "../", hlsPath);
      console.log(`Transcoding completed, hlsPath: ${hlsPath}`);

      // Verify HLS output
      console.log(`Checking HLS output: ${absoluteHlsPath}`);
      if (
        !(await fsPromises
          .access(absoluteHlsPath)
          .then(() => true)
          .catch(() => false))
      ) {
        throw new Error(`HLS master playlist not found at: ${absoluteHlsPath}`);
      }
      console.log(`HLS output verified: ${absoluteHlsPath}`);

      // Update video document with retry
      console.log(`Updating video document for ID: ${videoDocId}`);
      const video = await withRetry(async () => {
        const updatedVideo = await Video.findByIdAndUpdate(
          videoDocId,
          { hlsPath, status: "pending" },
          { new: true }
        );
        if (!updatedVideo) {
          throw new Error(`Video document not found for ID: ${videoDocId}`);
        }
        return updatedVideo;
      });
      console.log(
        `Video document updated for videoId: ${videoId}, hlsPath: ${hlsPath}`
      );

      // Clean up input file
      console.log(`Cleaning up input file: ${inputPath}`);
      await fsPromises
        .unlink(inputPath)
        .catch((err) =>
          console.error(
            `Failed to delete input file ${inputPath}:`,
            err.message
          )
        );

      return { videoId, hlsPath };
    } catch (error) {
      console.error(
        `Transcoding failed for videoId: ${videoId}, docId: ${videoDocId}:`,
        {
          message: error.message,
          stack: error.stack,
        }
      );

      // Update video status to failed with retry
      console.log(`Updating video status to failed for ID: ${videoDocId}`);
      await withRetry(async () => {
        const video = await Video.findByIdAndUpdate(
          videoDocId,
          { status: "failed" },
          { new: true }
        );
        if (video) {
          console.log(`Video status updated to failed for ID: ${videoDocId}`);
        } else {
          console.warn(
            `Video document not found for ID: ${videoDocId} during failure update`
          );
        }
      }).catch((err) => {
        console.error(
          `Failed to update video status to failed for ID: ${videoDocId}:`,
          err.message
        );
      });

      // Clean up partial output
      console.log(`Cleaning up partial output: ${outputDir}`);
      const outputPath = path.join(outputDir, videoId);
      await fsPromises
        .rm(outputPath, { recursive: true, force: true })
        .catch((err) =>
          console.error(`Cleanup failed for ${outputPath}:`, err.message)
        );

      // Notify admins
      console.log(`Notifying admins for transcoding failure: ${videoId}`);
      const admins = await User.find({ role: "admin" });
      await Promise.all(
        admins.map(async (admin) => {
          const notification = await createNotification(
            admin._id,
            `Transcoding failed for video ID: ${videoId}. Error: ${error.message}`,
            "transcode_failure",
            videoDocId,
            "Video"
          );
          getIO()
            .to(admin._id.toString())
            .emit("newNotification", notification);
        })
      );

      throw error;
    }
  },
  {
    connection,
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
  }
);

transcodeWorker.on("completed", (job) => {
  console.log(
    `Job ${job.id} for videoId ${job.data.videoId} completed successfully`
  );
});

transcodeWorker.on("failed", (job, err) => {
  console.error(
    `Job ${job.id} for videoId ${job.data.videoId} failed after retries:`,
    {
      message: err.message,
      stack: err.stack,
    }
  );
});

transcodeWorker.on("active", (job) => {
  console.log(`Job ${job.id} for videoId ${job.data.videoId} is now active`);
});

module.exports = transcodeWorker;
