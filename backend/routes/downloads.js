const path = require("path");
const fs = require("fs");
const express = require("express");
const { logger } = require("../utils/AppLogger");
const {
  downloadAnimeSingle,
  downloadAnimeMulti,
  downloadMangaSingle,
  downloadMangaMulti,
  downloadMovieSingle,
  downloadMovieMulti
} = require("../download");
const {
  getQueue,
  removeQueue,
  removeMultipleFromQueue,
  pauseQueue,
  resumeQueue,
  isQueuePaused
} = require("../utils/queue");
const { setKeyValue } = require("../utils/db");
const { settingfetch } = require("../utils/settings");
const { getDownloadsFolder } = require("../utils/DirectoryMaker");
const {
  analyzeUrl,
  startDownload,
  startBatchDownload,
  pauseQueue: pauseWebQueue,
  resumeQueue: resumeWebQueue,
  pauseJob: pauseWebJob,
  resumeJob: resumeWebJob,
  openJobFolder: openWebJobFolder,
  openJobFile: openWebJobFile,
  deleteJob: deleteWebJob,
  getQueuePauseState,
  cancelDownload,
  clearJobs,
  listJobs,
  getBinaryPath,
  parseExtractorError
} = require("../utils/webMediaDownloader");
const router = express.Router();
router.post("/api/download/:AnimeManga/:singleMulti", async (req, res) => {
  let { AnimeManga, singleMulti } = req.params;
  try {
    let MessageData = null;
    if (AnimeManga === "Movies") {
      AnimeManga = "Movies";
    } else if (AnimeManga === "Manga") {
      AnimeManga = "Manga";
    } else {
      AnimeManga = "Anime";
    }
    const isAnime = AnimeManga === "Anime";
    const isMovies = AnimeManga === "Movies";
    if (singleMulti === "Single") {
      const {
        id,
        ep,
        Title,
        number,
        provider,
        malid = null,
        subdub = null,
        season = null,
        quality = null,
        isSingleMovie = null
      } = req.body;
      const targetEpId = ep && typeof ep === "object" ? ep.id : ep;
      if (isMovies) {
        MessageData = await downloadMovieSingle(
          provider,
          id,
          targetEpId,
          number,
          Title,
          true,
          null,
          null,
          false,
          malid,
          subdub,
          season,
          quality,
          isSingleMovie
        );
      } else if (isAnime) {
        MessageData = await downloadAnimeSingle(
          provider,
          id,
          targetEpId,
          number,
          Title,
          true,
          null,
          null,
          false,
          malid,
          subdub,
          quality
        );
      } else {
        MessageData = await downloadMangaSingle(
          provider,
          id,
          targetEpId,
          number,
          Title,
          true,
          null,
          null,
          false,
          malid
        );
      }
    } else if (singleMulti === "Multi") {
      const {
        id,
        Episodes,
        Chapters,
        Title,
        SubDub,
        provider,
        malid = null,
        quality = null,
        isSingleMovie = null
      } = req.body;
      if (isMovies) {
        MessageData = await downloadMovieMulti(
          provider,
          id,
          Episodes,
          Title,
          SubDub,
          malid,
          quality,
          isSingleMovie
        );
      } else if (isAnime) {
        MessageData = await downloadAnimeMulti(
          provider,
          id,
          Episodes,
          Title,
          SubDub,
          malid,
          quality
        );
      } else {
        MessageData = await downloadMangaMulti(
          provider,
          id,
          Chapters,
          Title,
          malid
        );
      }
    }
    return res.json(MessageData);
  } catch (err) {
    logger.error(`Error in /api/download: ${err.message}`);
    return res.json({ error: true, message: err?.message });
  }
});
router.post("/downloads", async (req, res) => {
  let queue = await getQueue() ?? [];
  let activeItem = queue.find(
    (item) => item.totalSegments > 0 || item.caption && item.caption.includes("Downloading")
  );
  let activeTasks = activeItem ? [activeItem] : [];
  let upcomingQueue = activeItem ? queue.filter((item) => item?.epid !== activeItem.epid) : queue;
  let Response = {
    caption: activeTasks.length > 0 ? activeTasks[0].caption : "Nothing in progress",
    activeTasks: activeTasks.map((task) => ({
      caption: task.caption,
      totalSegments: task.totalSegments,
      currentSegments: task.currentSegments,
      epid: task.epid,
      id: task.id,
      malid: task.malid,
      EpNum: task.EpNum,
      Title: task.Title,
      Type: task.Type,
      season: task.season !== void 0 && task.season !== null ? task.season : task.config?.season !== void 0 ? task.config.season : null,
      concurrency: task.concurrency,
      lastTestedConcurrency: task.lastTestedConcurrency
    })),
    queue: upcomingQueue.map((item) => ({
      ...item,
      season: item.season !== void 0 && item.season !== null ? item.season : item.config?.season !== void 0 ? item.config.season : null
    })),
    isPaused: isQueuePaused()
  };
  if (activeTasks.length > 0) {
    const first = activeTasks[0];
    Response.totalSegments = first.totalSegments;
    Response.currentSegments = first.currentSegments;
    Response.epid = first.epid;
    Response.id = first.id;
    Response.malid = first.malid;
    Response.EpNum = first.EpNum;
    Response.Title = first.Title;
    Response.Type = first.Type;
    Response.season = first.season !== void 0 && first.season !== null ? first.season : first.config?.season !== void 0 ? first.config.season : null;
  }
  return res.json(Response);
});
router.post("/api/download/pause", async (req, res) => {
  try {
    await pauseQueue();
    const queue = await getQueue() ?? [];
    global.sendToRenderer("download-logger", {
      queue,
      isPaused: true,
      message: "Queue paused"
    });
    return res.json({ message: "Queue paused successfully", isPaused: true });
  } catch (err) {
    return res.status(500).json({ error: true, message: err.message });
  }
});
router.post("/api/download/resume", async (req, res) => {
  try {
    await resumeQueue();
    const queue = await getQueue() ?? [];
    global.sendToRenderer("download-logger", {
      queue,
      isPaused: false,
      message: "Queue resumed"
    });
    return res.json({ message: "Queue resumed successfully", isPaused: false });
  } catch (err) {
    return res.status(500).json({ error: true, message: err.message });
  }
});
router.post("/api/local/reorder", async (req, res) => {
  try {
    const { key, order } = req.body;
    if (key && Array.isArray(order) && (key.startsWith("Anime_local_") || key.startsWith("Manga_local_"))) {
      await setKeyValue("Settings", `custom_order_${key}`, order);
    }
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: true, message: err.message });
  }
});
router.post("/api/download/remove", async (req, res) => {
  try {
    const { AnimeEpId } = req.body;
    if (AnimeEpId) {
      let queue2 = await removeQueue(AnimeEpId);
      const itemWithSegments = queue2?.find((item) => item.totalSegments > 0);
      if (itemWithSegments) {
        let caption = itemWithSegments.caption;
        if (!caption) {
          const qualStr = itemWithSegments.config?.quality ? ` ( ${itemWithSegments.config.quality} )` : "";
          if (itemWithSegments.Type === "Anime" || itemWithSegments.Type === "Movies") {
            caption = `Downloading EP ${itemWithSegments.EpNum} ${itemWithSegments.Title}${qualStr}`;
          } else if (itemWithSegments.Type === "Manga") {
            caption = `Downloading CHP ${itemWithSegments.EpNum || itemWithSegments.ChapterTitle} ${itemWithSegments.Title}${qualStr}`;
          } else {
            caption = "Downloading...";
          }
        }
        global.sendToRenderer("download-logger", {
          caption,
          totalSegments: itemWithSegments.totalSegments,
          currentSegments: itemWithSegments.currentSegments,
          epid: itemWithSegments.epid,
          queue: queue2,
          isPaused: isQueuePaused()
        });
      } else {
        global.sendToRenderer("download-logger", {
          queue: queue2,
          message: "Queue is empty",
          isPaused: isQueuePaused()
        });
      }
      return res.json({ message: `Item with ID ${AnimeEpId} removed` });
    }
    const queue = await getQueue();
    const epidsToRemove = queue.filter((item) => item.totalSegments <= 0).map((item) => item.epid);
    const updatedQueue = await removeMultipleFromQueue(epidsToRemove);
    global.sendToRenderer("download-logger", {
      queue: updatedQueue,
      isPaused: isQueuePaused()
    });
    res.json({ message: "All items removed" });
  } catch (err) {
    logger.error(`Error Removing ${req?.body?.AnimeEpId ? "Ep" : "Ep(s)"}`);
    logger.error(`Error message: ${err.message}`);
    logger.error(`Stack trace: ${err.stack}`);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
router.get("/api/downloads/web/status", (req, res) => {
  try {
    const binPath = getBinaryPath();
    const exists = fs.existsSync(binPath);
    res.json({ success: true, binaryPath: binPath, exists });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});
router.post("/api/downloads/web/analyze", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: true, message: "URL is required" });
    }
    const info = await analyzeUrl(url);
    res.json({ success: true, data: info });
  } catch (err) {
    logger.error(`[API Web Media] Analyze error: ${err.message}`);
    const parsed = err.parsedError || parseExtractorError(err.message);
    res.status(500).json({
      error: true,
      message: parsed.message,
      parsedError: parsed
    });
  }
});
router.post("/api/downloads/web/start-batch", async (req, res) => {
  try {
    const { items, formatId, quality, type, destination } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: true, message: "Items list is required" });
    }
    let destinationPath = destination;
    if (!destinationPath) {
      try {
        const config = await settingfetch();
        if (config?.CustomDownloadLocationWebMedia) {
          destinationPath = config.CustomDownloadLocationWebMedia;
        } else {
          destinationPath = path.join(getDownloadsFolder(), "WebMedia");
        }
      } catch (_) {
        destinationPath = null;
      }
    }
    const result = startBatchDownload({
      items,
      formatId,
      quality,
      type,
      destinationPath
    });
    res.json(result);
  } catch (err) {
    logger.error(`[API Web Media] Start batch error: ${err.message}`);
    res.status(500).json({ error: true, message: err.message });
  }
});
router.post("/api/downloads/web/start", async (req, res) => {
  try {
    const { url, formatId, quality, type, destination, title } = req.body;
    if (!url) {
      return res.status(400).json({ error: true, message: "URL is required" });
    }
    let destinationPath = destination;
    if (!destinationPath) {
      try {
        const config = await settingfetch();
        if (config?.CustomDownloadLocationWebMedia) {
          destinationPath = config.CustomDownloadLocationWebMedia;
        } else {
          destinationPath = path.join(getDownloadsFolder(), "WebMedia");
        }
      } catch (_) {
        destinationPath = null;
      }
    }
    const result = startDownload({
      url,
      formatId,
      quality,
      type,
      destinationPath,
      title
    });
    res.json(result);
  } catch (err) {
    logger.error(`[API Web Media] Start download error: ${err.message}`);
    res.status(500).json({ error: true, message: err.message });
  }
});
router.get("/api/downloads/web/jobs", (req, res) => {
  try {
    const jobs = listJobs();
    const isPaused = getQueuePauseState();
    res.json({ success: true, jobs, isPaused });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});
router.post("/api/downloads/web/pause", (req, res) => {
  try {
    const result = pauseWebQueue();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});
router.post("/api/downloads/web/resume", (req, res) => {
  try {
    const result = resumeWebQueue();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});
router.post("/api/downloads/web/cancel", (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) {
      return res.status(400).json({ error: true, message: "jobId is required" });
    }
    const result = cancelDownload(jobId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});
router.post("/api/downloads/web/job/pause", (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: true, message: "jobId is required" });
    const result = pauseWebJob(jobId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});
router.post("/api/downloads/web/job/resume", (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: true, message: "jobId is required" });
    const result = resumeWebJob(jobId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});
router.post("/api/downloads/web/job/open-folder", (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: true, message: "jobId is required" });
    const result = openWebJobFolder(jobId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});
