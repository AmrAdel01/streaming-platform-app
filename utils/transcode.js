const ffmpeg = require("fluent-ffmpeg");
const fsPromises = require("fs").promises;
const path = require("path");
const ApiError = require("../utils/ApiError");

if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}

ffmpeg.getAvailableCodecs((err, codecs) => {
  if (err) {
    console.error("Failed to get FFmpeg codecs:", err);
    return;
  }
  console.log("FFmpeg codecs:", {
    libx264: !!codecs.libx264,
    aac: !!codecs.aac,
  });
});

const transcodeVideo = async (inputPath, outputDir, videoId) => {
  if (!inputPath || !outputDir || !videoId) {
    throw new ApiError("Missing required parameters for transcoding", 400);
  }

  console.log("Validating input file:", inputPath);
  const fileExists = await fsPromises
    .access(inputPath)
    .then(() => true)
    .catch(() => false);

  if (!fileExists) {
    throw new ApiError("Input video file is inaccessible", 400);
  }

  const probe = await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata);
    });
  });

  console.log("Input file metadata:", probe);
  const hasVideo = probe.streams.some((s) => s.codec_type === "video");
  const hasAudio = probe.streams.some((s) => s.codec_type === "audio");
  console.log("Input file streams:", { hasVideo, hasAudio });

  if (!hasVideo) {
    throw new ApiError("Input file has no video stream", 400);
  }

  const videoStream = probe.streams.find((s) => s.codec_type === "video");
  const inputWidth = videoStream.width;
  const inputHeight = videoStream.height;

  const outputPath = path.join(outputDir, videoId);
  const allResolutions = [
    { name: "360p", width: 640, height: 360, bitrate: "800k" },
    { name: "720p", width: 1280, height: 720, bitrate: "2800k" },
    { name: "1080p", width: 1920, height: 1080, bitrate: "5000k" },
  ];

  const resolutions = allResolutions.filter(
    (res) => inputWidth >= res.width && inputHeight >= res.height
  );
  if (resolutions.length === 0) {
    resolutions.push({
      name: "custom",
      width: inputWidth,
      height: inputHeight,
      bitrate: "800k",
    });
  }

  try {
    console.log("Creating output directory:", outputPath);
    await fsPromises.mkdir(outputPath, { recursive: true });

    const hlsPath = await new Promise((resolve, reject) => {
      const ffmpegCommand = ffmpeg(inputPath);

      // Generate variant playlists for each resolution
      resolutions.forEach((res, index) => {
        const outputFolder = path.join(outputPath, `v${index}`);
        const outputFile = path.join(outputFolder, "playlist.m3u8");

        const streamOptions = [
          `-map v:0`,
          `-s:v:${index} ${res.width}x${res.height}`,
          `-b:v:${index} ${res.bitrate}`,
          `-c:v:${index} libx264`,
          `-preset fast`,
          `-profile:v:${index} main`,
          `-f hls`,
          `-hls_time 10`,
          `-hls_list_size 0`,
          `-hls_segment_filename ${path.join(outputFolder, "segment_%03d.ts")}`,
        ];

        if (hasAudio) {
          streamOptions.push(
            `-map a:0`,
            `-c:a:${index} aac`,
            `-b:a:${index} 128k`
          );
        } else {
          streamOptions.push("-an");
        }

        ffmpegCommand.output(outputFile).outputOptions(streamOptions);
      });

      // Generate the master playlist
      const masterPlaylistPath = path.join(outputPath, "master.m3u8");
      const masterPlaylistContent = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        ...resolutions.map((res, index) => {
          const bandwidth = parseInt(res.bitrate) * 1000;
          return `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${res.width}x${res.height}\nv${index}/playlist.m3u8`;
        }),
      ].join("\n");

      // Write the master playlist manually
      fsPromises.writeFile(masterPlaylistPath, masterPlaylistContent);

      ffmpegCommand
        .on("start", (commandLine) => {
          console.log("FFmpeg command:", commandLine);
        })
        .on("progress", (progress) => {
          console.log(`Transcoding progress: ${progress.percent}%`);
        })
        .on("end", () => {
          console.log("Transcoding completed");
          const relativeHlsPath = path.join(outputDir, videoId, "master.m3u8");
          resolve(relativeHlsPath);
        })
        .on("error", (err, stdout, stderr) => {
          console.error("FFmpeg error:", err.message);
          console.error("FFmpeg stdout:", stdout);
          console.error("FFmpeg stderr:", stderr);
          reject(new Error(`FFmpeg transcoding failed: ${err.message}`));
        })
        .run();
    });

    return hlsPath;
  } catch (err) {
    console.error("Transcode error:", err);
    const exists = await fsPromises
      .access(outputPath)
      .then(() => true)
      .catch(() => false);

    if (exists) {
      await fsPromises
        .rm(outputPath, { recursive: true, force: true })
        .catch((e) => console.error("Cleanup failed:", e));
    }

    throw new ApiError(`Failed to transcode video: ${err.message}`, 500);
  }
};

module.exports = { transcodeVideo };
