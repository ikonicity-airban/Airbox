const { execFile, spawn, exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { logger } = require("./AppLogger");
const activeJobs = /* @__PURE__ */ new Map();
let isQueuePaused = false;
let globalQueueCounter = 0;
function getBinaryPath() {
  if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) {
    return process.env.YTDLP_PATH;
  }
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const candidates = [
    path.join(appData, "strawverse", "bin", "yt-dlp.exe"),
    path.join(appData, "iconmedia", "bin", "yt-dlp.exe"),
    path.join(__dirname, "..", "..", "bin", "yt-dlp.exe"),
    path.join(__dirname, "..", "..", "bin", "yt-dlp"),
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
    "yt-dlp"
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return "yt-dlp";
}
function getFfmpegPath() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  const isWin = process.platform === "win32";
  const exeName = isWin ? "ffmpeg.exe" : "ffmpeg";
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const candidates = [
    path.join(__dirname, "..", "..", "electron", "node_modules", "ffmpeg-static", exeName),
    path.join(__dirname, "..", "..", "electron", "ffmpeg", isWin ? "win32" : process.platform, exeName),
    path.join(appData, "strawverse", "bin", exeName),
    path.join(appData, "iconmedia", "bin", exeName),
    path.join(__dirname, "..", "..", "bin", exeName),
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
    "ffmpeg"
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return "ffmpeg";
}
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return "Unknown";
  const sec = Math.floor(seconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor(sec % 3600 / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}
function parseExtractorError(rawError) {
  if (!rawError || typeof rawError !== "string") {
    return {
      title: "Unable to Load Media",
      message: "An unexpected error occurred while analyzing the link. Please verify the URL and try again.",
      actionHint: "Check your network connection and ensure the link is publicly accessible.",
      technical: String(rawError || ""),
      type: "unknown"
    };
  }
  const errStr = rawError.trim();
  if (errStr.includes("Sign in to confirm your age") || errStr.includes("inappropriate for some users")) {
    return {
      title: "Age-Restricted Content",
      message: "YouTube requires account sign-in confirmation for this content. Unauthenticated extractors cannot access age-restricted videos without browser cookies.",
      actionHint: "Try an unrestricted video or playlist, or configure browser cookies in Settings.",
      technical: errStr,
      type: "age_restricted"
    };
  }
  if (errStr.includes("The playlist does not exist") || errStr.includes("playlist does not exist")) {
    return {
      title: "Playlist Not Found or Inaccessible",
      message: "YouTube reported that this playlist does not exist, has been removed, or is set to private.",
      actionHint: "Verify that the playlist URL is public and that the playlist ID is correct.",
      technical: errStr,
      type: "not_found"
    };
  }
  if (errStr.includes("Private video") || errStr.includes("This video is private")) {
    return {
      title: "Private Video",
      message: "This video is marked private by the uploader and cannot be accessed publicly.",
      actionHint: "Only the owner and authorized accounts can view private videos.",
      technical: errStr,
      type: "private"
    };
  }
  if (errStr.includes("Video unavailable") || errStr.includes("This video is not available")) {
    return {
      title: "Video Unavailable",
      message: "This video has been removed, region-locked, or is not available on YouTube.",
      actionHint: "Verify the link in your web browser.",
      technical: errStr,
      type: "unavailable"
    };
  }
  const lines = errStr.split("\n").map((l) => l.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/i, "").trim()).filter(Boolean);
  const firstCleanLine = lines[0] || "Failed to analyze link";
  return {
    title: "Analysis Failed",
    message: firstCleanLine,
    actionHint: "Please check the URL or test if the link is accessible in your browser.",
    technical: errStr,
    type: "general"
  };
}
function analyzeUrl(videoUrl) {
  return new Promise((resolve, reject) => {
    const cleanUrl = (videoUrl || "").trim().replace(/[\\]+$/, "");
    if (!cleanUrl) {
      return reject(new Error("A valid URL is required"));
    }
    const binary = getBinaryPath();
    const isPlaylist = /[?&]list=/i.test(cleanUrl) || /\/playlist\?/i.test(cleanUrl);
    if (isPlaylist) {
      const args2 = [
        "--js-runtimes",
        `node:${process.execPath}`,
        "--flat-playlist",
        "--dump-single-json",
        "--ignore-errors",
        "--no-warnings",
        cleanUrl
      ];
      execFile(binary, args2, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err && (!stdout || stdout.trim().length === 0)) {
          logger.error(`[WebMediaDownloader] Playlist analyze failed: ${stderr || err.message}`);
          const parsed = parseExtractorError(stderr || err.message);
          const customErr = new Error(parsed.message);
          customErr.parsedError = parsed;
          return reject(customErr);
        }
        try {
          const data = JSON.parse(stdout);
          const rawEntries = Array.isArray(data.entries) ? data.entries : [];
          const entries = rawEntries.filter((e) => e && e.title && e.title !== "[Private video]" && e.title !== "[Deleted video]").map((e, idx) => ({
            index: idx + 1,
            id: e.id || "",
            title: e.title || `Video ${idx + 1}`,
            uploader: e.uploader || e.channel || data.uploader || "",
            duration: formatDuration(e.duration),
            rawDuration: e.duration || 0,
            thumbnail: e.thumbnails?.[e.thumbnails.length - 1]?.url || (e.id ? `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg` : ""),
            url: e.url || (e.id ? `https://www.youtube.com/watch?v=${e.id}` : "")
          }));
          if (entries.length === 0 && stderr) {
            const parsed = parseExtractorError(stderr);
            const customErr = new Error(parsed.message);
            customErr.parsedError = parsed;
            return reject(customErr);
          }
          resolve({
            isPlaylist: true,
            id: data.id || "",
            title: data.title || "YouTube Playlist",
            uploader: data.uploader || data.channel || "YouTube",
            entryCount: entries.length,
            rawCount: rawEntries.length,
            thumbnail: entries[0]?.thumbnail || "",
            url: cleanUrl,
            webpageUrl: cleanUrl,
            entries,
            options: [
              {
                id: "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
                label: "1080p MP4",
                quality: "1080p",
                type: "video",
                ext: "mp4"
              },
              {
                id: "bestvideo[height<=720]+bestaudio/best[height<=720]/best",
                label: "720p MP4",
                quality: "720p",
                type: "video",
                ext: "mp4"
              },
              {
                id: "bestvideo[height<=480]+bestaudio/best[height<=480]/best",
                label: "480p MP4",
                quality: "480p",
                type: "video",
                ext: "mp4"
              },
              {
                id: "bestaudio/best",
                label: "Audio Only (MP3)",
                quality: "Audio",
                type: "audio",
                ext: "mp3"
              }
            ]
          });
        } catch (parseErr) {
          const parsed = parseExtractorError(stderr || parseErr.message);
          const customErr = new Error(parsed.message);
          customErr.parsedError = parsed;
          return reject(customErr);
        }
      });
      return;
    }
    const args = [
      "--js-runtimes",
      `node:${process.execPath}`,
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      cleanUrl
    ];
    execFile(binary, args, { maxBuffer: 25 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        logger.error(`[WebMediaDownloader] Analyze failed: ${stderr || err.message}`);
        const parsed = parseExtractorError(stderr || err.message);
        const customErr = new Error(parsed.message);
        customErr.parsedError = parsed;
        return reject(customErr);
      }
      try {
        const data = JSON.parse(stdout);
        const rawFormats = Array.isArray(data.formats) ? data.formats : [];
        const standardHeights = [1080, 720, 480, 360];
        const videoOptions = [];
        for (const height of standardHeights) {
          const progressiveMatch = rawFormats.find(
            (f) => f.height === height && f.ext === "mp4" && f.vcodec !== "none" && f.acodec !== "none"
          );
          if (progressiveMatch || data.height && data.height >= height || rawFormats.some((f) => f.height === height)) {
            const formatSpec = progressiveMatch ? progressiveMatch.format_id : `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;
            videoOptions.push({
              id: formatSpec,
              label: `${height}p MP4`,
              quality: `${height}p`,
              type: "video",
              ext: "mp4",
              size: formatBytes(progressiveMatch?.filesize || progressiveMatch?.filesize_approx)
            });
          }
        }
        if (videoOptions.length === 0) {
          videoOptions.push({
            id: "bestvideo+bestaudio/best",
            label: "Best Quality Video",
            quality: data.height ? `${data.height}p` : "Best",
            type: "video",
            ext: "mp4",
            size: formatBytes(data.filesize || data.filesize_approx)
          });
        }
        const audioOptions = [
          {
            id: "bestaudio/best",
            label: "Audio Only (MP3)",
            quality: "Audio",
            type: "audio",
            ext: "mp3",
            size: ""
          },
          {
            id: "bestaudio[ext=m4a]/bestaudio/best",
            label: "Audio Only (M4A)",
            quality: "Audio",
            type: "audio",
            ext: "m4a",
            size: ""
          }
        ];
        const result = {
          id: data.id || "",
          title: data.title || "Web Video",
          uploader: data.uploader || data.channel || "Web Media",
          duration: formatDuration(data.duration),
          rawDuration: data.duration || 0,
          thumbnail: data.thumbnail || data.thumbnails && data.thumbnails[data.thumbnails.length - 1]?.url || "",
          url: videoUrl.trim(),
          webpageUrl: data.webpage_url || videoUrl.trim(),
          options: [...videoOptions, ...audioOptions]
        };
        resolve(result);
      } catch (parseErr) {
        reject(new Error("Failed to parse video format data from extractor"));
      }
    });
  });
}
function createJob({ url, formatId = "best", type = "video", quality = "720p", destinationPath = null, title = null, playlistIndex = null }) {
  globalQueueCounter += 1;
  const jobId = `job_${Date.now()}_${globalQueueCounter}_${Math.random().toString(36).substring(2, 6)}`;
  const cleanTitle = (title || "Video").replace(/[\\/:*?"<>|]/g, "").trim();
  const defaultDir = destinationPath && fs.existsSync(destinationPath) ? destinationPath : path.join(os.homedir(), "Downloads", "Iconmedia");
  if (!fs.existsSync(defaultDir)) {
    try {
      fs.mkdirSync(defaultDir, { recursive: true });
    } catch (_) {
    }
  }
  const job = {
    id: jobId,
    queueOrder: globalQueueCounter,
    playlistIndex: playlistIndex || globalQueueCounter,
    url: (url || "").trim().replace(/[\\]+$/, ""),
    title: cleanTitle,
    quality: quality || "Best",
    type: type || "video",
    formatId,
    progress: 0,
    speed: "",
    eta: "",
    status: "queued",
    // queued, downloading, completed, paused, error, cancelled
    destinationDir: defaultDir,
    filePath: "",
    error: null,
    startTime: Date.now(),
    processRef: null
  };
  activeJobs.set(jobId, job);
  return job;
}
function processNextInQueue() {
  if (isQueuePaused) {
    logger.info("[WebMediaDownloader] Queue is currently paused.");
    return;
  }
  let activeCount = 0;
  for (const job of activeJobs.values()) {
    if (job.status === "downloading") {
      activeCount++;
    }
  }
  if (activeCount >= 1) {
    return;
  }
  const queuedJobs = [];
  for (const job of activeJobs.values()) {
    if (job.status === "queued") {
      queuedJobs.push(job);
    }
  }
  if (queuedJobs.length === 0) return;
  queuedJobs.sort((a, b) => a.queueOrder - b.queueOrder);
  const nextJob = queuedJobs[0];
  executeJobDownload(nextJob);
}
function executeJobDownload(job) {
  const binary = getBinaryPath();
  const cleanUrl = job.url;
  job.status = "downloading";
  job.speed = "Starting...";
  job.startTime = Date.now();
  notifyRenderer(job);
  const args = [
    "--newline",
    "--no-playlist",
    "--no-warnings",
    "-c",
    // Resume partial downloads seamlessly
    "-P",
    job.destinationDir,
    "-o",
    "%(title)s.%(ext)s"
  ];
  const ffmpegBin = getFfmpegPath();
  if (ffmpegBin && fs.existsSync(ffmpegBin)) {
    args.push("--ffmpeg-location", ffmpegBin);
  }
  if (job.type === "audio") {
    args.push("-x", "--audio-format", "mp3");
  } else {
    let selectedFormat = job.formatId;
    if (!selectedFormat || selectedFormat === "best") {
      selectedFormat = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best";
    } else if (!selectedFormat.includes("+") && !selectedFormat.includes("bestaudio")) {
      selectedFormat = `${selectedFormat}+bestaudio/best`;
    }
    args.push("-f", selectedFormat, "--merge-output-format", "mp4");
  }
  args.push(cleanUrl);
  logger.info(`[WebMediaDownloader] Turn started for job #${job.queueOrder}: ${cleanUrl} (${job.title})`);
  try {
    const proc = spawn(binary, args);
    job.processRef = proc;
    proc.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      const percentMatch = text.match(/\[download\]\s+([\d.]+)%/);
      const speedMatch = text.match(/at\s+([\d.]+\s*\w+\/s)/);
      const etaMatch = text.match(/ETA\s+([\d:]+)/);
      const destinationMatch = text.match(/\[download\] Destination:\s*(.*)/) || text.match(/\[Merger\] Merging formats into "(.*)"/);
      if (percentMatch) {
        job.progress = parseFloat(percentMatch[1]);
      }
      if (speedMatch) {
        job.speed = speedMatch[1].trim();
      }
      if (etaMatch) {
        job.eta = etaMatch[1].trim();
      }
      if (destinationMatch && destinationMatch[1]) {
        job.filePath = destinationMatch[1].trim();
      }
      notifyRenderer(job);
    });
    proc.stderr.on("data", (chunk) => {
      logger.warn(`[WebMediaDownloader] Stderr: ${chunk.toString().trim()}`);
    });
    proc.on("close", (code) => {
      job.processRef = null;
      if (code === 0) {
        job.status = "completed";
        job.progress = 100;
        job.speed = "Done";
        job.eta = "00:00";
        job.completedTime = Date.now();
        logger.info(`[WebMediaDownloader] Completed job #${job.queueOrder} (${job.title})`);
      } else if (job.status !== "cancelled" && job.status !== "paused") {
        job.status = "error";
        job.error = `Extractor process exited with code ${code}`;
        logger.error(`[WebMediaDownloader] Job #${job.queueOrder} failed with code ${code}`);
      }
      notifyRenderer(job);
      processNextInQueue();
    });
    proc.on("error", (err) => {
      job.processRef = null;
      if (job.status !== "cancelled" && job.status !== "paused") {
        job.status = "error";
        job.error = err.message;
        logger.error(`[WebMediaDownloader] Process error on job #${job.queueOrder}: ${err.message}`);
      }
      notifyRenderer(job);
      processNextInQueue();
    });
  } catch (spawnErr) {
    job.processRef = null;
    job.status = "error";
    job.error = spawnErr.message;
    notifyRenderer(job);
    processNextInQueue();
  }
}
function startDownload({ url, formatId = "best", type = "video", quality = "720p", destinationPath = null, title = null }) {
  const job = createJob({
    url,
    formatId,
    type,
    quality,
    destinationPath,
    title
  });
  processNextInQueue();
  return { success: true, jobId: job.id, job: sanitizeJob(job) };
}
function startBatchDownload({ items = [], formatId = "best", type = "video", quality = "720p", destinationPath = null }) {
  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, message: "No items provided for batch download" };
  }
  const createdJobs = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item?.url) continue;
    const job = createJob({
      url: item.url,
      formatId: item.formatId || formatId,
      type: item.type || type,
      quality: item.quality || quality,
      destinationPath,
      title: item.title,
      playlistIndex: item.index || i + 1
    });
    createdJobs.push(sanitizeJob(job));
  }
  processNextInQueue();
  return { success: true, count: createdJobs.length, jobs: createdJobs };
}
function pauseQueue() {
  isQueuePaused = true;
  for (const job of activeJobs.values()) {
    if (job.status === "downloading" && job.processRef) {
      job.status = "paused";
      job.speed = "Paused";
      try {
        job.processRef.kill("SIGTERM");
      } catch (_) {
      }
      job.processRef = null;
      notifyRenderer(job);
    }
  }
  return { success: true, isPaused: true };
}
function resumeQueue() {
  isQueuePaused = false;
  for (const job of activeJobs.values()) {
    if (job.status === "paused") {
      job.status = "queued";
      job.speed = "";
      notifyRenderer(job);
    }
  }
  processNextInQueue();
  return { success: true, isPaused: false };
}
function getQueuePauseState() {
  return isQueuePaused;
}
function cancelDownload(jobId) {
  const job = activeJobs.get(jobId);
  if (!job) return { success: false, message: "Job not found" };
  const wasDownloading = job.status === "downloading";
  job.status = "cancelled";
  job.speed = "Cancelled";
  if (job.processRef) {
    try {
      job.processRef.kill("SIGTERM");
    } catch (_) {
    }
    job.processRef = null;
  }
  notifyRenderer(job);
  if (wasDownloading) {
    processNextInQueue();
  }
  return { success: true };
}
function pauseJob(jobId) {
  const job = activeJobs.get(jobId);
  if (!job) return { success: false, message: "Job not found" };
  const wasDownloading = job.status === "downloading";
  job.status = "paused";
  job.speed = "Paused";
  if (job.processRef) {
    try {
      job.processRef.kill("SIGTERM");
    } catch (_) {
    }
    job.processRef = null;
  }
  notifyRenderer(job);
  if (wasDownloading) {
    processNextInQueue();
  }
  return { success: true, job: sanitizeJob(job) };
}
function resumeJob(jobId) {
  const job = activeJobs.get(jobId);
  if (!job) return { success: false, message: "Job not found" };
  if (job.status === "paused") {
    job.status = "queued";
    job.speed = "";
    notifyRenderer(job);
    processNextInQueue();
  }
  return { success: true, job: sanitizeJob(job) };
}
function openJobFolder(jobId) {
  const job = activeJobs.get(jobId);
  if (!job) return { success: false, message: "Job not found" };
  const isWindows = process.platform === "win32";
  const isMac = process.platform === "darwin";
  let targetPath = null;
  if (job.filePath && fs.existsSync(job.filePath)) {
    targetPath = job.filePath;
  } else if (job.destinationDir && fs.existsSync(job.destinationDir)) {
    targetPath = job.destinationDir;
  } else {
    targetPath = path.join(os.homedir(), "Downloads", "Iconmedia");
  }
  if (fs.existsSync(targetPath)) {
    const isDir = fs.statSync(targetPath).isDirectory();
    if (isWindows) {
      if (!isDir) {
        exec(`explorer.exe /select,"${targetPath}"`);
      } else {
        exec(`explorer.exe "${targetPath}"`);
      }
    } else if (isMac) {
      if (!isDir) {
        exec(`open -R "${targetPath}"`);
      } else {
        exec(`open "${targetPath}"`);
      }
    } else {
      exec(`xdg-open "${targetPath}"`);
    }
    return { success: true };
  }
  return { success: false, message: "Path does not exist" };
}
function openJobFile(jobId) {
  const job = activeJobs.get(jobId);
  if (!job) return { success: false, message: "Job not found" };
  const isWindows = process.platform === "win32";
  const isMac = process.platform === "darwin";
  let filePath = job.filePath;
  if (!filePath || !fs.existsSync(filePath)) {
    if (job.destinationDir && fs.existsSync(job.destinationDir)) {
      try {
        const files = fs.readdirSync(job.destinationDir);
        const cleanTitle = job.title.toLowerCase().substring(0, 15);
        const match = files.find((f) => f.toLowerCase().includes(cleanTitle));
        if (match) {
          filePath = path.join(job.destinationDir, match);
        }
      } catch (_) {
      }
    }
  }
  if (filePath && fs.existsSync(filePath)) {
    if (isWindows) {
      exec(`start "" "${filePath}"`);
    } else if (isMac) {
      exec(`open "${filePath}"`);
    } else {
      exec(`xdg-open "${filePath}"`);
    }
    return { success: true };
  }
  return { success: false, message: "Downloaded file not found on disk" };
}
function deleteJob(jobId, deleteFile = false) {
  const job = activeJobs.get(jobId);
  if (!job) return { success: false, message: "Job not found" };
  const wasDownloading = job.status === "downloading";
  if (job.processRef) {
    try {
      job.processRef.kill("SIGTERM");
    } catch (_) {
    }
    job.processRef = null;
  }
  if (deleteFile && job.filePath && fs.existsSync(job.filePath)) {
    try {
      fs.unlinkSync(job.filePath);
    } catch (err) {
      logger.warn(`[WebMediaDownloader] Failed to delete file ${job.filePath}: ${err.message}`);
    }
  }
  activeJobs.delete(jobId);
  if (wasDownloading) {
    processNextInQueue();
  }
  return { success: true };
}
function clearJobs() {
  for (const [id, job] of activeJobs.entries()) {
    if (job.status === "completed" || job.status === "cancelled" || job.status === "error") {
      activeJobs.delete(id);
    }
  }
  return { success: true };
}
function sanitizeJob(job) {
  if (!job) return null;
  const { processRef, ...rest } = job;
  return rest;
}
function listJobs() {
  const list = [];
  for (const job of activeJobs.values()) {
    list.push(sanitizeJob(job));
  }
  return list.sort((a, b) => a.queueOrder - b.queueOrder);
}
function notifyRenderer(job) {
  if (typeof global !== "undefined" && typeof global.sendToRenderer === "function") {
    try {
      global.sendToRenderer("web-media-progress", sanitizeJob(job));
    } catch (_) {
    }
  }
}
module.exports = {
  analyzeUrl,
  startDownload,
  startBatchDownload,
  pauseQueue,
  resumeQueue,
  pauseJob,
  resumeJob,
  openJobFolder,
  openJobFile,
  deleteJob,
  getQueuePauseState,
  cancelDownload,
  clearJobs,
  listJobs,
  getBinaryPath,
  getFfmpegPath,
  parseExtractorError
};