router.post("/api/downloads/web/job/open-file", (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: true, message: "jobId is required" });
    const result = openWebJobFile(jobId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});
router.post("/api/downloads/web/job/delete", (req, res) => {
  try {
    const { jobId, deleteFile = false } = req.body;
    if (!jobId) return res.status(400).json({ error: true, message: "jobId is required" });
    const result = deleteWebJob(jobId, deleteFile);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});
router.post("/api/downloads/web/clear", (req, res) => {
  try {
    const result = clearJobs();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});
if (!global.completedDownloadsHistory) {
  global.completedDownloadsHistory = [];
}
router.get("/api/downloads/history", (req, res) => {
  try {
    const mediaHistory = global.completedDownloadsHistory || [];
    let webHistory = [];
    try {
      const webJobs = listJobs();
      webHistory = (webJobs || []).filter((j) => j.status === "completed" || j.status === "failed").map((j) => ({
        id: j.id,
        title: j.title || j.fileName || "Web Download",
        epNum: null,
        season: null,
        type: "Web",
        completedAt: j.completedAt || j.updatedAt || (/* @__PURE__ */ new Date()).toISOString(),
        status: j.status,
        filePath: j.outputPath || null
      }));
    } catch (_) {
    }
    const combined = [...mediaHistory, ...webHistory].sort((a, b) => {
      const timeA = new Date(a.completedAt || 0).getTime();
      const timeB = new Date(b.completedAt || 0).getTime();
      return timeB - timeA;
    });
    res.json({ history: combined });
  } catch (err) {
    logger.error(`Error in /api/downloads/history: ${err.message}`);
    res.json({ history: [] });
  }
});
router.post("/api/downloads/history/clear", (req, res) => {
  try {
    global.completedDownloadsHistory = [];
    try {
      clearJobs();
    } catch (_) {
    }
    res.json({ success: true, message: "Download history cleared" });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});
router.post("/api/downloads/history/remove", (req, res) => {
  try {
    const { id } = req.body;
    if (id && global.completedDownloadsHistory) {
      global.completedDownloadsHistory = global.completedDownloadsHistory.filter(
        (h) => String(h.id) !== String(id)
      );
    }
    try {
      deleteWebJob(id, false);
    } catch (_) {
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});
module.exports = router;
