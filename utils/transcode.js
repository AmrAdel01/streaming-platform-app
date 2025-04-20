const ffmpeg = require("fluent-ffmpeg");
const fsPromises = require("fs").promises;
const path = require("path");
const ApiError = require("../utils/ApiError");
const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);

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

exports.transcodeVideo = async (inputPath, outputDir, videoId) => {
  console.log(`Starting FFmpeg transcoding for videoId: ${videoId}`);
  console.log(`Input path: ${inputPath}, Output dir: ${outputDir}`);

  try {
    const outputPath = path.join(outputDir, "master.m3u8");
    const ffmpegCommand = `"${process.env.FFMPEG_PATH}" -i "${inputPath}" -c:v libx264 -c:a aac -f hls -hls_time 10 -hls_list_size 0 -hls_segment_filename "${outputDir}/v%v/segment%d.ts" -master_pl_name master.m3u8 -var_stream_map "v:0,a:0" "${outputDir}/v%v/playlist.m3u8"`;

    console.log(`Executing FFmpeg command: ${ffmpegCommand}`);
    const { stdout, stderr } = await execPromise(ffmpegCommand);

    console.log(`FFmpeg stdout: ${stdout}`);
    if (stderr) {
      console.warn(`FFmpeg stderr: ${stderr}`);
    }

    const hlsPath = path.join("uploads/videos", videoId, "master.m3u8");
    console.log(`Transcoding successful, hlsPath: ${hlsPath}`);
    return hlsPath;
  } catch (error) {
    console.error(`FFmpeg transcoding failed for videoId: ${videoId}:`, {
      message: error.message,
      stderr: error.stderr || "No stderr",
      stdout: error.stdout || "No stdout",
    });
    throw new Error(`Transcoding failed: ${error.message}`);
  }
};
