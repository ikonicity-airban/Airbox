const path = require("path");
const fs = require("fs");
if (!global.PORT) {
  global.PORT = 9545;
}
const VIDEO_EXTENSIONS = Object.freeze([".mp4", ".ts"]);
const SUBTITLE_EXTENSIONS = Object.freeze([".srt", ".vtt"]);
const MANGA_EXTENSIONS = Object.freeze([".cbz"]);
const isWindows = process.platform === "win32";
const isMac = process.platform === "darwin";
const isLinux = process.platform === "linux";
const isAndroid = Boolean(
  process.env.NODEJS_MOBILE_DATA_DIR || process.env.DATADIR || process.platform === "android"
);
function getOSName() {
  if (isAndroid) return "Android";
  if (isWindows) return "Windows";
  if (isMac) return "macOS";
  return "Linux";
}
function isVideoFile(fileNameOrPath) {
  if (!fileNameOrPath) return false;
  const ext = path.extname(fileNameOrPath).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
}
function isSubtitleFile(fileNameOrPath) {
  if (!fileNameOrPath) return false;
  const ext = path.extname(fileNameOrPath).toLowerCase();
  return SUBTITLE_EXTENSIONS.includes(ext);
}
function isMangaFile(fileNameOrPath) {
  if (!fileNameOrPath) return false;
  const ext = path.extname(fileNameOrPath).toLowerCase();
  return MANGA_EXTENSIONS.includes(ext);
}
function isMediaFile(fileNameOrPath, type = "Anime") {
  const norm = String(type || "").toLowerCase();
  return norm === "anime" || norm === "movies" ? isVideoFile(fileNameOrPath) : isMangaFile(fileNameOrPath);
}
const SEASON_FOLDER_RE = /^Season \d+$/i;
function hasLocalMediaFiles(dirPath, type = "Anime", includeSeasons = false) {
  if (!dirPath || !fs.existsSync(dirPath)) return false;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.some((e) => {
      if (e.name.startsWith(".")) return false;
      if (e.isDirectory()) {
        return includeSeasons && SEASON_FOLDER_RE.test(e.name) && hasLocalMediaFiles(path.join(dirPath, e.name), type, false);
      }
      return isMediaFile(e.name, type);
    });
  } catch (_) {
    return false;
  }
}
function migrateOrCheckLegacyData(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) return;
  const targetDb = path.join(targetPath, "database.db");
  if (!fs.existsSync(targetDb)) {
    const parent = path.dirname(targetPath);
    const legacyCandidates = [
      path.join(parent, "Iconmedia"),
      path.join(parent, "iconmedia"),
      path.join(parent, "StrawVerse"),
      path.join(parent, "strawverse")
    ];
    for (const legacy of legacyCandidates) {
      const legacyDb = path.join(legacy, "database.db");
      if (fs.existsSync(legacyDb)) {
        try {
          fs.copyFileSync(legacyDb, targetDb);
          const legacySettings = path.join(legacy, "settings.json");
          const targetSettings = path.join(targetPath, "settings.json");
          if (fs.existsSync(legacySettings) && !fs.existsSync(targetSettings)) {
            fs.copyFileSync(legacySettings, targetSettings);
          }
          const legacyMapping = path.join(legacy, "mapping.db");
          const targetMapping = path.join(targetPath, "mapping.db");
          if (fs.existsSync(legacyMapping) && !fs.existsSync(targetMapping)) {
            fs.copyFileSync(legacyMapping, targetMapping);
          }
          break;
        } catch (_) {
        }
      }
    }
  }
}
function getUserDataPath() {
  let userDataPath = process.env.AIRBOX_DATA_DIR || process.env.STRAWVERSE_DATA_DIR;
  if (!userDataPath) {
    try {
      const { app } = require("electron");
      if (app && typeof app.getPath === "function") {
        userDataPath = app.getPath("userData");
      }
    } catch (_) {
    }
  }
  if (!userDataPath) {
    const mobileDir = process.env.NODEJS_MOBILE_DATA_DIR || process.env.DATADIR;
    userDataPath = mobileDir ? path.join(mobileDir, "data") : process.cwd();
  }
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    migrateOrCheckLegacyData(userDataPath);
  } catch (_) {
  }
  return userDataPath;
}
function sanitizeFolderName(title) {
  if (!title) return "Untitled";
  const sanitized = String(title).replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "");
  return sanitized || "Untitled";
}
function cleanAlphanumeric(str) {
  return String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function isUuid(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
    String(str || "")
  );
}
function getEpisodeNumberFromFilename(filename) {
  if (!filename || !isVideoFile(filename)) return null;
  let match = filename.match(/\bS\d{1,3}E(?:p)?(\d+(?:\.\d+)?)/i);
  if (match) return parseFloat(match[1]);
  match = filename.match(/^(\d+(?:\.\d+)?)(?:ep|\b)/i);
  if (match) return parseFloat(match[1]);
  match = filename.match(/(?:ep|episode)\s*(\d+(?:\.\d+)?)/i);
  if (match) return parseFloat(match[1]);
  const cleanedName = filename.replace(/[\(\[\{]?(?:19|20)\d{2}[\)\]\}]?/g, " ").replace(/\b(?:480|720|1080|2160)p?\b/gi, " ").replace(/\b4k\b/gi, " ");
  match = cleanedName.match(/[-_ ](\d+(?:\.\d+)?)\.[a-z0-9]+$/i);
  if (match) return parseFloat(match[1]);
  match = cleanedName.match(/\b(\d+(?:\.\d+)?)\b/);
  return match ? parseFloat(match[1]) : null;
}
function mediaServerFileBase(directory, episode, quality, isSingleMovie = false, movieTitle = null, year = null) {
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  const dirName = path.basename(directory);
  const m = dirName.match(/^Season (\d+)$/i);
  const series = m ? path.basename(path.dirname(directory)) : dirName;
  const season = m ? parseInt(m[1], 10) : 1;
  const q = quality ? ` [${quality}]` : "";
  if (isSingleMovie) {
    const title = movieTitle || series;
    const cleanTitle = sanitizeFolderName(title || "Movie");
    const yearStr = year ? ` (${year})` : "";
    return `${cleanTitle}${yearStr}${q}`;
  }
  const epNum = parseFloat(episode);
  let epStr;
  if (isNaN(epNum)) {
    epStr = pad(episode);
  } else if (Number.isInteger(epNum)) {
    epStr = epNum < 100 ? pad(epNum, 2) : String(epNum);
  } else {
    const [intPart, decPart] = String(epNum).split(".");
    epStr = `${pad(intPart, 2)}.${decPart}`;
  }
  return `${series} - S${pad(season, 2)}E${epStr}${q}`;
}
function getChapterNumberFromFilename(filename) {
  if (!filename || !isMangaFile(filename)) return null;
  let match = filename.match(/(?:chapter|chp|ch)\.?\s*(\d+(?:\.\d+)?)/i);
  if (match) return parseFloat(match[1]);
  match = filename.match(/^(\d+(?:\.\d+)?)/);
  if (match) return parseFloat(match[1]);
  match = filename.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function parseTags(val) {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map((t) => String(t).trim()).filter(Boolean);
  }
  const str = String(val).trim();
  if (!str || str === "[]") return [];
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(parsed)) {
      return parsed.map((t) => String(t).trim()).filter(Boolean);
    }
    if (typeof parsed === "string" && parsed.trim()) {
      return [parsed.trim()];
    }
  } catch (_) {
  }
  if (str.includes(",")) {
    return str.split(",").map((t) => t.trim()).filter(Boolean);
  }
  return [str];
}
const SYSTEM_TAGS = Object.freeze({
  Anime: Object.freeze(["Watching", "Plan to Watch", "Completed", "Downloads"]),
  Manga: Object.freeze(["Reading", "Plan to Read", "Completed", "Downloads"]),
  Movies: Object.freeze([
    "Watching",
    "Plan to Watch",
    "Completed",
    "Downloads"
  ])
});
const RESERVED_TAGS = Object.freeze({
  Anime: Object.freeze(SYSTEM_TAGS.Anime.map((t) => t.toLowerCase())),
  Manga: Object.freeze(SYSTEM_TAGS.Manga.map((t) => t.toLowerCase())),
  Movies: Object.freeze(SYSTEM_TAGS.Movies.map((t) => t.toLowerCase()))
});
function getReservedTags(type = "Anime") {
  const norm = String(type).toLowerCase();
  if (norm === "manga") return SYSTEM_TAGS.Manga;
  if (norm === "movies") return SYSTEM_TAGS.Movies;
  return SYSTEM_TAGS.Anime;
}
function isReservedTag(tag, type = null) {
  if (!tag || typeof tag !== "string") return false;
  const lower = tag.trim().toLowerCase();
  if (type) {
    const norm = String(type).toLowerCase();
    const tagList = norm === "manga" ? RESERVED_TAGS.Manga : norm === "movies" ? RESERVED_TAGS.Movies : RESERVED_TAGS.Anime;
    return tagList.includes(lower);
  }
  return RESERVED_TAGS.Anime.includes(lower) || RESERVED_TAGS.Manga.includes(lower) || RESERVED_TAGS.Movies.includes(lower);
}
const MAL_ANIME_STATUSES = Object.freeze([
  "plan_to_watch",
  "watching",
  "completed",
  "on_hold",
  "dropped"
]);
const MAL_MANGA_STATUSES = Object.freeze([
  "plan_to_read",
  "reading",
  "completed",
  "on_hold",
  "dropped"
]);
const MAL_STATUSES = Object.freeze({
  Anime: MAL_ANIME_STATUSES,
  Manga: MAL_MANGA_STATUSES
});
function getValidMalStatuses(type = "Anime") {
  const isManga = String(type).toLowerCase() === "manga";
  return isManga ? MAL_MANGA_STATUSES : MAL_ANIME_STATUSES;
}
const getMalStatuses = getValidMalStatuses;
function isValidMalStatus(status, type = "Anime") {
  if (!status || typeof status !== "string") return false;
  return getValidMalStatuses(type).includes(status.trim().toLowerCase());
}
function getMalStatusLabel(status) {
  if (!status || typeof status !== "string") return "";
  return String(status).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
const GITHUB_REPO = "TheYogMehta/StrawVerse";
const DISCORD_CLIENT_ID = "1372260492982358016";
const DISCORD_IDLE_MESSAGES = Object.freeze([
  "Taking a quick snack break \u{1F355}",
  "Browsing the anime shelves...",
  "Just chilling with some tea \u2615",
  "Plotting the next binge watch...",
  "Waiting for the next episode drop \u{1F4FA}",
  "In a deep anime rabbit hole \u{1F300}",
  "Dreaming of anime worlds \u2728",
  "Catching up on all the latest manga \u{1F4DA}",
  "In anime zen mode \u{1F9D8}",
  "Lost in thought (and anime) \u{1F914}",
  "Currently AFK send snacks! \u{1F369}",
  "Daydreaming about the next arc..."
]);
function getCurrentAppVersion() {
  try {
    const { app } = require("electron");
    if (app && typeof app.getVersion === "function") {
      const v = app.getVersion();
      if (v) return v;
    }
  } catch (_) {
  }
  try {
    const pkg = require("../../package.json");
    if (pkg && pkg.version) return pkg.version;
  } catch (_) {
  }
  return process.env.STRAWVERSE_APP_VERSION || "10.1.2";
}
function sortSourcesByPreferredQuality(sources, preferredQuality = "highest") {
  if (!sources || !Array.isArray(sources) || sources.length <= 1) {
    return sources ? [...sources] : [];
  }
  const parseQualNum = (s) => {
    const qStr = (s?.quality || s?.name || "").toLowerCase();
    const match = qStr.match(/(\d+)p/);
    if (match) return parseInt(match[1], 10);
    if (qStr.includes("1080")) return 1080;
    if (qStr.includes("720")) return 720;
    if (qStr.includes("480")) return 480;
    if (qStr.includes("360")) return 360;
    return 0;
  };
  const prefNorm = String(preferredQuality || "highest").toLowerCase().trim();
  const copy = [...sources];
  if (prefNorm !== "highest" && prefNorm !== "auto" && prefNorm !== "default") {
    const prefNum = parseInt(prefNorm.replace(/\D/g, ""), 10);
    if (prefNum > 0) {
      const matchIdx = copy.findIndex((s) => parseQualNum(s) === prefNum);
      if (matchIdx > 0) {
        const matched = copy.splice(matchIdx, 1)[0];
        copy.unshift(matched);
        return copy;
      }
    }
  }
  const hasQualities = copy.some((s) => parseQualNum(s) > 0);
  if (hasQualities) {
    copy.sort((a, b) => parseQualNum(b) - parseQualNum(a));
  }
  return copy;
}
function formatEpisodeFilename(optsOrTitle = {}, epNumArg, namingSchemeArg, extArg, totalEpisodesArg, seasonArg) {
  let title, epNum, season, totalEpisodes, namingScheme, ext;
  if (typeof optsOrTitle === "object" && optsOrTitle !== null) {
    title = optsOrTitle.title || "";
    epNum = optsOrTitle.epNum !== void 0 ? optsOrTitle.epNum : 1;
    season = optsOrTitle.season !== void 0 ? optsOrTitle.season : 1;
    totalEpisodes = optsOrTitle.totalEpisodes !== void 0 ? optsOrTitle.totalEpisodes : null;
    namingScheme = optsOrTitle.namingScheme || "default";
    ext = optsOrTitle.ext || ".mp4";
  } else {
    title = optsOrTitle || "";
    epNum = epNumArg !== void 0 ? epNumArg : 1;
    namingScheme = namingSchemeArg || "default";
    ext = extArg || ".mp4";
    totalEpisodes = totalEpisodesArg !== void 0 ? totalEpisodesArg : null;
    season = seasonArg !== void 0 ? seasonArg : 1;
  }
  if (optsOrTitle?.isMovie || optsOrTitle?.isSingleMovie || namingScheme === "title_only") {
    return formatMovieFilename(optsOrTitle, namingSchemeArg, extArg);
  }
  const num = parseFloat(epNum) || 0;
  const maxEp = Math.max(Number(totalEpisodes) || 0, num);
  const padLen = maxEp >= 1e3 ? 4 : maxEp >= 100 ? 3 : 2;
  const paddedEp = String(num).padStart(padLen, "0");
  const paddedSeason = String(season).padStart(2, "0");
  const cleanTitle = sanitizeFolderName(title || "Anime");
  let baseName;
  if (namingScheme === "plex_jellyfin") {
    baseName = `${cleanTitle} - S${paddedSeason}E${paddedEp}`;
  } else if (namingScheme === "series_s_ep") {
    baseName = `${cleanTitle} S${season}EP${num}`;
  } else if (namingScheme === "episode_only") {
    baseName = `Episode ${paddedEp}`;
  } else {
    baseName = `${num}Ep`;
  }
  return `${baseName}${ext.startsWith(".") ? ext : `.${ext}`}`;
}
function formatMovieFilename(optsOrTitle = {}, namingSchemeArg, extArg, qualityArg, yearArg) {
  let title, namingScheme, ext, quality, year, isSingleMovie, epNum, season;
  if (typeof optsOrTitle === "object" && optsOrTitle !== null) {
    title = optsOrTitle.title || "";
    namingScheme = optsOrTitle.namingScheme || "default";
    ext = optsOrTitle.ext !== void 0 ? optsOrTitle.ext : ".mp4";
    quality = optsOrTitle.quality || null;
    year = optsOrTitle.year || null;
    isSingleMovie = optsOrTitle.isSingleMovie !== false;
    epNum = optsOrTitle.epNum !== void 0 ? optsOrTitle.epNum : 1;
    season = optsOrTitle.season !== void 0 ? optsOrTitle.season : 1;
  } else {
    title = optsOrTitle || "";
    namingScheme = namingSchemeArg || "default";
    ext = extArg !== void 0 ? extArg : ".mp4";
    quality = qualityArg || null;
    year = yearArg || null;
    isSingleMovie = true;
    epNum = 1;
    season = 1;
  }
  const cleanTitle = sanitizeFolderName(title || "Movie");
  const yearStr = year ? ` (${year})` : "";
  const qStr = quality ? ` [${quality}]` : "";
  let baseName;
  if (isSingleMovie) {
    if (namingScheme === "plex_jellyfin" || namingScheme === "title_s01e01") {
      baseName = `${cleanTitle}${yearStr}${qStr}`;
    } else if (namingScheme === "title_only") {
      baseName = cleanTitle;
    } else {
      baseName = cleanTitle;
    }
  } else {
    const num = parseFloat(epNum) || 1;
    const paddedEp = String(num).padStart(2, "0");
    const parsedSeason = parseInt(season, 10);
    const seasonNum = Number.isInteger(parsedSeason) && parsedSeason >= 0 ? parsedSeason : 1;
    const paddedSeason = String(seasonNum).padStart(2, "0");
    if (namingScheme === "title_s01e01" || namingScheme === "plex_jellyfin") {
      baseName = `${cleanTitle} - S${paddedSeason}E${paddedEp}${qStr}`;
    } else if (namingScheme === "title_ep") {
      baseName = seasonNum > 1 ? `${cleanTitle} - S${paddedSeason} Episode ${num}` : `${cleanTitle} - Episode ${num}`;
    } else if (namingScheme === "title_only") {
      baseName = seasonNum > 1 ? `${cleanTitle} - S${paddedSeason}E${paddedEp}` : `${cleanTitle} - ${paddedEp}`;
    } else {
      baseName = seasonNum > 1 ? `${cleanTitle} - S${paddedSeason}E${paddedEp}` : `${cleanTitle} - ${paddedEp}`;
    }
  }
  const cleanExt = ext ? ext.startsWith(".") ? ext : `.${ext}` : "";
  return `${baseName}${cleanExt}`;
}
function formatChapterFilename(optsOrTitle = {}, chapterNumArg, namingSchemeArg, extArg) {
  let title, chapterNum, namingScheme, ext;
  if (typeof optsOrTitle === "object" && optsOrTitle !== null) {
    title = optsOrTitle.title || "";
    chapterNum = optsOrTitle.chapterNum !== void 0 ? optsOrTitle.chapterNum : 1;
    namingScheme = optsOrTitle.namingScheme || "default";
    ext = optsOrTitle.ext || ".cbz";
  } else {
    title = optsOrTitle || "";
    chapterNum = chapterNumArg !== void 0 ? chapterNumArg : 1;
    namingScheme = namingSchemeArg || "default";
    ext = extArg || ".cbz";
  }
  const num = chapterNum;
  const cleanTitle = sanitizeFolderName(title || "Manga");
  let baseName;
  if (namingScheme === "series_chapter") {
    baseName = `${cleanTitle} - Chapter ${num}`;
  } else if (namingScheme === "short") {
    baseName = `Ch. ${num}`;
  } else {
    baseName = `Chapter ${num}`;
  }
  return `${baseName}${ext.startsWith(".") ? ext : `.${ext}`}`;
}
module.exports = {
  formatEpisodeFilename,
  formatMovieFilename,
  formatChapterFilename,
  VIDEO_EXTENSIONS,
  SUBTITLE_EXTENSIONS,
  MANGA_EXTENSIONS,
  isWindows,
  isMac,
  isLinux,
  isAndroid,
  getOSName,
  isVideoFile,
  isSubtitleFile,
  isMangaFile,
  isMediaFile,
  hasLocalMediaFiles,
  getUserDataPath,
  migrateOrCheckLegacyData,
  sanitizeFolderName,
  cleanAlphanumeric,
  isUuid,
  getEpisodeNumberFromFilename,
  getChapterNumberFromFilename,
  mediaServerFileBase,
  SEASON_FOLDER_RE,
  sleep,
  parseTags,
  SYSTEM_TAGS,
  RESERVED_TAGS,
  isReservedTag,
  getReservedTags,
  MAL_STATUSES,
  getMalStatuses,
  getValidMalStatuses,
  isValidMalStatus,
  getMalStatusLabel,
  GITHUB_REPO,
  DISCORD_CLIENT_ID,
  DISCORD_IDLE_MESSAGES,
  getCurrentAppVersion,
  sortSourcesByPreferredQuality
};
