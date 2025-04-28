const ffmpeg = require("fluent-ffmpeg");
const fsPromises = require("fs").promises;
const path = require("path");
const ApiError = require("../utils/ApiError");
const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);
const fs = require("fs");
const dotenv = require("dotenv");

// Load environment variables
const envResult = dotenv.config();
if (envResult.error) {
  console.error(
    "Failed to load .env file in transcode.js:",
    envResult.error.message
  );
  process.exit(1);
}

// Set FFmpeg path from environment variable
if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}

ffmpeg.getAvailableCodecs((err, codecs) => {
  if (err) {
    console.error("Failed to get FFmpeg codecs:", err);
    return;
  }
  if (!codecs.libx264 || !codecs.aac) {
    console.error("Required codecs (libx264, aac) are missing");
    process.exit(1);
  }
  console.log("FFmpeg codecs:", {
    libx264: !!codecs.libx264,
    aac: !!codecs.aac,
  });
});

const verifyCodecs = () => {
  const codecs = ffmpeg.getAvailableCodecs();
  const requiredCodecs = ["libx264", "aac"];
  const missingCodecs = requiredCodecs.filter((codec) => !codecs[codec]);

  if (missingCodecs.length > 0) {
    throw new Error(`Missing required codecs: ${missingCodecs.join(", ")}`);
  }
};

const transcodeVideo = (inputPath, outputDir, videoId, onProgress) => {
  verifyCodecs();

  // Create output directories for different qualities
  const qualities = ["1080p", "720p", "480p", "360p"];
  qualities.forEach((quality) => {
    const qualityDir = path.join(outputDir, quality);
    if (!fs.existsSync(qualityDir)) {
      fs.mkdirSync(qualityDir, { recursive: true });
    }
  });

  // Create master playlist
  const masterPlaylistPath = path.join(outputDir, "master.m3u8");
  const masterPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080
1080p/${videoId}.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1280x720
720p/${videoId}.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=854x480
480p/${videoId}.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=640x360
360p/${videoId}.m3u8`;

  fs.writeFileSync(masterPlaylistPath, masterPlaylist);

  // Transcode for each quality
  const transcodePromises = qualities.map((quality) => {
    return new Promise((resolve, reject) => {
      const qualityDir = path.join(outputDir, quality);
      const outputPath = path.join(qualityDir, `${videoId}.m3u8`);

      let command = ffmpeg(inputPath).outputOptions([
        "-c:v libx264",
        "-c:a aac",
        "-hls_time 10",
        "-hls_list_size 0",
        "-hls_segment_filename",
        path.join(qualityDir, `${videoId}_%03d.ts`),
      ]);

      // Set quality-specific options
      switch (quality) {
        case "1080p":
          command = command
            .size("1920x1080")
            .videoBitrate("8000k")
            .audioBitrate("192k");
          break;
        case "720p":
          command = command
            .size("1280x720")
            .videoBitrate("5000k")
            .audioBitrate("128k");
          break;
        case "480p":
          command = command
            .size("854x480")
            .videoBitrate("2800k")
            .audioBitrate("128k");
          break;
        case "360p":
          command = command
            .size("640x360")
            .videoBitrate("1400k")
            .audioBitrate("96k");
          break;
      }

      command
        .output(outputPath)
        .on("progress", (progress) => {
          if (onProgress) {
            // Calculate overall progress based on current quality
            const qualityIndex = qualities.indexOf(quality);
            const baseProgress = (qualityIndex / qualities.length) * 100;
            const qualityProgress = (progress.percent || 0) / qualities.length;
            onProgress(baseProgress + qualityProgress);
          }
        })
        .on("end", () => {
          console.log(`Finished transcoding ${quality} for video ${videoId}`);
          resolve();
        })
        .on("error", (err) => {
          console.error(
            `Error transcoding ${quality} for video ${videoId}:`,
            err
          );
          reject(err);
        })
        .run();
    });
  });

  return Promise.all(transcodePromises).then(() => {
    // Verify output files exist
    const files = [
      masterPlaylistPath,
      ...qualities.map((quality) =>
        path.join(outputDir, quality, `${videoId}.m3u8`)
      ),
    ];

    const missingFiles = files.filter((file) => !fs.existsSync(file));
    if (missingFiles.length > 0) {
      throw new Error(`Missing output files: ${missingFiles.join(", ")}`);
    }

    return path.relative(process.cwd(), masterPlaylistPath);
  });
};

module.exports = { transcodeVideo };
