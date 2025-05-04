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

// Cleanup function for failed jobs
const cleanupFailedJob = async (inputPath, outputDir, videoDocId, error) => {
  try {
    console.error("Cleaning up failed job with error:", error.message);

    // Clean up input file
    if (inputPath) {
      await fsPromises
        .unlink(inputPath)
        .catch((err) =>
          console.error(
            `Failed to delete input file ${inputPath}:`,
            err.message
          )
        );
    }

    // Clean up output directory
    if (outputDir) {
      await fsPromises
        .rm(outputDir, { recursive: true, force: true })
        .catch((err) =>
          console.error(
            `Failed to delete output directory ${outputDir}:`,
            err.message
          )
        );
    }

    // Update video status with error information
    if (videoDocId) {
      await Video.findByIdAndUpdate(videoDocId, {
        status: "failed",
        metadata: {
          $set: {
            transcodingError: error.message,
          },
        },
      }).catch((err) =>
        console.error(
          `Failed to update video status for ${videoDocId}:`,
          err.message
        )
      );
    }
  } catch (cleanupError) {
    console.error("Error during cleanup:", cleanupError.message);
  }
};

initMongoDB();

const worker = new Worker(
  "transcodeQueue",
  async (job) => {
    const { inputPath, outputDir, videoId, videoDocId } = job.data;
    console.log(
      `Processing video ${videoId} from ${inputPath} to ${outputDir}`
    );

    try {
      // Initialize MongoDB if not connected
      if (mongoose.connection.readyState !== 1) {
        await initMongoDB();
      }

      // Update video status to processing
      await Video.findByIdAndUpdate(videoDocId, {
        status: "processing",
      });

      // Transcode video
      const hlsPath = await transcodeVideo(inputPath, outputDir, videoId);

      // Update video document with HLS path and status
      await Video.findByIdAndUpdate(videoDocId, {
        hlsPath,
        status: "live",
      });

      // Clean up temp files
      try {
        await fsPromises.unlink(inputPath);
      } catch (err) {
        console.error("Failed to clean up temp file:", err);
      }

      // Notify user about successful transcoding
      try {
        const video = await Video.findById(videoDocId).populate("uploader");
        if (video && video.uploader) {
          const notification = await createNotification(
            video.uploader._id,
            `Your video "${video.title}" is now ready for streaming!`,
            "video_ready",
            videoId
          );

          // Only try to emit socket event if we're in the main process
          if (process.env.NODE_ENV !== "test") {
            try {
              const io = getIO();
              if (io) {
                io.to(video.uploader._id.toString()).emit(
                  "notification",
                  notification
                );
              }
            } catch (socketError) {
              console.error("Socket.io error:", socketError);
              // Don't fail the job if socket notification fails
            }
          }
        }
      } catch (notifyError) {
        console.error("Failed to send notification:", notifyError);
        // Don't fail the job if notification fails
      }

      return { success: true, videoId };
    } catch (error) {
      console.error(
        `Transcoding failed for videoId: ${videoId}, docId: ${videoDocId}:`,
        error
      );

      // Clean up failed job
      await cleanupFailedJob(inputPath, outputDir, videoDocId, error);

      // Update video status to failed
      await Video.findByIdAndUpdate(videoDocId, {
        status: "failed",
        error: error.message,
      });

      // Notify admins about the failure
      try {
        const admins = await User.find({ role: "admin" });
        for (const admin of admins) {
          const notification = await createNotification(
            admin._id,
            `Video transcoding failed for video ID: ${videoId}. Error: ${error.message}`,
            "transcoding_failed",
            videoId
          );

          // Only try to emit socket event if we're in the main process
          if (process.env.NODE_ENV !== "test") {
            try {
              const io = getIO();
              if (io) {
                io.to(admin._id.toString()).emit("notification", notification);
              }
            } catch (socketError) {
              console.error("Socket.io error:", socketError);
              // Don't fail the job if socket notification fails
            }
          }
        }
      } catch (notifyError) {
        console.error("Failed to notify admins:", notifyError);
        // Don't fail the job if admin notification fails
      }

      throw error;
    }
  },
  {
    connection,
    concurrency: 1,
    limiter: {
      max: 1,
      duration: 1000,
    },
  }
);

worker.on("completed", (job) => {
  console.log(
    `Job ${job.id} for videoId ${job.data.videoId} completed successfully`
  );
});

worker.on("failed", (job, err) => {
  console.error(
    `Job ${job.id} for videoId ${job.data.videoId} failed after retries:`,
    {
      message: err.message,
      stack: err.stack,
      name: err.name,
      code: err.code,
    }
  );

  // Update video status to failed if not already updated
  if (job.data.videoDocId) {
    Video.findByIdAndUpdate(job.data.videoDocId, {
      status: "failed",
      metadata: {
        $set: {
          transcodingError: err.message,
        },
      },
    }).catch((error) => {
      console.error(
        `Failed to update video status for ${job.data.videoDocId}:`,
        error.message
      );
    });
  }
});

worker.on("active", (job) => {
  console.log(`Job ${job.id} for videoId ${job.data.videoId} is now active`);
});

worker.on("progress", (job, progress) => {
  console.log(`Job ${job.id} progress: ${progress}%`);
});

module.exports = worker;
