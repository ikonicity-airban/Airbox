const express = require("express");
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const axios = require("axios");
const { logger } = require("../utils/AppLogger");
const {
  settingfetch,
  providerFetch,
  reconcileActiveProvider
} = require("../utils/settings");
const {
  latestMangas,
  MangaSearch,
  MangaInfo,
  latestAnime,
  animeinfo,
  animesearch,
  latestMovies,
  movieSearch,
  movieInfo,
  fetchMovieSources,
  fetchEpisode,
  fetchEpisodeSources,
  MangaChapterFetch,
  fetchChapters,
  getProviderOrThrow,
  processServer
} = require("../utils/AnimeManga");
const {
  getAllMetadata,
  getSourceById,
  FindMapping,
  searchPersonWithCache,
  getPersonCreditsWithCache
} = require("../utils/Metadata");
const { getKeyValue, queryOne, queryAll, run } = require("../utils/db");
const ImageCacheManager = require("../utils/ImageCacheManager");
const { getHeaders } = require("../utils/proxyHeaders");
const {
  resolveMalIdFromMapping,
  getLinkedProvidersForMalId,
  getBestProviderForMalId
} = require("../utils/mappingResolver");
const {
  sanitizeFolderName,
  getUserDataPath,
  getEpisodeNumberFromFilename,
  getChapterNumberFromFilename,
  isMangaFile,
  isVideoFile,
  SEASON_FOLDER_RE
} = require("../utils/constants");
const { getDownloadsFolder } = require("../utils/DirectoryMaker");
const router = express.Router();
function isMovieProvider(prov) {
  if (!prov) return false;
  const pStr = String(prov).toLowerCase().trim();
  const clean = pStr.split("/").pop().replace(/^@/, "");
  if (clean === "movies" || clean === "movie" || clean === "bingr" || clean === "cinejoy" || clean === "hdhub4u" || clean === "dramacool" || clean === "kaidrama") {
    return true;
  }
  if (global.Movies_providers) {
    if (global.Movies_providers[pStr] || global.Movies_providers[clean] || global.Movies_providers[`@${clean}`]) {
      return true;
    }
    for (const [k, p] of Object.entries(global.Movies_providers)) {
      const kClean = k.toLowerCase().split("/").pop().replace(/^@/, "");
      const pName = (p?.name || "").toLowerCase().replace(/^@/, "");
      if (kClean === clean || pName === clean || k.toLowerCase() === pStr) {
        return true;
      }
    }
  }
  return false;
}
function generateNormalizedTitleCandidates(rawTitle) {
  if (!rawTitle || typeof rawTitle !== "string") return [];
  const candidates = /* @__PURE__ */ new Set();
  const trimmed = rawTitle.trim();
  if (!trimmed) return [];
  candidates.add(trimmed);
  const noDots = trimmed.replace(/[\.…]+\s*$/, "").trim();
  if (noDots && noDots !== trimmed) candidates.add(noDots);
  const noParen = trimmed.replace(/\s*\((?:tv|ona|ova|movie|special|dub|sub|\d{4})\)\s*$/i, "").trim();
  if (noParen && noParen !== trimmed) candidates.add(noParen);
  let stripped = trimmed.replace(/[\.…]+\s*$/, "");
  const patterns = [
    /\s+(?:part|cour)\s+\d+.*$/i,
    /\s*-\s*(?:part|cour)\s+\d+.*$/i,
    /\s+(?:season|\b\d+(?:st|nd|rd|th)\s+season)\s*.*$/i,
    /\s*-\s*(?:season|\b\d+(?:st|nd|rd|th)\s+season)\s*.*$/i,
    /\s*\((?:season|\b\d+(?:st|nd|rd|th)\s+season)\s*.*\)$/i,
    /\s*-\s*[^:]+$/i
  ];
  for (const pat of patterns) {
    const next = stripped.replace(pat, "").trim();
    if (next && next.length >= 2 && next !== stripped) {
      candidates.add(next);
      stripped = next;
    }
  }
  if (trimmed.includes(":")) {
    const beforeColon = trimmed.split(":")[0].trim();
    if (beforeColon && beforeColon.length >= 3) {
      candidates.add(beforeColon);
    }
  }
  return Array.from(candidates);
}
function cleanBaseTitle(title) {
  if (!title || typeof title !== "string") return "";
  return title.replace(/[\.…]+\s*$/, "").replace(/\s+(?:season|\b\d+(?:st|nd|rd|th)\s+season|part|cour)\s*.*$/i, "").replace(
    /\s*-\s*(?:season|\b\d+(?:st|nd|rd|th)\s+season|part|cour)\s*.*$/i,
    ""
  ).replace(
    /\s*\((?:season|\b\d+(?:st|nd|rd|th)\s+season|tv|part|cour)\s*.*\)$/i,
    ""
  ).trim();
}
async function enrichResultsWithMappingImages(results, AnimeManga) {
  if (!results || !Array.isArray(results) || results.length === 0) {
    return results;
  }
  if (AnimeManga === "Movies") {
    return results;
  }
  const isAnime = AnimeManga === "Anime";
  for (const item of results) {
    if (!item) continue;
    item.scraper_image = item.image || null;
    let malid = item.MalID || item.malid ? Number(item.MalID || item.malid) : null;
    if (!malid && item.id && global.db) {
      try {
        const table = isAnime ? "Anime" : "Manga";
        const row = await global.db.prepare(`SELECT MalID FROM ${table} WHERE id = ?`).get(String(item.id));
        if (row && row.MalID) {
          malid = parseInt(row.MalID);
        }
      } catch (_) {
      }
    }
    if (!malid && item.id && global.mappingDb) {
      try {
        const resolved = await resolveMalIdFromMapping({
          id: item.id,
          mediaType: isAnime ? "Anime" : "Manga"
        });
        if (resolved) malid = resolved;
      } catch (_) {
      }
    }
    if (!malid && item.title) {
      const candidates = generateNormalizedTitleCandidates(item.title);
      for (const cand of candidates) {
        const cleanTitle = cand.trim().toLowerCase();
        if (!malid && global.db) {
          try {
            const table = isAnime ? "Anime" : "Manga";
            const row = await global.db.prepare(
              `SELECT MalID FROM ${table} WHERE LOWER(TRIM(title)) = ? LIMIT 1`
            ).get(cleanTitle);
            if (row && row.MalID) {
              malid = parseInt(row.MalID);
            }
          } catch (_) {
          }
        }
        if (!malid && global.db) {
          try {
            const listTable = isAnime ? "MyAnimeList" : "MyMangaList";
            const row = await global.db.prepare(
              `SELECT id FROM ${listTable} WHERE LOWER(TRIM(title)) = ? LIMIT 1`
            ).get(cleanTitle);
            if (row && row.id) {
              malid = parseInt(row.id);
            }
          } catch (_) {
          }
        }
        if (!malid && global.mappingDb) {
          try {
            const malTable = isAnime ? "anime" : "manga";
            const row = await global.mappingDb.prepare(
              `SELECT malid, image_url FROM ${malTable} WHERE LOWER(TRIM(title)) = ? LIMIT 1`
            ).get(cleanTitle);
            if (row && row.malid) {
              malid = parseInt(row.malid);
            }
          } catch (_) {
          }
        }
        if (malid) break;
      }
      if (!malid && global.mappingDb) {
        try {
          const malTable = isAnime ? "anime" : "manga";
          const baseClean = cleanBaseTitle(item.title);
          if (baseClean && baseClean.length >= 4) {
            let orderSql = "ORDER BY LENGTH(title) ASC";
            if (/\b(?:season\s*2|2nd\s*season)\b/i.test(item.title)) {
              orderSql = "ORDER BY CASE WHEN title LIKE '%2%' OR title LIKE '%Season 2%' THEN 0 ELSE 1 END, LENGTH(title) ASC";
            }
            const row = await global.mappingDb.prepare(
              `SELECT malid, image_url FROM ${malTable} WHERE title LIKE ? ${orderSql} LIMIT 1`
            ).get(`${baseClean}%`);
            if (row && row.malid) {
              malid = parseInt(row.malid);
            }
          }
        } catch (_) {
        }
      }
    }
    if (malid) {
      item.malid = malid;
      let remoteImg = null;
      if (global.mappingDb) {
        try {
          const imgRow = await global.mappingDb.prepare(
            isAnime ? "SELECT image_url, genres FROM anime WHERE malid = ? LIMIT 1" : "SELECT image_url, genres FROM manga WHERE malid = ? LIMIT 1"
          ).get(malid);
          if (imgRow && imgRow.image_url) {
            remoteImg = imgRow.image_url;
          }
          if (imgRow && imgRow.genres && !item.genres) {
            item.genres = imgRow.genres;
          }
        } catch (_) {
        }
      }
      if (!remoteImg && global.db) {
        try {
          const listTable = isAnime ? "MyAnimeList" : "MyMangaList";
          const malRow = await global.db.prepare(`SELECT image FROM ${listTable} WHERE id = ? LIMIT 1`).get(String(malid));
          if (malRow && malRow.image) {
            remoteImg = malRow.image;
          }
        } catch (_) {
        }
      }
      if (remoteImg) {
        item.mal_image = remoteImg;
        item.image_url = remoteImg;
        item.image = remoteImg;
        if (item.id && global.db) {
          try {
            const table = isAnime ? "Anime" : "Manga";
            await global.db.prepare(`UPDATE ${table} SET image_url = ? WHERE id = ?`).run(remoteImg, item.id);
          } catch (_) {
          }
        }
      }
    }
    if (!item.mal_image && global.mappingDb && (item.id || item.title)) {
      try {
        const uRow = await global.mappingDb.prepare(
          "SELECT image_url FROM unmapped_items WHERE (id = ? OR name = ?) AND image_url IS NOT NULL AND image_url != '' LIMIT 1"
        ).get(String(item.id || ""), String(item.title || ""));
        if (uRow && uRow.image_url) {
          item.image = uRow.image_url;
          item.image_url = uRow.image_url;
        }
      } catch (_) {
      }
    }
    if (!item.image && !item.scraper_image) {
      item.image = "/images/image-404.png";
    }
  }
  return results;
}
async function enrichResultsWithWatchProgress(results, AnimeManga) {
  if (!results || !Array.isArray(results) || results.length === 0) {
    return results;
  }
  const isVideo = AnimeManga === "Anime" || AnimeManga === "Movies";
  const isAnime = AnimeManga === "Anime";
  const isMovies = AnimeManga === "Movies";
  const listTable = AnimeManga === "Manga" ? "MyMangaList" : "MyAnimeList";
  const histTable = isMovies ? "SeriesMovieWatchHistory" : isAnime ? "WatchHistory" : "ReadHistory";
  const mediaTable = isMovies ? "Movies" : AnimeManga === "Manga" ? "Manga" : "Anime";
  const idCol = isMovies ? "movie_id" : isAnime ? "anime_id" : "manga_id";
  const titleCol = isMovies ? "title" : isAnime ? "anime_title" : "manga_title";
  const epCol = isVideo ? "episode_number" : "chapter_number";
  try {
    const itemIds = /* @__PURE__ */ new Set();
    const itemTitles = /* @__PURE__ */ new Set();
    const malIdSet = /* @__PURE__ */ new Set();
    const mediaMetaMap = /* @__PURE__ */ new Map();
    for (const item of results) {
      if (!item) continue;
      if (item.id) itemIds.add(String(item.id));
      if (!isMovies && (item.malid || item.MalID)) {
        malIdSet.add(String(item.malid || item.MalID));
      }
      if (isMovies) {
        delete item.MalID;
        item.malid = null;
      }
      if (item.title) {
        itemTitles.add(String(item.title).toLowerCase().trim());
      }
    }
    if (global.db && (itemIds.size > 0 || itemTitles.size > 0)) {
      try {
        const idArr = Array.from(itemIds);
        const titleArr = Array.from(itemTitles);
        const idPlaceholders = idArr.map(() => "?").join(",");
        const titlePlaceholders = titleArr.map(() => "?").join(",");
        let whereClause = "";
        let params = [];
        if (idArr.length > 0 && titleArr.length > 0) {
          whereClause = `id IN (${idPlaceholders}) OR LOWER(title) IN (${titlePlaceholders})`;
          params = [...idArr, ...titleArr];
        } else if (idArr.length > 0) {
          whereClause = `id IN (${idPlaceholders})`;
          params = idArr;
        } else if (titleArr.length > 0) {
          whereClause = `LOWER(title) IN (${titlePlaceholders})`;
          params = titleArr;
        }
        if (whereClause) {
          const selectCols = AnimeManga === "Manga" ? "id, title, MalID, genres, released as aired, status, type, provider, CustomTag" : isMovies ? "id, title, genres, aired, status, type, provider, CustomTag" : "id, title, MalID, genres, aired, status, type, provider, CustomTag";
          const mediaRows = await global.db.prepare(
            `SELECT ${selectCols} FROM ${mediaTable} WHERE ${whereClause}`
          ).all(...params);
          mediaRows?.forEach((r) => {
            if (!isMovies && r.MalID) malIdSet.add(String(r.MalID));
            if (r.id) mediaMetaMap.set(String(r.id), r);
            if (r.title) {
              mediaMetaMap.set(
                "title:" + String(r.title).toLowerCase().trim(),
                r
              );
            }
          });
        }
      } catch (_) {
      }
    }
    const malMap = /* @__PURE__ */ new Map();
    if (!isMovies && global.db && global.MalLoggedIn) {
      try {
        const malIdArr = Array.from(malIdSet);
        const titleArr = Array.from(itemTitles);
        const malPlaceholders = malIdArr.map(() => "?").join(",");
        const titlePlaceholders = titleArr.map(() => "?").join(",");
        let malWhere = "";
        let malParams = [];
        if (malIdArr.length > 0 && titleArr.length > 0) {
          malWhere = `id IN (${malPlaceholders}) OR LOWER(title) IN (${titlePlaceholders})`;
          malParams = [...malIdArr, ...titleArr];
        } else if (malIdArr.length > 0) {
          malWhere = `id IN (${malPlaceholders})`;
          malParams = malIdArr;
        } else if (titleArr.length > 0) {
          malWhere = `LOWER(title) IN (${titlePlaceholders})`;
          malParams = titleArr;
        }
        if (malWhere) {
          const selectCols = isAnime ? "id, title, totalEpisodes, watched, status" : "id, title, totalChapters AS totalEpisodes, read AS watched, status";
          const malRows = await global.db.prepare(`SELECT ${selectCols} FROM ${listTable} WHERE ${malWhere}`).all(...malParams);
          malRows?.forEach((r) => {
            if (r.id) {
              malMap.set(String(r.id), r);
              malIdSet.add(String(r.id));
            }
            if (r.title) {
              malMap.set("title:" + String(r.title).toLowerCase().trim(), r);
            }
          });
        }
      } catch (_) {
      }
    }
    if (!isMovies && global.db && malIdSet.size > 0) {
      try {
        const malIdArr = Array.from(malIdSet);
        const placeholders = malIdArr.map(() => "?").join(",");
        const siblingRows = await global.db.prepare(
          `SELECT id FROM ${mediaTable} WHERE MalID IN (${placeholders})`
        ).all(...malIdArr);
        siblingRows?.forEach((r) => {
          if (r.id) itemIds.add(String(r.id));
        });
      } catch (_) {
      }
    }
    const histMap = /* @__PURE__ */ new Map();
    if (global.db && (itemIds.size > 0 || itemTitles.size > 0)) {
      try {
        const idArr = Array.from(itemIds);
        const titleArr = Array.from(itemTitles);
        const idPlaceholders = idArr.map(() => "?").join(",");
        const titlePlaceholders = titleArr.map(() => "?").join(",");
        let histWhere = "";
        let histParams = [];
        if (idArr.length > 0 && titleArr.length > 0) {
          histWhere = `${idCol} IN (${idPlaceholders}) OR LOWER(${titleCol}) IN (${titlePlaceholders})`;
          histParams = [...idArr, ...titleArr];
        } else if (idArr.length > 0) {
          histWhere = `${idCol} IN (${idPlaceholders})`;
          histParams = idArr;
        } else if (titleArr.length > 0) {
          histWhere = `LOWER(${titleCol}) IN (${titlePlaceholders})`;
          histParams = titleArr;
        }
        if (histWhere) {
          const histQuery = `
            SELECT ${idCol} AS id, ${titleCol} AS title,
                   COUNT(DISTINCT CASE WHEN is_completed = 1 THEN ${epCol} END) AS completed_count,
                   COUNT(DISTINCT ${epCol}) AS watched_count,
                   MAX(${epCol}) AS max_ep,
                   MAX(is_completed) AS any_completed
            FROM ${histTable}
            WHERE ${histWhere}
            GROUP BY ${idCol}, LOWER(${titleCol})
          `;
          const histRows = await global.db.prepare(histQuery).all(...histParams);
          histRows?.forEach((r) => {
            if (r.id) histMap.set(String(r.id), r);
            if (r.title) {
              histMap.set("title:" + String(r.title).toLowerCase().trim(), r);
            }
          });
        }
      } catch (_) {
      }
    }
    const upcomingMap = /* @__PURE__ */ new Map();
    if (isAnime && global.mappingDb && malIdSet.size > 0) {
      try {
        const localToday = /* @__PURE__ */ new Date();
        const localTodayStart = new Date(
          localToday.getFullYear(),
          localToday.getMonth(),
          localToday.getDate(),
          0,
          0,
          0
        ).getTime() / 1e3;
        const localYesterdayStart = localTodayStart - 24 * 3600;
        const malIdArr = Array.from(malIdSet);
        const placeholders = malIdArr.map(() => "?").join(",");
        const animeMapRows = await global.mappingDb.prepare(
          `SELECT malid, livechart_id FROM anime WHERE malid IN (${placeholders}) AND livechart_id IS NOT NULL`
        ).all(...malIdArr);
        if (animeMapRows && animeMapRows.length > 0) {
          const lcToMal = /* @__PURE__ */ new Map();
          const lcIds = [];
          for (const row of animeMapRows) {
            lcToMal.set(row.livechart_id, Number(row.malid));
            lcIds.push(row.livechart_id);
          }
          const lcPlaceholders = lcIds.map(() => "?").join(",");
          const epRows = await global.mappingDb.prepare(
            `SELECT livechart_id, episode, date FROM next_episodes WHERE livechart_id IN (${lcPlaceholders}) AND date >= ? ORDER BY date ASC`
          ).all(...lcIds, localYesterdayStart);
          for (const ep of epRows || []) {
            const malId = lcToMal.get(ep.livechart_id);
            if (malId && !upcomingMap.has(malId)) {
              upcomingMap.set(malId, ep);
            }
          }
        }
      } catch (_) {
      }
    }
    const now = Math.floor(Date.now() / 1e3);
    for (const item of results) {
      if (!item) continue;
      const cleanTitle = item.title ? String(item.title).toLowerCase().trim() : "";
      const itemMalId = item.malid || item.MalID ? String(item.malid || item.MalID) : null;
      let malRec = null;
      if (itemMalId && malMap.has(itemMalId)) {
        malRec = malMap.get(itemMalId);
      } else if (cleanTitle && malMap.has("title:" + cleanTitle)) {
        malRec = malMap.get("title:" + cleanTitle);
      }
      if (malRec && !item.malid && malRec.id) {
        item.malid = Number(malRec.id);
        item.MalID = item.malid;
      }
      let mediaMeta = null;
      if (item.id && mediaMetaMap.has(String(item.id))) {
        mediaMeta = mediaMetaMap.get(String(item.id));
      } else if (cleanTitle && mediaMetaMap.has("title:" + cleanTitle)) {
        mediaMeta = mediaMetaMap.get("title:" + cleanTitle);
      }
      if (mediaMeta) {
        if (!item.genres && mediaMeta.genres) item.genres = mediaMeta.genres;
        if (!item.aired && mediaMeta.aired) item.aired = mediaMeta.aired;
        if (!item.status && mediaMeta.status) item.status = mediaMeta.status;
        if (!item.type && mediaMeta.type) item.type = mediaMeta.type;
        if (!item.provider && mediaMeta.provider) {
          item.provider = mediaMeta.provider;
        }
        if (!item.CustomTag && mediaMeta.CustomTag) {
          item.CustomTag = mediaMeta.CustomTag;
        }
        if (!item.malid && mediaMeta.MalID) {
          item.malid = Number(mediaMeta.MalID);
          item.MalID = item.malid;
        }
      }
      let histRec = null;
      if (item.id && histMap.has(String(item.id))) {
        histRec = histMap.get(String(item.id));
      } else if (cleanTitle && histMap.has("title:" + cleanTitle)) {
        histRec = histMap.get("title:" + cleanTitle);
      }
      let watched = 0;
      let totalEpisodes = item.totalEpisodes || item.totalChapters || 0;
      let isCompleted = false;
      let malStatus = "";
      if (malRec) {
        const malWatched = Number(malRec.watched || 0);
        const malTotal = Number(malRec.totalEpisodes || 0);
        malStatus = malRec.status || "";
        if (malWatched > 0) watched = Math.max(watched, malWatched);
        if (malTotal > 0) totalEpisodes = Math.max(totalEpisodes, malTotal);
        if (malStatus === "completed" || malTotal > 0 && malWatched >= malTotal) {
          isCompleted = true;
        }
      }
      if (histRec) {
        const histWatched = Number(
          histRec.max_ep || histRec.watched_count || 0
        );
        const completedCount = Number(histRec.completed_count || 0);
        if (histWatched > 0) watched = Math.max(watched, histWatched);
        if (totalEpisodes > 0 && completedCount >= totalEpisodes) {
          isCompleted = true;
        }
      }
      if (totalEpisodes > 0 && watched >= totalEpisodes) {
        isCompleted = true;
      }
      if (watched > 0 || isCompleted || malStatus) {
        item.watched = watched;
        item.totalEpisodes = totalEpisodes || 0;
        item.isCompleted = isCompleted;
        item.malStatus = malStatus;
      }
      const resolvedMalId = item.malid || item.MalID ? Number(item.malid || item.MalID) : null;
      if (isAnime && resolvedMalId && upcomingMap.has(resolvedMalId)) {
        const nextEp = upcomingMap.get(resolvedMalId);
        if (nextEp) {
          if (nextEp.date < now) {
            item.nextEpisodeIn = `Ep ${nextEp.episode}: Aired`;
          } else {
            const diff = nextEp.date - now;
            const minutes = Math.ceil(diff / 60);
            const hours = Math.ceil(diff / 3600);
            const days = Math.ceil(diff / (24 * 3600));
            if (days > 0) {
              item.nextEpisodeIn = `Ep ${nextEp.episode}: ${days} day${days > 1 ? "s" : ""}`;
            } else if (hours > 0) {
              item.nextEpisodeIn = `Ep ${nextEp.episode}: ${hours} hr${hours > 1 ? "s" : ""}`;
            } else if (minutes > 0) {
              item.nextEpisodeIn = `Ep ${nextEp.episode}: ${minutes} min${minutes > 1 ? "s" : ""}`;
            } else {
              item.nextEpisodeIn = `Ep ${nextEp.episode}: soon`;
            }
          }
        }
      }
    }
  } catch (err) {
    logger.error(`Error in enrichResultsWithWatchProgress: ${err.message}`);
  }
  return results;
}
async function enrichResultsWithDownloads(results, AnimeManga) {
  if (!results || !Array.isArray(results) || results.length === 0) {
    return results;
  }
  const isAnime = AnimeManga === "Anime";
  const isMovies = AnimeManga === "Movies";
  const mediaTable = isAnime ? "Anime" : isMovies ? "Movies" : "Manga";
  try {
    const config = await settingfetch();
    const customDir = isAnime ? config?.CustomDownloadLocationAnime : config?.CustomDownloadLocationManga;
    const baseDir = typeof customDir === "string" && customDir.trim() ? customDir : await getDownloadsFolder();
    const candidateDirs = [];
    const addDir = (d) => {
      if (d && fs.existsSync(d)) {
        const resolved = path.resolve(d);
        if (!candidateDirs.includes(resolved)) {
          candidateDirs.push(resolved);
        }
      }
    };
    addDir(path.join(baseDir, AnimeManga));
    addDir(baseDir);
    const downloadsRoot = await getDownloadsFolder();
    addDir(path.join(downloadsRoot, AnimeManga));
    if (candidateDirs.length === 0) return results;
    const diskFolders = /* @__PURE__ */ new Set();
    const diskFolderPaths = /* @__PURE__ */ new Map();
    for (const cDir of candidateDirs) {
      try {
        const dirs = await fs.promises.readdir(cDir, { withFileTypes: true });
        for (const d of dirs) {
          if (d.isDirectory()) {
            const lower = d.name.toLowerCase();
            diskFolders.add(lower);
            if (!diskFolderPaths.has(lower)) {
              diskFolderPaths.set(lower, path.join(cDir, d.name));
            }
          }
        }
      } catch (_) {
      }
    }
    if (diskFolders.size === 0) return results;
    const itemIds = /* @__PURE__ */ new Set();
    const itemTitles = /* @__PURE__ */ new Set();
    const malIdSet = /* @__PURE__ */ new Set();
    for (const item of results) {
      if (!item) continue;
      if (item.id) itemIds.add(String(item.id));
      if (item.malid || item.MalID) {
        malIdSet.add(String(item.malid || item.MalID));
      }
      if (item.title) {
        itemTitles.add(String(item.title).toLowerCase().trim());
      }
    }
    const dbRows = /* @__PURE__ */ new Map();
    if (global.db && (itemIds.size > 0 || itemTitles.size > 0 || malIdSet.size > 0)) {
      try {
        const idArr = Array.from(itemIds);
        const titleArr = Array.from(itemTitles);
        const malArr = Array.from(malIdSet);
        const conditions = [];
        const params = [];
        if (idArr.length > 0) {
          conditions.push(`id IN (${idArr.map(() => "?").join(",")})`);
          params.push(...idArr);
        }
        if (titleArr.length > 0) {
          conditions.push(
            `LOWER(title) IN (${titleArr.map(() => "?").join(",")})`
          );
          params.push(...titleArr);
        }
        if (malArr.length > 0) {
          conditions.push(`MalID IN (${malArr.map(() => "?").join(",")})`);
          params.push(...malArr);
        }
        if (conditions.length > 0) {
          const rows = await global.db.prepare(
            `SELECT id, title, MalID, folder_name FROM ${mediaTable} WHERE ${conditions.join(" OR ")}`
          ).all(...params);
          for (const r of rows) {
            if (r.id) dbRows.set(String(r.id), r);
            if (r.MalID) dbRows.set(`mal:${r.MalID}`, r);
            if (r.title)
              dbRows.set(`title:${String(r.title).toLowerCase().trim()}`, r);
          }
        }
      } catch (_) {
      }
    }
    const findFolderOnDisk = (folderName) => {
      if (!folderName) return null;
      const lower = folderName.toLowerCase();
      if (diskFolderPaths.has(lower)) return diskFolderPaths.get(lower);
      return null;
    };
    const folderEpisodesCache = /* @__PURE__ */ new Map();
    const getFolderEpisodes = async (fPath) => {
      if (!fPath) return [];
      if (folderEpisodesCache.has(fPath)) return folderEpisodesCache.get(fPath);
      try {
        const files = await fs.promises.readdir(fPath, { withFileTypes: true });
        let eps = [];
        if (isAnime || isMovies) {
          eps = files.filter((f) => f.isFile() && isVideoFile(f.name)).map((f) => getEpisodeNumberFromFilename(f.name)).filter((n) => n !== null && !isNaN(n));
          const seasonDirs = files.filter(
            (f) => f.isDirectory() && SEASON_FOLDER_RE.test(f.name)
          );
          for (const sDir of seasonDirs) {
            try {
              const sMatch = sDir.name.match(/\d+/);
              const seasonNum = sMatch ? parseInt(sMatch[0], 10) : 1;
              const sFiles = await fs.promises.readdir(
                path.join(fPath, sDir.name),
                { withFileTypes: true }
              );
              for (const sf of sFiles) {
                if (sf.isFile() && isVideoFile(sf.name) && !sf.name.startsWith(".") && !sf.name.includes(".temp")) {
                  const num = getEpisodeNumberFromFilename(sf.name);
                  if (num !== null && !isNaN(num)) {
                    eps.push(num);
                    eps.push(`s${seasonNum}_e${num}`);
                  }
                }
              }
            } catch (_) {
            }
          }
          if (isMovies && eps.length === 0 && files.some(
            (f) => f.isFile() && isVideoFile(f.name) && !f.name.startsWith(".") && !f.name.includes(".temp")
          )) {
            eps.push(1);
          }
          eps = Array.from(new Set(eps));
        } else {
          eps = files.filter((f) => f.isFile() && isMangaFile(f.name)).map((f) => getChapterNumberFromFilename(f.name)).filter((n) => n !== null && !isNaN(n)).sort((a, b) => a - b);
        }
        folderEpisodesCache.set(fPath, eps);
        return eps;
      } catch (_) {
        folderEpisodesCache.set(fPath, []);
        return [];
      }
    };
    for (const item of results) {
      if (!item) continue;
      const cleanTitle = item.title ? String(item.title).toLowerCase().trim() : "";
      const itemMalId = item.malid || item.MalID ? String(item.malid || item.MalID) : null;
      let dbMatch = null;
      if (item.id && dbRows.has(String(item.id))) {
        dbMatch = dbRows.get(String(item.id));
      } else if (itemMalId && dbRows.has(`mal:${itemMalId}`)) {
        dbMatch = dbRows.get(`mal:${itemMalId}`);
      } else if (cleanTitle && dbRows.has(`title:${cleanTitle}`)) {
        dbMatch = dbRows.get(`title:${cleanTitle}`);
      }
      const folderCandidates = [];
      if (dbMatch?.folder_name) folderCandidates.push(dbMatch.folder_name);
      if (item.id) folderCandidates.push(String(item.id));
      if (item.title) {
        folderCandidates.push(sanitizeFolderName(item.title));
      }
      if (dbMatch?.title && dbMatch.title !== item.title) {
        folderCandidates.push(sanitizeFolderName(dbMatch.title));
      }
      let allDownloaded = [];
      for (const cand of folderCandidates) {
        const fPath = findFolderOnDisk(cand);
        if (fPath) {
          const eps = await getFolderEpisodes(fPath);
          if (eps.length > 0) {
            allDownloaded = Array.from(
              /* @__PURE__ */ new Set([...allDownloaded, ...eps])
            ).sort((a, b) => a - b);
          }
        }
      }
      if (allDownloaded.length > 0) {
        item.Downloaded = allDownloaded;
        if (isAnime) {
          item.DownloadedEpisodes = allDownloaded;
        } else {
          item.DownloadedChapters = allDownloaded;
        }
      }
    }
  } catch (err) {
    logger.error(`Error in enrichResultsWithDownloads: ${err.message}`);
  }
  return results;
}
async function buildLocalCatalogWhere(AnimeManga, filters = {}, keyword = "") {
  const isAnime = AnimeManga === "Anime";
  const table = isAnime ? "anime" : "manga";
  let conditions = ["has_mapping = 1"];
  let params = [];
  if (isAnime) {
    conditions.push(
      "status NOT IN ('UPCOMING', 'NOT_YET_AIRED', 'Not yet aired', 'not_yet_aired', 'upcoming')"
    );
  } else {
    conditions.push(
      "status NOT IN ('UPCOMING', 'NOT_YET_PUBLISHED', 'not_yet_published', 'upcoming')"
    );
  }
  if (filters?.malStatus && filters.malStatus !== "All" && filters.malStatus !== "") {
    if (!global.MalLoggedIn) {
      conditions.push("1 = 0");
    } else {
      const listTable = isAnime ? "MyAnimeList" : "MyMangaList";
      let targetStatus = String(filters.malStatus).toLowerCase();
      if (isAnime && targetStatus === "reading") targetStatus = "watching";
      if (!isAnime && targetStatus === "watching") targetStatus = "reading";
      if (isAnime && targetStatus === "plan_to_read")
        targetStatus = "plan_to_watch";
      if (!isAnime && targetStatus === "plan_to_watch")
        targetStatus = "plan_to_read";
      try {
        const rows = await queryAll(
          `SELECT id FROM ${listTable} WHERE status = ?`,
          [targetStatus]
        );
        const ids = (rows || []).map((r) => Number(r.id)).filter((id) => !isNaN(id) && id > 0);
        if (ids.length === 0) {
          conditions.push("1 = 0");
        } else if (ids.length <= 900) {
          const placeholders = ids.map(() => "?").join(",");
          conditions.push(`malid IN (${placeholders})`);
          params.push(...ids);
        } else {
          const safeIds = ids.join(",");
          conditions.push(`malid IN (${safeIds})`);
        }
      } catch (err) {
        logger.error(
          `Error querying ${listTable} for status ${targetStatus}: ${err.message}`
        );
        conditions.push("1 = 0");
      }
    }
  }
  const searchKeyword = (keyword || filters?.keyword || filters?.query || "").trim();
  if (searchKeyword) {
    conditions.push("(LOWER(title) LIKE ? OR CAST(malid AS TEXT) = ?)");
    params.push(`%${searchKeyword.toLowerCase()}%`, searchKeyword);
  }
  if (isAnime && filters?.season && filters.season !== "All" && filters.season !== "") {
    conditions.push("LOWER(season) = ?");
    params.push(String(filters.season).toLowerCase());
  }
  if (isAnime && filters?.year && filters.year !== "All" && filters.year !== "") {
    if (filters.year === "Older") {
      conditions.push("year < 2010");
    } else {
      const yrNum = Number(filters.year);
      if (!isNaN(yrNum)) {
        conditions.push("year = ?");
        params.push(yrNum);
      }
    }
  }
  if (filters?.format && filters.format !== "All" && filters.format !== "") {
    conditions.push("LOWER(type) = ?");
    params.push(String(filters.format).toLowerCase());
  }
  if (filters?.genre && filters.genre !== "All" && filters.genre !== "") {
    conditions.push("LOWER(genres) LIKE ?");
    params.push(`%${String(filters.genre).toLowerCase()}%`);
  }
  if (filters?.status && filters.status !== "All" && filters.status !== "") {
    const s = String(filters.status).toLowerCase();
    if (s === "airing" || s === "ongoing") {
      conditions.push(
        "LOWER(status) IN ('ongoing', 'currently_airing', 'currently airing', 'publishing', 'currently publishing')"
      );
    } else if (s === "completed" || s === "finished") {
      conditions.push(
        "LOWER(status) IN ('finished', 'finished_airing', 'finished airing', 'completed')"
      );
    } else {
      conditions.push("LOWER(status) = ?");
      params.push(s);
    }
  }
  const whereClause = conditions.join(" AND ");
  const orderClause = isAnime ? "ORDER BY (CASE WHEN year IS NULL THEN 0 ELSE year END) DESC, (CASE season WHEN 'FALL' THEN 4 WHEN 'SUMMER' THEN 3 WHEN 'SPRING' THEN 2 WHEN 'WINTER' THEN 1 ELSE 0 END) DESC, malid DESC" : "ORDER BY malid DESC";
  return { table, whereClause, orderClause, params };
}
function buildUniqueProviderWhere(AnimeManga, rawProvider, filters = {}, keyword = "") {
  const provider = (rawProvider || "").split("/").pop().toLowerCase().replace(/^unique[:-]/, "").replace(/^unique_/, "");
  let conditions = [
    "(provider = ? OR provider = ? OR provider LIKE ?)",
    "media_type = ?"
  ];
  let params = [provider, `@%/${provider}`, `%/${provider}`, AnimeManga];
  if (provider === "pahe") {
    conditions.push(
      "id NOT IN (SELECT id FROM pahe WHERE malid IS NOT NULL UNION SELECT uuid FROM pahe WHERE malid IS NOT NULL)"
    );
  } else if (global.mappingDb) {
    try {
      const tableCheck = global.mappingDb.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(provider);
      if (tableCheck) {
        conditions.push(
          `id NOT IN (SELECT id FROM "${provider}" WHERE malid IS NOT NULL)`
        );
      }
    } catch (_) {
    }
  }
  if (global.db) {
    try {
      const customMapped = global.db.prepare("SELECT id FROM unlinked_mal_ids WHERE malid IS NOT NULL").all();
      if (customMapped && customMapped.length > 0) {
        const ids = customMapped.map((c) => String(c.id)).filter(Boolean);
        if (ids.length > 0) {
          conditions.push(`id NOT IN (${ids.map(() => "?").join(",")})`);
          params.push(...ids);
        }
      }
    } catch (_) {
    }
  }
  const searchKeyword = (keyword || filters?.keyword || filters?.query || "").trim();
  if (searchKeyword) {
    conditions.push("(LOWER(name) LIKE ? OR id LIKE ?)");
    params.push(`%${searchKeyword.toLowerCase()}%`, `%${searchKeyword}%`);
  }
  if (filters?.format && filters.format !== "All" && filters.format !== "") {
    conditions.push("LOWER(type) = ?");
    params.push(String(filters.format).toLowerCase());
  }
  if (filters?.genre && filters.genre !== "All" && filters.genre !== "") {
    conditions.push("LOWER(genres) LIKE ?");
    params.push(`%${String(filters.genre).toLowerCase()}%`);
  }
  const whereClause = conditions.join(" AND ");
  return { provider, whereClause, params };
}
async function getLocalCatalogList(AnimeManga, filters = {}, keyword = "") {
  const isAnime = AnimeManga === "Anime";
  const table = isAnime ? "anime" : "manga";
  const page = Math.max(1, parseInt(filters?.page || 1, 10));
  const limit = 24;
  const offset = (page - 1) * limit;
  if (!global.mappingDb) {
    return {
      currentPage: page,
      hasNextPage: false,
      results: [],
      site: "mal",
      lastFetched: null
    };
  }
  const { whereClause, orderClause, params } = await buildLocalCatalogWhere(
    AnimeManga,
    filters,
    keyword
  );
  let rows = [];
  try {
    rows = await global.mappingDb.prepare(
      `SELECT * FROM ${table} WHERE ${whereClause} ${orderClause} LIMIT ? OFFSET ?`
    ).all(...params, limit + 1, offset);
  } catch (err) {
    logger.error(`Error querying ${table} catalog: ${err.message}`);
  }
  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  const nextEpMap = /* @__PURE__ */ new Map();
  if (isAnime && global.mappingDb && pageRows.length > 0) {
    try {
      const lcIds = pageRows.map((r) => r.livechart_id).filter(Boolean);
      if (lcIds.length > 0) {
        const placeholders = lcIds.map(() => "?").join(",");
        const now = Math.floor(Date.now() / 1e3);
        const epRows = await global.mappingDb.prepare(
          `SELECT livechart_id, episode, date FROM next_episodes WHERE livechart_id IN (${placeholders}) AND date > ?`
        ).all(...lcIds, now);
        epRows?.forEach((ep) => {
          if (!nextEpMap.has(ep.livechart_id) || ep.date < nextEpMap.get(ep.livechart_id).date) {
            nextEpMap.set(ep.livechart_id, ep);
          }
        });
      }
    } catch (_) {
    }
  }
  const setting = await settingfetch();
  const preferred = (isAnime ? setting?.Animeprovider || "pahe" : setting?.Mangaprovider || "weebcentral").toLowerCase();
  const results = await Promise.all(
    (pageRows || []).map(async (r) => {
      let nextEpisodeIn = null;
      if (r.livechart_id && nextEpMap.has(r.livechart_id)) {
        const nextEp = nextEpMap.get(r.livechart_id);
        const now = Math.floor(Date.now() / 1e3);
        const diff = nextEp.date - now;
        const days = Math.ceil(diff / (24 * 3600));
        const hours = Math.ceil(diff / 3600);
        if (days > 0) {
          nextEpisodeIn = `Ep ${nextEp.episode}: ${days} day${days > 1 ? "s" : ""}`;
        } else if (hours > 0) {
          nextEpisodeIn = `Ep ${nextEp.episode}: ${hours} hr${hours > 1 ? "s" : ""}`;
        } else {
          nextEpisodeIn = `Ep ${nextEp.episode}: soon`;
        }
      }
      let resolvedProvider = null;
      let resolvedId = null;
      try {
        const best = await getBestProviderForMalId(
          r.malid,
          AnimeManga,
          preferred
        );
        if (best) {
          resolvedProvider = best.provider;
          resolvedId = best.id;
        }
      } catch (_) {
      }
      return {
        id: resolvedId ? String(resolvedId) : String(r.malid),
        malid: Number(r.malid),
        MalID: Number(r.malid),
        title: r.title,
        image: r.image_url,
        type: r.type,
        episodes: r.episodes,
        chapters: r.chapters,
        volumes: r.volumes,
        status: r.status,
        season: r.season,
        year: r.year,
        genres: r.genres,
        aired: r.year ? `${r.season ? r.season + " " : ""}${r.year}` : null,
        nextEpisodeIn,
        provider: resolvedProvider || preferred,
        isMapped: !!resolvedProvider
      };
    })
  );
  let lastFetched = null;
  if (global.mappingDb) {
    try {
      const syncRow = await global.mappingDb.prepare(
        "SELECT last_run FROM sync_history WHERE task_name = 'mapping_db_version' OR task_name = 'updateMALSeasons' ORDER BY last_run DESC LIMIT 1"
      ).get();
      lastFetched = syncRow?.last_run || null;
    } catch (_) {
    }
  }
  return {
    currentPage: page,
    hasNextPage,
    results,
    site: "mal",
    lastFetched,
    malLoggedIn: !!global.MalLoggedIn
  };
}
async function getUniqueProviderList(AnimeManga, rawProvider, filters = {}, keyword = "") {
  const page = Math.max(1, parseInt(filters?.page || 1, 10));
  const limit = 24;
  const offset = (page - 1) * limit;
  if (!global.mappingDb) {
    return {
      currentPage: page,
      hasNextPage: false,
      results: [],
      site: rawProvider,
      lastFetched: null
    };
  }
  const { provider, whereClause, params } = buildUniqueProviderWhere(
    AnimeManga,
    rawProvider,
    filters,
    keyword
  );
  let lastFetched = null;
  try {
    const row = await global.mappingDb.prepare(
      "SELECT MAX(last_fetched) as last_fetched FROM unmapped_items WHERE provider = ?"
    ).get(provider);
    lastFetched = row?.last_fetched || null;
  } catch (_) {
  }
  let rows = [];
  try {
    rows = await global.mappingDb.prepare(
      `SELECT * FROM unmapped_items WHERE ${whereClause} ORDER BY name ASC LIMIT ? OFFSET ?`
    ).all(...params, limit + 1, offset);
  } catch (err) {
    logger.error(
      `Error querying unmapped items for ${provider}: ${err.message}`
    );
  }
  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  const results = (pageRows || []).map((r) => ({
    id: r.id,
    title: r.name,
    image: r.image_url,
    type: r.type,
    episodes: r.episodes,
    status: r.status,
    season: r.season,
    year: r.year,
    aired: r.year ? `${r.season ? r.season + " " : ""}${r.year}` : null,
    provider: r.provider,
    isUnmapped: true
  }));
  const titles = results.map((r) => (r.title || "").toLowerCase().trim()).filter(Boolean);
  if (titles.length > 0) {
    if (global.db) {
      try {
        const table = AnimeManga === "Anime" ? "Anime" : "Manga";
        const placeholders = titles.map(() => "?").join(",");
        const localRows = await global.db.prepare(
          `SELECT LOWER(TRIM(title)) as t, image_url FROM ${table} WHERE LOWER(TRIM(title)) IN (${placeholders}) AND image_url IS NOT NULL`
        ).all(...titles);
        const map = new Map(localRows.map((r) => [r.t, r.image_url]));
        for (const item of results) {
          if (!item.image) {
            const t = (item.title || "").toLowerCase().trim();
            if (map.has(t)) item.image = map.get(t);
          }
        }
      } catch (_) {
      }
    }
    if (global.mappingDb) {
      try {
        const malTable = AnimeManga === "Anime" ? "anime" : "manga";
        const placeholders = titles.map(() => "?").join(",");
        const malRows = await global.mappingDb.prepare(
          `SELECT LOWER(TRIM(title)) as t, image_url FROM ${malTable} WHERE LOWER(TRIM(title)) IN (${placeholders}) AND image_url IS NOT NULL`
        ).all(...titles);
        const map = new Map(malRows.map((r) => [r.t, r.image_url]));
        for (const item of results) {
          if (!item.image) {
            const t = (item.title || "").toLowerCase().trim();
            if (map.has(t)) item.image = map.get(t);
          }
        }
      } catch (_) {
      }
    }
  }
  for (const item of results) {
    if (!item.image) {
      item.image = "/images/image-404.png";
    }
  }
  const missingInDb = results.filter(
    (it) => it.image === "/images/image-404.png"
  );
  if (missingInDb.length > 0) {
    setImmediate(async () => {
      try {
        const pObj = await getProviderOrThrow(AnimeManga, provider);
        const searchFn = pObj?.provider?.SearchAnime || pObj?.provider?.animesearch || pObj?.provider?.MangaSearch || pObj?.provider?.Search;
        if (typeof searchFn !== "function") return;
        for (const item of missingInDb.slice(0, 5)) {
          try {
            const sRes = await searchFn(item.title);
            const sResults = sRes?.results || (Array.isArray(sRes) ? sRes : []);
            if (sResults.length > 0) {
              const exact = sResults.find(
                (s) => (s.title || "").toLowerCase().trim() === (item.title || "").toLowerCase().trim()
              ) || sResults[0];
              const fetchedImg = exact?.image || exact?.image_url || null;
              const fetchedId = provider === "pahe" && exact?.id ? String(exact.id) : null;
              if (fetchedImg && global.mappingDb) {
                await global.mappingDb.prepare(
                  "UPDATE unmapped_items SET image_url = ?, id = COALESCE(?, id) WHERE provider = ? AND (id = ? OR LOWER(TRIM(name)) = ?)"
                ).run(
                  fetchedImg,
                  fetchedId || null,
                  provider,
                  item.id,
                  (item.title || "").toLowerCase().trim()
                );
              }
            }
          } catch (_) {
          }
        }
      } catch (_) {
      }
    });
  }
  return {
    currentPage: page,
    hasNextPage,
    results,
    site: provider,
    lastFetched
  };
}
function cleanEpCount(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return String(raw.length);
  if (typeof raw === "number" && !isNaN(raw)) return String(raw);
  if (typeof raw === "string") {
    if (raw.includes("[object")) {
      const parts = raw.split(",").filter((s) => s.includes("[object"));
      return parts.length > 0 ? String(parts.length) : null;
    }
    const trimmed = raw.trim();
    if (!isNaN(parseInt(trimmed, 10))) return String(parseInt(trimmed, 10));
    return trimmed === "?" || trimmed.toLowerCase() === "unknown" ? null : trimmed;
  }
  return null;
}
router.get("/api/providers/metadata", async (_, res) => {
  try {
    const providerMap = /* @__PURE__ */ new Map();
    const installedAnime = /* @__PURE__ */ new Map();
    const installedManga = /* @__PURE__ */ new Map();
    for (const p of Object.values(global.Anime_providers || {})) {
      if (p?.name) {
        const cleanName = String(p.name).toLowerCase().split("/").pop().replace(/^@/, "");
        const displayName = p.displayName || p.display_name || cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
        installedAnime.set(cleanName, { cleanName, displayName });
      }
    }
    for (const p of Object.values(global.Manga_providers || {})) {
      if (p?.name) {
        const cleanName = String(p.name).toLowerCase().split("/").pop().replace(/^@/, "");
        const displayName = p.displayName || p.display_name || cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
        installedManga.set(cleanName, { cleanName, displayName });
      }
    }
    const hasUnmappedResults = (cleanName, mediaType) => {
      if (!global.mappingDb) return false;
      try {
        const { whereClause, params } = buildUniqueProviderWhere(
          mediaType,
          cleanName,
          {},
          ""
        );
        const row = global.mappingDb.prepare(`SELECT 1 FROM unmapped_items WHERE ${whereClause} LIMIT 1`).get(...params);
        return !!row;
      } catch (_2) {
        return false;
      }
    };
    for (const [cleanName, info] of installedAnime.entries()) {
      if (cleanName === "anineko") continue;
      if (hasUnmappedResults(cleanName, "Anime")) {
        providerMap.set(`Anime:${cleanName}`, {
          table_name: cleanName,
          media_type: "Anime",
          primary_key_field: "id",
          display_name: info.displayName,
          last_fetched: null
        });
      }
    }
    for (const [cleanName, info] of installedManga.entries()) {
      if (hasUnmappedResults(cleanName, "Manga")) {
        providerMap.set(`Manga:${cleanName}`, {
          table_name: cleanName,
          media_type: "Manga",
          primary_key_field: "id",
          display_name: info.displayName,
          last_fetched: null
        });
      }
    }
    const providers = Array.from(providerMap.values()).sort(
      (a, b) => a.display_name.localeCompare(b.display_name)
    );
    res.json({ providers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
function isExplicitAdultContent(item) {
  if (!item) return false;
  const adultPatterns = [
    /\b(xxx|porn|porno|pornography|pornographic|erotic|erotica|hentai|jav|nsfw|sex|sexy|sensual|nude|nudity|ecchi|bdsm|fetish|onlyfans|camgirl|playboy|penthouse|softcore|hardcore|incest|stripper|striptease|escort|hooker|brothel|whore|playmate|centerfold)\b/i,
    /\b(lust|orgy|threesome|voyeur|peeping|naked|babes|slut|milf|busty|uncensored|adult\s+film|adult\s+movie|adult\s+video|x-rated|xxx-rated|18\+)\b/i
  ];
  const title = String(item.title || item.name || "");
  const overview = String(
    item.overview || item.summary || item.description || ""
  );
  const genres = String(
    Array.isArray(item.genres) ? item.genres.join(", ") : item.genres || item.genre || ""
  );
  for (const pattern of adultPatterns) {
    if (pattern.test(title)) return true;
    if (pattern.test(overview)) return true;
    if (pattern.test(genres)) return true;
  }
  return false;
}
router.post(
  [
    "/api/list/:AnimeManga/:provider",
    "/api/list/:AnimeManga/:repoOwner/:provider"
  ],
  async (req, res) => {
    let { AnimeManga } = req.params;
    let provider = req.params.repoOwner ? `${req.params.repoOwner}/${req.params.provider}` : req.params.provider;
    if (AnimeManga === "Movies" || isMovieProvider(provider)) {
      AnimeManga = "Movies";
    } else if (AnimeManga === "Manga") {
      AnimeManga = "Manga";
    } else {
      AnimeManga = "Anime";
    }
    let filters = {};
    if (req?.body?.filters && typeof req.body.filters === "object") {
      for (const [key, value] of Object.entries(req.body.filters)) {
        if (value != null && value !== "") {
          const num = Number(value);
          filters[key] = !isNaN(num) ? num : value;
        }
      }
    }
    try {
      if (!AnimeManga || !provider) {
        return res.status(400).json({ error: "Missing parameters" });
      }
      const config = await settingfetch();
      let data = null;
      const searchKeyword = req?.body?.keyword || req?.query?.query || "";
      if (AnimeManga === "Anime") {
        if (provider === "local") {
          data = await getAllMetadata(
            "Anime",
            config?.CustomDownloadLocationAnime,
            filters?.page,
            filters?.tag,
            filters,
            searchKeyword
          );
        } else if (provider.startsWith("unique:") || provider.startsWith("unique_")) {
          data = await getUniqueProviderList(
            "Anime",
            provider,
            filters,
            searchKeyword
          );
        } else if (provider === "mal") {
          data = await getLocalCatalogList("Anime", filters, searchKeyword);
        } else if (provider === "search") {
          if (global.mappingDb) {
            data = await getLocalCatalogList("Anime", filters, searchKeyword);
          } else {
            const pObj = await getProviderOrThrow("Anime");
            data = await animesearch(pObj, searchKeyword, filters);
            data = { ...data, site: config?.Animeprovider };
          }
        } else {
          const activeProvName = provider === "provider" ? config?.Animeprovider || await reconcileActiveProvider("Anime") : provider;
          const pObj = await getProviderOrThrow("Anime", activeProvName);
          if (searchKeyword) {
            data = await animesearch(pObj, searchKeyword, filters);
          } else {
            data = await latestAnime(pObj, filters);
          }
          const siteName = pObj?.provider_name || pObj?.provider?.name || activeProvName || provider;
          if (data?.results && Array.isArray(data.results)) {
            for (const item of data.results) {
              if (item) {
                item.provider = siteName;
              }
            }
          }
          data = { ...data, site: siteName };
        }
      } else if (AnimeManga === "Manga") {
        if (provider === "local") {
          data = await getAllMetadata(
            "Manga",
            config?.CustomDownloadLocationManga,
            filters?.page,
            filters?.tag,
            filters,
            searchKeyword
          );
        } else if (provider.startsWith("unique:") || provider.startsWith("unique_")) {
          data = await getUniqueProviderList(
            "Manga",
            provider,
            filters,
            searchKeyword
          );
        } else if (provider === "mal") {
          data = await getLocalCatalogList("Manga", filters, searchKeyword);
        } else if (provider === "search") {
          if (global.mappingDb) {
            data = await getLocalCatalogList("Manga", filters, searchKeyword);
          } else {
            const pObj = await getProviderOrThrow("Manga");
            data = await MangaSearch(
              pObj,
              searchKeyword,
              filters?.page,
              filters
            );
            data = { ...data, site: config?.Mangaprovider };
          }
        } else {
          const activeProvName = provider === "provider" ? config?.Mangaprovider || await reconcileActiveProvider("Manga") : provider;
          const pObj = await getProviderOrThrow("Manga", activeProvName);
          if (searchKeyword) {
            data = await MangaSearch(
              pObj,
              searchKeyword,
              filters?.page,
              filters
            );
          } else {
            data = await latestMangas(pObj, filters?.page, filters);
          }
          const siteName = pObj?.provider_name || pObj?.provider?.name || activeProvName || provider;
          if (data?.results && Array.isArray(data.results)) {
            for (const item of data.results) {
              if (item) {
                item.provider = siteName;
              }
            }
          }
          data = { ...data, site: siteName };
        }
      } else if (AnimeManga === "Movies") {
        if (provider === "local") {
          data = await getAllMetadata(
            "Movies",
            config?.CustomDownloadLocationMovies,
            filters?.page,
            filters?.tag,
            filters,
            searchKeyword
          );
        } else if (provider.startsWith("unique:") || provider.startsWith("unique_")) {
          data = await getUniqueProviderList(
            "Movies",
            provider,
            filters,
            searchKeyword
          );
        } else if (provider === "search") {
          const pObj = await getProviderOrThrow("Movies");
          data = await movieSearch(pObj, searchKeyword, filters);
          data = { ...data, site: config?.Moviesprovider };
        } else {
          const activeProvName = config?.Moviesprovider || await reconcileActiveProvider("Movies");
          let pObj = null;
          try {
            if (activeProvName) {
              pObj = await getProviderOrThrow("Movies", activeProvName);
            }
          } catch (_) {
            pObj = null;
          }
          if (pObj) {
            try {
              if (searchKeyword) {
                data = await movieSearch(pObj, searchKeyword, filters);
              } else {
                data = await latestMovies(pObj, filters);
              }
            } catch (_) {
            }
          }
          if (Array.isArray(data)) {
            data = {
              results: data,
              totalPages: 50,
              currentPage: parseInt(filters?.page || 1, 10),
              hasNextPage: data.length > 0
            };
          }
          if (!data || !data.results || data.results.length === 0) {
            if (searchKeyword) {
              const fallbackItems = [];
              const seen = /* @__PURE__ */ new Set();
              try {
                const tvRes = await axios.get(
                  `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(searchKeyword)}`,
                  { timeout: 3500 }
                );
                if (Array.isArray(tvRes.data)) {
                  for (const entry of tvRes.data) {
                    if (isExplicitAdultContent(entry?.show)) continue;
                    const name = entry?.show?.name;
                    if (name && !seen.has(name.toLowerCase())) {
                      seen.add(name.toLowerCase());
                      fallbackItems.push({
                        id: `tv:${entry.show.id}`,
                        title: name,
                        image: entry.show.image?.original || entry.show.image?.medium || "/images/image-404.png",
                        rating: entry.show.rating?.average || null,
                        year: (entry.show.premiered || "").split("-")[0] || null,
                        type: "Movies",
                        provider: "provider",
                        overview: entry.show.summary ? entry.show.summary.replace(/<[^>]+>/g, "") : "",
                        genres: Array.isArray(entry.show?.genres) ? entry.show.genres.join(", ") : "",
                        status: entry.show?.status || "Completed"
                      });
                    }
                  }
                }
              } catch (_) {
              }
              try {
                const wikiRes = await axios.get(
                  `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(searchKeyword)}&limit=10&namespace=0&format=json`,
                  {
                    headers: { "User-Agent": "Iconmedia/1.0" },
                    timeout: 3500
                  }
                );
                if (Array.isArray(wikiRes.data) && Array.isArray(wikiRes.data[1])) {
                  for (const raw of wikiRes.data[1]) {
                    const clean = raw.replace(
                      /\s*\((film|movie|tv series|miniseries|television series)\)$/i,
                      ""
                    ).trim();
                    if (clean && !seen.has(clean.toLowerCase()) && !isExplicitAdultContent({ title: clean })) {
                      seen.add(clean.toLowerCase());
                      fallbackItems.push({
                        id: `movie:${clean}`,
                        title: clean,
                        image: "/images/image-404.png",
                        type: "Movies",
                        provider: "provider"
                      });
                    }
                  }
                }
              } catch (_) {
              }
              data = {
                results: fallbackItems,
                totalPages: 1,
                currentPage: 1,
                hasNextPage: false,
                site: "discover"
              };
            } else {
              try {
                const targetPage = Math.max(
                  1,
                  parseInt(filters?.page || 1, 10)
                );
                const tvMazePage = targetPage - 1;
                const tvRes = await axios.get(
                  `https://api.tvmaze.com/shows?page=${tvMazePage}`,
                  { timeout: 5e3 }
                );
                if (Array.isArray(tvRes.data)) {
                  const sorted = [...tvRes.data].filter((show) => !isExplicitAdultContent(show)).sort(
                    (a, b) => (b?.rating?.average || 0) - (a?.rating?.average || 0)
                  );
                  data = {
                    results: sorted.slice(0, 40).map((show) => ({
                      id: `tv:${show.id}`,
                      title: show.name,
                      image: show.image?.original || show.image?.medium || "/images/image-404.png",
                      rating: show.rating?.average || null,
                      year: (show.premiered || "").split("-")[0] || null,
                      type: "Movies",
                      provider: "provider",
                      overview: show.summary ? show.summary.replace(/<[^>]+>/g, "") : "",
                      genres: Array.isArray(show?.genres) ? show.genres.join(", ") : "",
                      status: show?.status || "Completed"
                    })),
                    totalPages: 100,
                    currentPage: targetPage,
                    hasNextPage: true,
                    site: "discover"
                  };
                }
              } catch (_) {
              }
            }
          }
          if (data?.results && Array.isArray(data.results)) {
            data.results = data.results.filter(
              (item) => !isExplicitAdultContent(item)
            );
          }
          if (filters && typeof filters === "object" && Array.isArray(data?.results)) {
            if (filters.genre && filters.genre !== "All" && filters.genre !== "") {
              const gLower = String(filters.genre).toLowerCase();
              data.results = data.results.filter((item) => {
                const hay = String(
                  item.genres || item.genre || item.overview || item.description || ""
                ).toLowerCase();
                return hay.includes(gLower);
              });
            }
            if (filters.year && filters.year !== "All" && filters.year !== "") {
              const yrTarget = String(filters.year);
              if (yrTarget === "Older") {
                data.results = data.results.filter((item) => {
                  const yrNum = parseInt(
                    String(
                      item.year || item.releaseDate || item.aired || "0"
                    ).match(/\b(19\d\d|20\d\d)\b/)?.[0] || "0",
                    10
                  );
                  return yrNum > 0 && yrNum <= 2010;
                });
              } else {
                data.results = data.results.filter((item) => {
                  const yStr = String(
                    item.year || item.releaseDate || item.aired || ""
                  );
                  return yStr.includes(yrTarget);
                });
              }
            }
            if (filters.format && filters.format !== "All" && filters.format !== "") {
              const fLower = String(filters.format).toLowerCase();
              data.results = data.results.filter((item) => {
                const typeStr = String(item.type || "").toLowerCase();
                if (fLower === "movie") return typeStr.includes("movie");
                if (fLower === "tv")
                  return typeStr.includes("tv") || typeStr.includes("series");
                return true;
              });
            }
            if (filters.status && filters.status !== "All" && filters.status !== "") {
              const sLower = String(filters.status).toLowerCase();
              data.results = data.results.filter((item) => {
                const statusStr = String(item.status || "").toLowerCase();
                if (sLower === "completed")
                  return statusStr.includes("completed") || statusStr.includes("ended");
                if (sLower === "ongoing" || sLower === "airing")
                  return statusStr.includes("ongoing") || statusStr.includes("airing") || statusStr.includes("running");
                return true;
              });
            }
            if (filters.sort) {
              if (filters.sort === "rating") {
                data.results.sort(
                  (a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0)
                );
              } else if (filters.sort === "latest") {
                data.results.sort((a, b) => {
                  const yrA = parseInt(
                    String(
                      a.year || a.releaseDate || a.aired || "0"
                    ).match(/\b(19\d\d|20\d\d)\b/)?.[0] || "0",
                    10
                  );
                  const yrB = parseInt(
                    String(
                      b.year || b.releaseDate || b.aired || "0"
                    ).match(/\b(19\d\d|20\d\d)\b/)?.[0] || "0",
                    10
                  );
                  return yrB - yrA;
                });
              } else if (filters.sort === "title") {
                data.results.sort(
                  (a, b) => (a.title || "").localeCompare(b.title || "")
                );
              }
            }
          }
          const siteName = pObj?.provider_name || pObj?.provider?.name || activeProvName || provider;
          if (data?.results && Array.isArray(data.results)) {
            for (const item of data.results) {
              if (item && !item.provider) {
                item.provider = siteName;
              }
            }
          }
          data = { ...data, site: siteName };
        }
      }
      if (!data) throw new Error(`No ${AnimeManga} Found in ${provider}`);
      if (data?.results && data.results.length > 0) {
        try {
          await enrichResultsWithMappingImages(data.results, AnimeManga);
        } catch (_) {
        }
        try {
          if (provider !== "local") {
            await enrichResultsWithWatchProgress(data.results, AnimeManga);
          }
        } catch (_) {
        }
        try {
          if (provider !== "local") {
            await enrichResultsWithDownloads(data.results, AnimeManga);
          }
        } catch (_) {
        }
        if (filters?.downloadStatus && Array.isArray(data.results)) {
          const dlStatus = String(filters.downloadStatus).toLowerCase();
          if (dlStatus === "downloaded") {
            data.results = data.results.filter(
              (item) => Array.isArray(item.Downloaded) && item.Downloaded.length > 0
            );
          } else if (dlStatus === "not_downloaded" || dlStatus === "nondownloaded") {
            data.results = data.results.filter(
              (item) => !item.Downloaded || item.Downloaded.length === 0
            );
          }
        }
        try {
          if (provider === "local") {
            const orderKey = `custom_order_${AnimeManga}_local_${filters?.tag || "all"}`;
            const savedOrder = await getKeyValue("Settings", orderKey);
            if (savedOrder && Array.isArray(savedOrder) && savedOrder.length > 0) {
              const orderMap = /* @__PURE__ */ new Map();
              savedOrder.forEach((id, idx) => orderMap.set(id, idx));
              data.results.sort((a, b) => {
                const indexA = orderMap.has(a.id) ? orderMap.get(a.id) : 9999;
                const indexB = orderMap.has(b.id) ? orderMap.get(b.id) : 9999;
                return indexA - indexB;
              });
            }
          }
        } catch (_) {
        }
      }
      if (AnimeManga === "Movies" && data?.results && Array.isArray(data.results)) {
        for (const item of data.results) {
          if (item) {
            delete item.MalID;
            item.malid = null;
          }
        }
      }
      return res.json(data);
    } catch (err) {
      logger.error(
        `Failed To Fetch ${provider} ${AnimeManga} page ${filters?.page}`
      );
      logger.error(`Error message: ${err.message}`);
      logger.error(`Stack trace: ${err.stack}`);
      res.json({
        totalPages: 0,
        currentPage: 1,
        hasNextPage: false,
        totalItems: 0,
        results: [],
        error: true,
        message: err.message,
        extension_missing: err?.message?.includes("Missing Provider!") || err?.message?.includes("not found") || err?.message?.includes("Provider ")
      });
    }
  }
);
router.post(
  [
    "/api/count/:AnimeManga/:provider",
    "/api/count/:AnimeManga/:repoOwner/:provider",
    "/api/list/:AnimeManga/:provider/count",
    "/api/list/:AnimeManga/:repoOwner/:provider/count"
  ],
  async (req, res) => {
    let { AnimeManga } = req.params;
    let provider = req.params.repoOwner ? `${req.params.repoOwner}/${req.params.provider}` : req.params.provider;
    if (AnimeManga === "Movies" || isMovieProvider(provider)) {
      AnimeManga = "Movies";
    } else if (AnimeManga === "Manga") {
      AnimeManga = "Manga";
    } else {
      AnimeManga = "Anime";
    }
    let filters = {};
    if (req?.body?.filters && typeof req.body.filters === "object") {
      for (const [key, value] of Object.entries(req.body.filters)) {
        if (value != null && value !== "") {
          const num = Number(value);
          filters[key] = !isNaN(num) ? num : value;
        }
      }
    }
    const searchKeyword = req?.body?.keyword || req?.query?.query || "";
    if (AnimeManga === "Movies" || !global.mappingDb) {
      return res.json({ count: 0 });
    }
    try {
      let count = 0;
      if (provider.startsWith("unique:") || provider.startsWith("unique_")) {
        const { whereClause, params } = buildUniqueProviderWhere(
          AnimeManga,
          provider,
          filters,
          searchKeyword
        );
        const row = await global.mappingDb.prepare(
          `SELECT COUNT(*) as count FROM unmapped_items WHERE ${whereClause}`
        ).get(...params);
        count = row?.count || 0;
      } else {
        const { table, whereClause, params } = await buildLocalCatalogWhere(
          AnimeManga,
          filters,
          searchKeyword
        );
        const row = await global.mappingDb.prepare(
          `SELECT COUNT(*) as count FROM ${table} WHERE ${whereClause}`
        ).get(...params);
        count = row?.count || 0;
      }
      return res.json({ count });
    } catch (err) {
      logger.error(`Error in count endpoint for ${provider}: ${err.message}`);
      return res.json({ count: 0 });
    }
  }
);
router.get("/api/:AnimeManga/suggestions", async (req, res) => {
  try {
    const query = String(req.query.q || req.query.keyword || "").trim();
    if (!query || query.length < 2) {
      return res.json({ suggestions: [], person: null });
    }
    const suggestions = [];
    const seenTitles = /* @__PURE__ */ new Set();
    const personPromise = searchPersonWithCache(query).catch(() => []);
    try {
      const tvRes = await axios.get(
        `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`,
        { timeout: 2500 }
      );
      if (Array.isArray(tvRes.data)) {
        for (const entry of tvRes.data) {
          const name = entry?.show?.name;
          if (name && !seenTitles.has(name.toLowerCase()) && !isExplicitAdultContent(entry.show)) {
            seenTitles.add(name.toLowerCase());
            suggestions.push({
              id: `tv:${entry.show.id}`,
              title: name,
              image: entry.show.image?.medium || entry.show.image?.original || null,
              type: "tv",
              year: (entry.show.premiered || "").split("-")[0] || null,
              rating: entry.show.rating?.average || null,
              overview: entry.show.summary ? entry.show.summary.replace(/<[^>]+>/g, "").slice(0, 110) : "",
              genres: Array.isArray(entry.show.genres) ? entry.show.genres.slice(0, 2) : []
            });
            if (suggestions.length >= 6) break;
          }
        }
      }
    } catch (_) {
    }
    try {
      const wikiRes = await axios.get(
        `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=8&namespace=0&format=json`,
        {
          headers: { "User-Agent": "Iconmedia/1.0" },
          timeout: 2500
        }
      );
      if (Array.isArray(wikiRes.data) && Array.isArray(wikiRes.data[1])) {
        for (let i = 0; i < wikiRes.data[1].length; i++) {
          const rawTitle = wikiRes.data[1][i];
          const desc = wikiRes.data[2]?.[i] || "";
          const clean = rawTitle.replace(
            /\s*\((film|movie|tv series|miniseries|television series|soundtrack)\)$/i,
            ""
          ).trim();
          if (clean && !seenTitles.has(clean.toLowerCase()) && !isExplicitAdultContent({ title: clean, overview: desc })) {
            seenTitles.add(clean.toLowerCase());
            const isTv = /tv series|television/i.test(rawTitle + " " + desc);
            suggestions.push({
              id: isTv ? `tv:${clean}` : `movie:${clean}`,
              title: clean,
              type: isTv ? "tv" : "movie",
              overview: desc ? desc.slice(0, 110) : ""
            });
            if (suggestions.length >= 8) break;
          }
        }
      }
    } catch (_) {
    }
    const tmdbKey = process.env.TMDB_API_KEY || await settingfetch("tmdb_api_key");
    if (tmdbKey) {
      try {
        const tmdbRes = await axios.get(
          `https://api.themoviedb.org/3/search/multi?api_key=${tmdbKey}&query=${encodeURIComponent(query)}&page=1`,
          { timeout: 2500 }
        );
        if (tmdbRes.data?.results && Array.isArray(tmdbRes.data.results)) {
          for (const item of tmdbRes.data.results) {
            const name = item.title || item.name || item.original_title || item.original_name;
            if (name && !seenTitles.has(name.toLowerCase()) && !isExplicitAdultContent(item)) {
              seenTitles.add(name.toLowerCase());
              const isTv = item.media_type === "tv";
              suggestions.unshift({
                id: isTv ? `tv:${item.id}` : `movie:${item.id}`,
                title: name,
                image: item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : void 0,
                type: isTv ? "tv" : "movie",
                year: (item.release_date || item.first_air_date || "").split("-")[0] || null,
                rating: item.vote_average ? Number(item.vote_average.toFixed(1)) : null,
                overview: item.overview ? item.overview.slice(0, 110) : ""
              });
            }
          }
        }
      } catch (_) {
      }
    }
    const people = await personPromise;
    const topPerson = Array.isArray(people) && people.length > 0 ? people[0] : null;
    return res.json({
      suggestions: suggestions.slice(0, 8),
      person: topPerson
    });
  } catch (err) {
    logger.error(`Error in suggestions: ${err.message}`);
    return res.json({ suggestions: [], person: null });
  }
});
router.get("/api/person/search", async (req, res) => {
  try {
    const query = String(req.query.q || req.query.keyword || "").trim();
    if (!query || query.length < 2) {
      return res.json({ people: [] });
    }
    const people = await searchPersonWithCache(query);
    const limit = parseInt(req.query.limit, 10) || 5;
    return res.json({ people: people.slice(0, limit) });
  } catch (err) {
    logger.error(`Error in /api/person/search: ${err.message}`);
    return res.status(500).json({ error: err.message, people: [] });
  }
});
router.get("/api/person/:id/credits", async (req, res) => {
  try {
    const personId = String(req.params.id || "").trim();
    const refresh = req.query.refresh === "true" || req.query.refresh === "1";
    if (!personId) {
      return res.status(400).json({ error: "Missing person id parameter" });
    }
    const result = await getPersonCreditsWithCache(personId, refresh);
    if (!result.person && (!result.credits || result.credits.length === 0)) {
      return res.status(404).json({ error: "Person or credits not found", person: null, credits: [] });
    }
    return res.json({ person: result.person, credits: result.credits });
  } catch (err) {
    logger.error(`Error in /api/person/:id/credits: ${err.message}`);
    return res.status(500).json({ error: err.message, person: null, credits: [] });
  }
});
router.get("/api/movies/featured", async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const featured = [];
    const seenTitles = /* @__PURE__ */ new Set();
    const tmdbKey = process.env.TMDB_API_KEY || await settingfetch("tmdb_api_key");
    if (tmdbKey) {
      try {
        const tmdbRes = await axios.get(
          `https://api.themoviedb.org/3/trending/all/week?api_key=${tmdbKey}&page=${page}`,
          { timeout: 4e3 }
        );
        if (tmdbRes.data?.results && Array.isArray(tmdbRes.data.results)) {
          for (const item of tmdbRes.data.results) {
            const name = item.title || item.name || item.original_title || item.original_name;
            if (name && !seenTitles.has(name.toLowerCase()) && !isExplicitAdultContent(item)) {
              seenTitles.add(name.toLowerCase());
              featured.push({
                id: item.id,
                title: name,
                poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
                backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null,
                overview: item.overview,
                rating: item.vote_average ? Number(item.vote_average.toFixed(1)) : null,
                year: (item.release_date || item.first_air_date || "").split(
                  "-"
                )[0] || null,
                mediaType: item.media_type === "tv" ? "tv" : "movie"
              });
            }
          }
        }
      } catch (_) {
      }
    }
    if (featured.length === 0) {
      try {
        const tvMazePage = Math.max(0, page - 1);
        const tvRes = await axios.get(
          `https://api.tvmaze.com/shows?page=${tvMazePage}`,
          { timeout: 4500 }
        );
        if (Array.isArray(tvRes.data)) {
          const sorted = [...tvRes.data].sort((a, b) => {
            const rA = a?.rating?.average || 0;
            const rB = b?.rating?.average || 0;
            return rB - rA;
          });
          for (const show of sorted.slice(0, 24)) {
            const name = show?.name;
            if (name && !seenTitles.has(name.toLowerCase()) && !isExplicitAdultContent(show)) {
              seenTitles.add(name.toLowerCase());
              featured.push({
                id: show.id,
                title: name,
                poster: show.image?.original || show.image?.medium || null,
                backdrop: show.image?.original || null,
                overview: show.summary ? show.summary.replace(/<[^>]+>/g, "") : "",
                rating: show.rating?.average || null,
                year: (show.premiered || "").split("-")[0] || null,
                mediaType: "tv"
              });
            }
          }
        }
      } catch (_) {
      }
    }
    return res.json({
      featured,
      page,
      hasNextPage: true
    });
  } catch (err) {
    logger.error(`Error in /api/movies/featured: ${err.message}`);
    return res.json({ featured: [], page: 1, hasNextPage: false });
  }
});
router.get("/api/schedule/weekly", async (_, res) => {
  try {
    const localToday = /* @__PURE__ */ new Date();
    const todayStart = new Date(
      localToday.getFullYear(),
      localToday.getMonth(),
      localToday.getDate(),
      0,
      0,
      0
    ).getTime() / 1e3;
    const yesterdayStart = todayStart - 24 * 3600;
    const limitEnd = todayStart + 7 * 24 * 3600;
    const episodes = await global.mappingDb.prepare(
      `
        SELECT ne.livechart_id, ne.episode, ne.date, ne.title, COALESCE(a.image_url, ne.image, '/images/image-404.png') AS image, ne.image AS scraper_image, a.malid
        FROM next_episodes ne
        LEFT JOIN anime a ON ne.livechart_id = a.livechart_id
        WHERE ne.date >= ? AND ne.date <= ?
        GROUP BY ne.livechart_id, DATE(ne.date, 'unixepoch')
        ORDER BY ne.date ASC
      `
    ).all(yesterdayStart, limitEnd);
    res.json({
      results: episodes,
      updating: !!global.livechart_updating
    });
  } catch (err) {
    logger.error(`Error in /api/schedule/weekly: ${err.message}`);
    res.status(500).json({ error: true, message: err.message });
  }
});
async function healProviderId(providerObj, { oldId, malid, title, folderName }) {
  if (!providerObj || !oldId) return null;
  const cleanOldId = String(oldId).trim();
  let newId = null;
  if (typeof providerObj.healId === "function") {
    try {
      newId = await providerObj.healId({
        oldId: cleanOldId,
        malid,
        title,
        folderName
      });
    } catch (err) {
      logger.error(
        `[healProviderId] Error healing ID for ${providerObj.name || "provider"}: ${err.message}`
      );
    }
  }
  if (newId && newId !== cleanOldId) {
    try {
      if (global.db) {
        await global.db.prepare(
          "UPDATE OR REPLACE Anime SET id = REPLACE(id, ?, ?) WHERE id = ? OR id LIKE ?"
        ).run(cleanOldId, newId, cleanOldId, `${cleanOldId}-%`);
        await global.db.prepare(
          "UPDATE WatchHistory SET anime_id = REPLACE(anime_id, ?, ?) WHERE anime_id = ? OR anime_id LIKE ?"
        ).run(cleanOldId, newId, cleanOldId, `${cleanOldId}-%`);
        await global.db.prepare(
          "UPDATE SkipTimes SET anime_id = REPLACE(anime_id, ?, ?) WHERE anime_id = ? OR anime_id LIKE ?"
        ).run(cleanOldId, newId, cleanOldId, `${cleanOldId}-%`);
        try {
          await global.db.prepare(
            "UPDATE unlinked_mal_ids SET id = REPLACE(id, ?, ?) WHERE id = ? OR id LIKE ?"
          ).run(cleanOldId, newId, cleanOldId, `${cleanOldId}-%`);
        } catch (_) {
        }
      }
      if (typeof global.sendToRenderer === "function") {
        global.sendToRenderer("anime-id-updated", {
          oldId: cleanOldId,
          newId,
          provider: providerObj.name || "Anime",
          mediaType: "Anime"
        });
      }
      logger.info(
        `[healProviderId] Successfully updated Anime ID from ${cleanOldId} to ${newId}`
      );
      return newId;
    } catch (dbErr) {
      logger.error(
        `[healProviderId] Failed to update resolved ID in database: ${dbErr.message}`
      );
    }
  }
  return null;
}
router.post(
  [
    "/api/info/:AnimeManga/:LocalMalProvider",
    "/api/info/:AnimeManga/:repoOwner/:LocalMalProvider"
  ],
  async (req, res) => {
    let { AnimeManga } = req.params;
    let LocalMalProvider = req.params.repoOwner ? `${req.params.repoOwner}/${req.params.LocalMalProvider}` : req.params.LocalMalProvider;
    let { id } = req.body;
    if (AnimeManga === "Movies" || isMovieProvider(LocalMalProvider) || typeof id === "string" && (id.startsWith("tv:") || id.startsWith("movie:"))) {
      AnimeManga = "Movies";
    } else if (AnimeManga === "Manga") {
      AnimeManga = "Manga";
    } else {
      AnimeManga = "Anime";
    }
    const data = {
      MalLoggedIn: !!global?.MalLoggedIn
    };
    let provider = null;
    const setting = await settingfetch();
    try {
      if (!id) throw new Error("ID IS Missing");
      try {
        const AnimeLocalInfo = await FindMapping(
          AnimeManga,
          id,
          null,
          AnimeManga === "Anime" ? setting?.CustomDownloadLocationAnime : AnimeManga === "Movies" ? setting?.CustomDownloadLocationMovies : setting?.CustomDownloadLocationManga
        );
        if (AnimeLocalInfo && AnimeLocalInfo.id) {
          Object.assign(data, AnimeLocalInfo);
          data.genres = AnimeLocalInfo?.genres ? AnimeLocalInfo.genres.split(",") : [];
          provider = AnimeLocalInfo?.provider;
        } else {
          throw new Error("Metadata not found locally");
        }
      } catch (err) {
        if (LocalMalProvider === "local") {
          let resolvedId = null;
          let resolvedProvider = null;
          let resolvedMalId = null;
          if (global.db && id) {
            try {
              const unlinkedRow = await global.db.prepare("SELECT malid FROM unlinked_mal_ids WHERE id = ?").get(id);
              if (unlinkedRow && unlinkedRow.malid) {
                resolvedMalId = parseInt(unlinkedRow.malid);
              }
            } catch (_) {
            }
            let fallbackTitle = null;
            if (!resolvedMalId) {
              try {
                let localRow = await global.db.prepare(
                  AnimeManga === "Movies" ? `SELECT id, provider FROM Movies WHERE id = ? OR folder_name = ? OR LOWER(title) = LOWER(?) LIMIT 1` : `SELECT MalID, id, provider FROM ${AnimeManga} WHERE id = ? OR folder_name = ? OR LOWER(title) = LOWER(?) LIMIT 1`
                ).get(id, id, id);
                if (!localRow) {
                  const histTable = AnimeManga === "Movies" ? "SeriesMovieWatchHistory" : AnimeManga === "Anime" ? "WatchHistory" : "ReadHistory";
                  const idCol = AnimeManga === "Movies" ? "movie_id" : AnimeManga === "Anime" ? "anime_id" : "manga_id";
                  const titleCol = AnimeManga === "Movies" ? "title" : AnimeManga === "Anime" ? "anime_title" : "manga_title";
                  const histRow = await global.db.prepare(
                    `SELECT ${titleCol} FROM ${histTable} WHERE ${idCol} = ? LIMIT 1`
                  ).get(id);
                  if (histRow && histRow[titleCol]) {
                    fallbackTitle = histRow[titleCol];
                    localRow = await global.db.prepare(
                      AnimeManga === "Movies" ? `SELECT id, provider FROM Movies WHERE LOWER(title) = LOWER(?) LIMIT 1` : `SELECT MalID, id, provider FROM ${AnimeManga} WHERE LOWER(title) = LOWER(?) LIMIT 1`
                    ).get(fallbackTitle);
                  }
                }
                if (localRow) {
                  if (localRow.MalID) {
                    resolvedMalId = parseInt(localRow.MalID);
                  }
                  resolvedId = localRow.id;
                  resolvedProvider = localRow.provider || (AnimeManga === "Movies" ? setting.Moviesprovider || "provider" : "pahe");
                }
              } catch (_) {
              }
            }
          }
          if (!resolvedMalId && global.mappingDb && id) {
            try {
              const foundMalId = await resolveMalIdFromMapping({
                id,
                mediaType: AnimeManga,
                installedOnly: true
              });
              if (foundMalId) {
                resolvedMalId = foundMalId;
                const preferred = (AnimeManga === "Anime" ? setting.Animeprovider || "pahe" : AnimeManga === "Movies" ? setting.Moviesprovider || "provider" : setting.Mangaprovider || "weebcentral").toLowerCase();
                const best = await getBestProviderForMalId(
                  resolvedMalId,
                  AnimeManga,
                  preferred
                );
                if (best) {
                  resolvedId = best.id;
                  resolvedProvider = best.provider;
                }
              }
            } catch (_) {
            }
          }
          if (!resolvedId && AnimeManga === "Anime" && id) {
            try {
              const preferred = (setting.Animeprovider || "").toLowerCase();
              const providerToHeal = global.Anime_providers && (global.Anime_providers[preferred] || global.Anime_providers[setting.Animeprovider]) || global.Anime_providers && Object.values(global.Anime_providers)[0] || null;
              const healedId = await healProviderId(providerToHeal, {
                oldId: id,
                title: data?.title || "",
                malid: resolvedMalId,
                folderName: null
              });
              if (healedId) {
                resolvedId = healedId;
                resolvedProvider = providerToHeal?.name || preferred;
                if (global.db) {
                  const healedRow = await global.db.prepare(
                    "SELECT MalID, id, provider FROM Anime WHERE id = ? LIMIT 1"
                  ).get(healedId);
                  if (healedRow) {
                    if (healedRow.MalID)
                      resolvedMalId = parseInt(healedRow.MalID);
                    resolvedProvider = healedRow.provider || resolvedProvider;
                  }
                }
              }
            } catch (_) {
            }
          }
          if (!resolvedId && AnimeManga === "Movies" && id) {
            resolvedId = id;
            resolvedProvider = setting?.Moviesprovider || await reconcileActiveProvider("Movies");
          }
          if (resolvedId && resolvedProvider) {
            resolvedId = String(resolvedId);
            id = resolvedId;
            LocalMalProvider = resolvedProvider;
            provider = resolvedProvider;
            data.id = resolvedId;
            data.provider = resolvedProvider;
            data.malid = resolvedMalId;
          } else {
            throw new Error(`No ${AnimeManga} Found with id '${id}'`);
          }
        } else if (LocalMalProvider === "mal") {
          let resolvedId = null;
          let resolvedProvider = null;
          if (AnimeManga === "Movies") {
            const activeProvName = setting?.Moviesprovider || await reconcileActiveProvider("Movies");
            resolvedId = id;
            resolvedProvider = activeProvName || "provider";
            LocalMalProvider = resolvedProvider;
            provider = resolvedProvider;
            data.id = String(id);
            data.provider = resolvedProvider;
            data.malid = null;
          } else {
            let targetMalId = Number(id);
            if (isNaN(targetMalId)) {
              try {
                const found = await resolveMalIdFromMapping({
                  id,
                  mediaType: AnimeManga
                });
                if (found) {
                  targetMalId = Number(found);
                }
              } catch (_) {
              }
            }
            const preferred = (AnimeManga === "Anime" ? setting.Animeprovider || "pahe" : setting.Mangaprovider || "weebcentral").toLowerCase();
            if (targetMalId && !isNaN(targetMalId)) {
              const best = await getBestProviderForMalId(
                targetMalId,
                AnimeManga,
                preferred
              );
              if (best) {
                resolvedId = best.id;
                resolvedProvider = best.provider;
              }
            }
            if (!resolvedId && global.mappingDb && id) {
              try {
                const unmapped = await global.mappingDb.prepare(
                  "SELECT provider FROM unmapped_items WHERE id = ? LIMIT 1"
                ).get(id);
                if (unmapped?.provider) {
                  resolvedId = id;
                  resolvedProvider = unmapped.provider;
                }
              } catch (_) {
              }
            }
            if (resolvedId && resolvedProvider) {
              resolvedId = String(resolvedId);
              id = resolvedId;
              LocalMalProvider = resolvedProvider;
              provider = resolvedProvider;
              data.id = resolvedId;
              data.provider = resolvedProvider;
              data.malid = targetMalId && !isNaN(targetMalId) ? targetMalId : null;
            } else {
              throw new Error(
                `This ${AnimeManga.toLowerCase()} is not mapped to any provider yet.`
              );
            }
          }
        }
      }
      if (LocalMalProvider !== "local" || provider && provider !== "local source") {
        try {
          if (AnimeManga === "Anime") {
            const Animeprovider = await providerFetch(
              "Anime",
              (LocalMalProvider !== "local" && LocalMalProvider !== "provider" ? LocalMalProvider : provider) ?? null
            );
            const lookupId = id;
            let AnimeInfo = null;
            try {
              AnimeInfo = await animeinfo(
                Animeprovider,
                setting?.CustomDownloadLocationAnime,
                lookupId,
                data?.provider ? false : true
              );
            } catch (fetchErr) {
              logger.warn(
                `Failed to fetch initial online metadata for ${lookupId}: ${fetchErr.message}`
              );
            }
            if (typeof Animeprovider.healId === "function" && (!AnimeInfo || !AnimeInfo.title || AnimeInfo.results || AnimeInfo.needsMappingSync)) {
              let newId = AnimeInfo?.newUuid && AnimeInfo.newUuid !== lookupId ? AnimeInfo.newUuid : null;
              if (!newId || newId === lookupId) {
                newId = await healProviderId(Animeprovider, {
                  oldId: lookupId,
                  title: data.title,
                  malid: data.malid,
                  folderName: null
                });
              }
              if (newId && newId !== lookupId) {
                AnimeInfo = await animeinfo(
                  Animeprovider,
                  setting?.CustomDownloadLocationAnime,
                  newId,
                  false
                );
                id = newId;
                data.id = newId;
              }
              if (typeof global.sendToRenderer === "function") {
                global.sendToRenderer("info-loading-status", {
                  text: ""
                });
              }
            }
            if (AnimeInfo) {
              Object.assign(data, AnimeInfo);
              try {
                await global.db.prepare(
                  `UPDATE Anime SET description = ?, status = ?, genres = ?, aired = ?, image_url = ?, provider = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?`
                ).run(
                  AnimeInfo.description || "",
                  AnimeInfo.status || "",
                  Array.isArray(AnimeInfo.genres) ? AnimeInfo.genres.join(",") : AnimeInfo.genres || "",
                  AnimeInfo.aired || "",
                  AnimeInfo.image_url || AnimeInfo.image || "",
                  Animeprovider.provider_name,
                  id
                );
              } catch (dbErr) {
                logger.error(
                  `Failed to update local metadata for Anime ${id}: ${dbErr.message}`
                );
              }
            }
            data.provider = Animeprovider.provider_name;
            if (!data.malid && Array.isArray(Animeprovider?.provider?.MappingRules)) {
              for (const rule of Animeprovider.provider.MappingRules) {
                if (typeof rule?.extractMalId === "function") {
                  try {
                    const m = rule.extractMalId(AnimeInfo);
                    if (m) {
                      data.malid = Number(m);
                      break;
                    }
                  } catch (_) {
                  }
                }
              }
            }
            const provName = Animeprovider.provider_name;
            const cleanProv = (provName || "").toLowerCase().split("/").pop();
            const targetProvider = provName && (provName.startsWith("@") || provName.includes("/")) ? provName.toLowerCase().startsWith("theyogmehta/") ? cleanProv : provName.startsWith("@") ? provName.trim() : `@${provName.trim()}` : cleanProv;
            const safeAnimeApi = {
              isMapped: async (itemId) => {
                if (!global.mappingDb) return false;
                const tid = String(itemId || id);
                try {
                  let row = null;
                  if (cleanProv === "pahe") {
                    row = await global.mappingDb.prepare(
                      "SELECT malid FROM pahe WHERE (id = ? OR uuid = ?) AND malid IS NOT NULL LIMIT 1"
                    ).get(tid, tid);
                  } else {
                    row = await global.mappingDb.prepare(
                      `SELECT malid FROM "${cleanProv}" WHERE id = ? AND malid IS NOT NULL LIMIT 1`
                    ).get(tid);
                  }
                  return !!(row && row.malid);
                } catch (_) {
                  return false;
                }
              },
              getMappedMalId: async (itemId) => {
                if (!global.mappingDb) return null;
                const tid = String(itemId || id);
                try {
                  let row = null;
                  if (cleanProv === "pahe") {
                    row = await global.mappingDb.prepare(
                      "SELECT malid FROM pahe WHERE (id = ? OR uuid = ?) AND malid IS NOT NULL LIMIT 1"
                    ).get(tid, tid);
                  } else {
                    row = await global.mappingDb.prepare(
                      `SELECT malid FROM "${cleanProv}" WHERE id = ? AND malid IS NOT NULL LIMIT 1`
                    ).get(tid);
                  }
                  return row && row.malid ? Number(row.malid) : null;
                } catch (_) {
                  return null;
                }
              },
              saveUnmapped: async (unmappedData) => {
                if (!unmappedData || !global.mappingDb) return;
                const targetId = String(unmappedData.id || id);
                try {
                  if (global.db) {
                    const customRow = await global.db.prepare(
                      "SELECT malid FROM unlinked_mal_ids WHERE id = ? AND malid IS NOT NULL LIMIT 1"
                    ).get(targetId);
                    if (customRow && customRow.malid) {
                      await global.mappingDb.prepare(
                        "DELETE FROM unmapped_items WHERE (provider = ? OR provider = ? OR provider = ?) AND (id = ? OR id = ?)"
                      ).run(
                        targetProvider,
                        cleanProv,
                        provName,
                        targetId,
                        targetId
                      );
                      return;
                    }
                  }
                  let mappedRow = null;
                  if (cleanProv === "pahe") {
                    mappedRow = await global.mappingDb.prepare(
                      "SELECT malid FROM pahe WHERE (id = ? OR uuid = ?) AND malid IS NOT NULL LIMIT 1"
                    ).get(targetId, targetId);
                  } else {
                    mappedRow = await global.mappingDb.prepare(
                      `SELECT malid FROM "${cleanProv}" WHERE id = ? AND malid IS NOT NULL LIMIT 1`
                    ).get(targetId);
                  }
                  if (mappedRow && mappedRow.malid) {
                    await global.mappingDb.prepare(
                      "DELETE FROM unmapped_items WHERE (provider = ? OR provider = ? OR provider = ?) AND (id = ? OR id = ?)"
                    ).run(
                      targetProvider,
                      cleanProv,
                      provName,
                      targetId,
                      targetId
                    );
                    return;
                  }
                  const checkTitle = (unmappedData.name || unmappedData.title || data.title || "").trim();
                  if (checkTitle) {
                    const matchAnime = await global.mappingDb.prepare(
                      "SELECT malid FROM anime WHERE LOWER(TRIM(title)) = LOWER(TRIM(?)) LIMIT 1"
                    ).get(checkTitle);
                    if (matchAnime && matchAnime.malid) {
                      if (cleanProv === "pahe") {
                        await global.mappingDb.prepare(
                          "INSERT OR REPLACE INTO pahe (id, uuid, malid) VALUES (?, ?, ?)"
                        ).run(targetId, targetId, matchAnime.malid);
                      } else {
                        await global.mappingDb.prepare(
                          `INSERT OR REPLACE INTO "${cleanProv}" (id, malid) VALUES (?, ?)`
                        ).run(targetId, matchAnime.malid);
                      }
                      await global.mappingDb.prepare(
                        "DELETE FROM unmapped_items WHERE (provider = ? OR provider = ? OR provider = ?) AND (id = ? OR id = ?)"
                      ).run(
                        targetProvider,
                        cleanProv,
                        provName,
                        targetId,
                        targetId
                      );
                      return;
                    }
                  }
                } catch (_) {
                }
                const validAnimeTitle = (unmappedData.name || unmappedData.title || data.title || "").trim();
                if (validAnimeTitle && validAnimeTitle.toLowerCase() !== "unknown") {
                  try {
                    await global.mappingDb.prepare(
                      `INSERT OR REPLACE INTO unmapped_items (
                        id, provider, media_type, name, image_url, type, episodes, status, season, year, last_fetched
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
                    ).run(
                      targetId,
                      targetProvider,
                      "Anime",
                      validAnimeTitle,
                      unmappedData.image_url || unmappedData.image || data.image_url || null,
                      unmappedData.type || data.type || "TV",
                      cleanEpCount(unmappedData.episodes) || cleanEpCount(data.episodes) || (data.totalEpisodes ? String(data.totalEpisodes) : null),
                      unmappedData.status || data.status || "Unknown",
                      unmappedData.season || data.season || null,
                      unmappedData.year ? parseInt(unmappedData.year, 10) : data.year ? parseInt(data.year, 10) : null
                    );
                  } catch (_) {
                  }
                  try {
                    const axiosClient = global.axios || require("axios");
                    axiosClient.post(
                      "https://strawverse.theyogmehta.online/api/unmapped/report",
                      {
                        id: targetId,
                        provider: targetProvider,
                        media_type: "Anime",
                        name: validAnimeTitle,
                        image_url: unmappedData.image_url || unmappedData.image || data.image_url || null,
                        type: unmappedData.type || data.type || "TV",
                        episodes: cleanEpCount(unmappedData.episodes) || cleanEpCount(data.episodes) || (data.totalEpisodes ? String(data.totalEpisodes) : null),
                        status: unmappedData.status || data.status || "Unknown",
                        season: unmappedData.season || data.season || null,
                        year: unmappedData.year ? parseInt(unmappedData.year, 10) : data.year ? parseInt(data.year, 10) : null
                      },
                      { timeout: 5e3 }
                    ).catch(() => {
                    });
                  } catch (_) {
                  }
                }
              },
              deleteUnmapped: async (itemId) => {
                if (!global.mappingDb) return;
                try {
                  await global.mappingDb.prepare(
                    "DELETE FROM unmapped_items WHERE (provider = ? OR provider = ? OR provider = ?) AND (id = ? OR id = ?)"
                  ).run(
                    targetProvider,
                    cleanProv,
                    provName,
                    String(itemId || id),
                    String(itemId || id)
                  );
                } catch (_) {
                }
              },
              reportMapping: async (mappingReport) => {
                if (!mappingReport) return;
                try {
                  const axiosClient = global.axios || require("axios");
                  await axiosClient.post(
                    "https://strawverse.theyogmehta.online/api/pahe/report",
                    mappingReport,
                    { timeout: 5e3 }
                  );
                } catch (_) {
                }
              }
            };
            if (typeof Animeprovider?.provider?.onInfoFetched === "function") {
              try {
                await Animeprovider.provider.onInfoFetched({
                  id,
                  info: AnimeInfo,
                  api: safeAnimeApi
                });
              } catch (extErr) {
                logger.error(
                  `[onInfoFetched] Anime provider hook error: ${extErr.message}`
                );
              }
            }
          } else if (AnimeManga === "Manga") {
            const Mangaprovider = await providerFetch(
              "Manga",
              (LocalMalProvider !== "local" && LocalMalProvider !== "provider" ? LocalMalProvider : provider) ?? null
            );
            const MangaInfoData = await MangaInfo(Mangaprovider, id);
            if (MangaInfoData) {
              Object.assign(data, MangaInfoData);
              try {
                await global.db.prepare(
                  `UPDATE Manga SET description = ?, status = ?, genres = ?, released = ?, author = ?, image_url = ?, provider = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?`
                ).run(
                  MangaInfoData.description || "",
                  MangaInfoData.status || "",
                  Array.isArray(MangaInfoData.genres) ? MangaInfoData.genres.join(",") : MangaInfoData.genres || "",
                  MangaInfoData.released || "",
                  MangaInfoData.author || "",
                  MangaInfoData.image_url || MangaInfoData.image || "",
                  Mangaprovider.provider_name,
                  id
                );
              } catch (dbErr) {
                logger.error(
                  `Failed to update local metadata for Manga ${id}: ${dbErr.message}`
                );
              }
            }
            data.provider = Mangaprovider.provider_name;
            if (!data.malid && Array.isArray(Mangaprovider?.provider?.MappingRules)) {
              for (const rule of Mangaprovider.provider.MappingRules) {
                if (typeof rule?.extractMalId === "function") {
                  try {
                    const m = rule.extractMalId(MangaInfoData);
                    if (m) {
                      data.malid = Number(m);
                      break;
                    }
                  } catch (_) {
                  }
                }
              }
            }
            if (typeof Mangaprovider?.provider?.onInfoFetched === "function") {
              try {
                const provName = Mangaprovider.provider_name;
                const cleanProv = (provName || "").toLowerCase().split("/").pop();
                const targetProvider = provName && (provName.startsWith("@") || provName.includes("/")) ? provName.toLowerCase().startsWith("theyogmehta/") ? cleanProv : provName.startsWith("@") ? provName.trim() : `@${provName.trim()}` : cleanProv;
                const safeMangaApi = {
                  isMapped: async (itemId) => {
                    if (!global.mappingDb) return false;
                    const tid = String(itemId || id);
                    try {
                      const row = await global.mappingDb.prepare(
                        `SELECT malid FROM "${cleanProv}" WHERE id = ? AND malid IS NOT NULL LIMIT 1`
                      ).get(tid);
                      return !!(row && row.malid);
                    } catch (_) {
                      return false;
                    }
                  },
                  getMappedMalId: async (itemId) => {
                    if (!global.mappingDb) return null;
                    const tid = String(itemId || id);
                    try {
                      const row = await global.mappingDb.prepare(
                        `SELECT malid FROM "${cleanProv}" WHERE id = ? AND malid IS NOT NULL LIMIT 1`
                      ).get(tid);
                      return row && row.malid ? Number(row.malid) : null;
                    } catch (_) {
                      return null;
                    }
                  },
                  saveUnmapped: async (unmappedData) => {
                    if (!unmappedData || !global.mappingDb) return;
                    const targetId = String(unmappedData.id || id);
                    try {
                      if (global.db) {
                        const customRow = await global.db.prepare(
                          "SELECT malid FROM unlinked_mal_ids WHERE id = ? AND malid IS NOT NULL LIMIT 1"
                        ).get(targetId);
                        if (customRow && customRow.malid) {
                          await global.mappingDb.prepare(
                            "DELETE FROM unmapped_items WHERE (provider = ? OR provider = ? OR provider = ?) AND (id = ? OR id = ?)"
                          ).run(
                            targetProvider,
                            cleanProv,
                            provName,
                            targetId,
                            targetId
                          );
                          return;
                        }
                      }
                      const mappedRow = await global.mappingDb.prepare(
                        `SELECT malid FROM "${cleanProv}" WHERE id = ? AND malid IS NOT NULL LIMIT 1`
                      ).get(targetId);
                      if (mappedRow && mappedRow.malid) {
                        await global.mappingDb.prepare(
                          "DELETE FROM unmapped_items WHERE (provider = ? OR provider = ? OR provider = ?) AND (id = ? OR id = ?)"
                        ).run(
                          targetProvider,
                          cleanProv,
                          provName,
                          targetId,
                          targetId
                        );
                        return;
                      }
                      const checkTitle = (unmappedData.name || unmappedData.title || data.title || "").trim();
                      if (checkTitle) {
                        const matchManga = await global.mappingDb.prepare(
                          "SELECT malid FROM manga WHERE LOWER(TRIM(title)) = LOWER(TRIM(?)) LIMIT 1"
                        ).get(checkTitle);
                        if (matchManga && matchManga.malid) {
                          const hasTbl = await global.mappingDb.prepare(
                            "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?"
                          ).get(cleanProv);
                          if (hasTbl) {
                            await global.mappingDb.prepare(
                              `INSERT OR REPLACE INTO "${cleanProv}" (id, malid) VALUES (?, ?)`
                            ).run(targetId, matchManga.malid);
                          }
                          await global.mappingDb.prepare(
                            "DELETE FROM unmapped_items WHERE (provider = ? OR provider = ? OR provider = ?) AND (id = ? OR id = ?)"
                          ).run(
                            targetProvider,
                            cleanProv,
                            provName,
                            targetId,
                            targetId
                          );
                          return;
                        }
                      }
                    } catch (_) {
                    }
                    const validMangaTitle = (unmappedData.name || unmappedData.title || data.title || "").trim();
                    if (validMangaTitle && validMangaTitle.toLowerCase() !== "unknown") {
                      try {
                        await global.mappingDb.prepare(
                          `INSERT OR REPLACE INTO unmapped_items (
                            id, provider, media_type, name, image_url, type, episodes, status, season, year, last_fetched
                          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
                        ).run(
                          targetId,
                          targetProvider,
                          "Manga",
                          validMangaTitle,
                          unmappedData.image_url || unmappedData.image || data.image_url || null,
                          unmappedData.type || data.type || "Manga",
                          cleanEpCount(unmappedData.episodes) || cleanEpCount(unmappedData.chapters) || cleanEpCount(data.chapters) || (data.totalChapters ? String(data.totalChapters) : null),
                          unmappedData.status || data.status || "Unknown",
                          unmappedData.season || null,
                          unmappedData.year ? parseInt(unmappedData.year, 10) : data.year ? parseInt(data.year, 10) : null
                        );
                      } catch (_) {
                      }
                      try {
                        const axiosClient = global.axios || require("axios");
                        axiosClient.post(
                          "https://strawverse.theyogmehta.online/api/unmapped/report",
                          {
                            id: targetId,
                            provider: targetProvider,
                            media_type: "Manga",
                            name: validMangaTitle,
                            image_url: unmappedData.image_url || unmappedData.image || data.image_url || null,
                            type: unmappedData.type || data.type || "Manga",
                            episodes: cleanEpCount(unmappedData.episodes) || cleanEpCount(unmappedData.chapters) || cleanEpCount(data.chapters) || (data.totalChapters ? String(data.totalChapters) : null),
                            status: unmappedData.status || data.status || "Unknown",
                            season: unmappedData.season || null,
                            year: unmappedData.year ? parseInt(unmappedData.year, 10) : data.year ? parseInt(data.year, 10) : null
                          },
                          { timeout: 5e3 }
                        ).catch(() => {
                        });
                      } catch (_) {
                      }
                    }
                  },
                  deleteUnmapped: async (itemId) => {
                    if (!global.mappingDb) return;
                    try {
                      await global.mappingDb.prepare(
                        "DELETE FROM unmapped_items WHERE (provider = ? OR provider = ? OR provider = ?) AND (id = ? OR id = ?)"
                      ).run(
                        targetProvider,
                        cleanProv,
                        provName,
                        String(itemId || id),
                        String(itemId || id)
                      );
                    } catch (_) {
                    }
                  }
                };
                await Mangaprovider.provider.onInfoFetched({
                  id,
                  info: MangaInfoData,
                  api: safeMangaApi
                });
              } catch (extErr) {
                logger.error(
                  `[onInfoFetched] Manga provider hook error: ${extErr.message}`
                );
              }
            }
          } else if (AnimeManga === "Movies") {
            let Moviesprovider = null;
            try {
              Moviesprovider = await providerFetch(
                "Movies",
                (LocalMalProvider !== "local" && LocalMalProvider !== "provider" && LocalMalProvider !== "mal" ? LocalMalProvider : provider) ?? null
              );
            } catch (_) {
              Moviesprovider = null;
            }
            let MovieInfoData = null;
            if (Moviesprovider?.provider) {
              try {
                MovieInfoData = await movieInfo(
                  Moviesprovider,
                  setting?.CustomDownloadLocationMovies,
                  id
                );
              } catch (_) {
              }
            }
            if (!MovieInfoData) {
              const strId = String(id || "");
              if (strId.startsWith("tv:") || !strId.startsWith("movie:") && !isNaN(Number(strId))) {
                const numericTvId = strId.replace(/^tv:/, "");
                try {
                  const tvRes = await axios.get(
                    `https://api.tvmaze.com/shows/${numericTvId}?embed[]=episodes&embed[]=cast`,
                    { timeout: 4500 }
                  );
                  if (tvRes.data) {
                    const show = tvRes.data;
                    const epList = (show._embedded?.episodes || []).map((ep) => ({
                      id: `tv:${show.id}:${ep.season || 1}:${ep.number || 1}`,
                      number: ep.number || 1,
                      season: ep.season || 1,
                      title: ep.name || `Episode ${ep.number || 1}`,
                      overview: ep.summary ? ep.summary.replace(/<[^>]+>/g, "") : "",
                      image: ep.image?.medium || ep.image?.original || show.image?.original || null,
                      aired: ep.airdate || null
                    }));
                    const castList = (show._embedded?.cast || []).map((c) => ({
                      id: `tvmaze:${c.person?.id}`,
                      name: c.person?.name || "Unknown Actor",
                      character: c.character?.name || null,
                      image: c.person?.image?.medium || c.person?.image?.original || null,
                      role: "Acting"
                    }));
                    MovieInfoData = {
                      id: strId,
                      title: show.name,
                      description: show.summary ? show.summary.replace(/<[^>]+>/g, "") : "",
                      image: show.image?.original || show.image?.medium || "/images/image-404.png",
                      image_url: show.image?.original || show.image?.medium || "/images/image-404.png",
                      genres: Array.isArray(show.genres) ? show.genres : [],
                      status: show.status || "Ended",
                      aired: show.premiered || null,
                      released: show.premiered || null,
                      rating: show.rating?.average || null,
                      episodes: epList,
                      totalEpisodes: epList.length,
                      cast: castList,
                      type: "Movies",
                      mediaType: "tv"
                    };
                  }
                } catch (_) {
                }
              }
              if (!MovieInfoData) {
                const cleanTitle = strId.replace(/^(movie|tv|wiki|featured):/, "").trim();
                const tmdbKey = process.env.TMDB_API_KEY || await settingfetch("tmdb_api_key");
                if (tmdbKey && !isNaN(Number(cleanTitle))) {
                  try {
                    const tmdbRes = await axios.get(
                      `https://api.themoviedb.org/3/movie/${cleanTitle}?api_key=${tmdbKey}&append_to_response=credits`,
                      { timeout: 3500 }
                    );
                    if (tmdbRes.data) {
                      const m = tmdbRes.data;
                      const castList = (m.credits?.cast || []).slice(0, 24).map((c) => ({
                        id: `tmdb:${c.id}`,
                        name: c.name || c.original_name,
                        character: c.character || null,
                        image: c.profile_path ? `https://image.tmdb.org/t/p/w200${c.profile_path}` : null,
                        role: c.known_for_department || "Acting"
                      }));
                      MovieInfoData = {
                        id: strId,
                        title: m.title || m.original_title,
                        description: m.overview || "",
                        image: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : "/images/image-404.png",
                        image_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : "/images/image-404.png",
                        genres: (m.genres || []).map((g) => g.name),
                        status: m.status || "Released",
                        aired: m.release_date || null,
                        rating: m.vote_average ? Number(m.vote_average.toFixed(1)) : null,
                        episodes: [{ id: `${strId}:1`, number: 1, season: 1, title: m.title || "Full Movie" }],
                        totalEpisodes: 1,
                        cast: castList,
                        type: "Movies",
                        mediaType: "movie"
                      };
                    }
                  } catch (_) {
                  }
                }
                if (!MovieInfoData && cleanTitle) {
                  try {
                    const tvSearchRes = await axios.get(
                      `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(cleanTitle)}&embed[]=episodes&embed[]=cast`,
                      { timeout: 3500 }
                    );
                    if (tvSearchRes.data) {
                      const show = tvSearchRes.data;
                      const epList = (show._embedded?.episodes || []).map((ep) => ({
                        id: `tv:${show.id}:${ep.season || 1}:${ep.number || 1}`,
                        number: ep.number || 1,
                        season: ep.season || 1,
                        title: ep.name || `Episode ${ep.number || 1}`,
                        overview: ep.summary ? ep.summary.replace(/<[^>]+>/g, "") : "",
                        image: ep.image?.medium || ep.image?.original || show.image?.original || null,
                        aired: ep.airdate || null
                      }));
                      const castList = (show._embedded?.cast || []).map((c) => ({
                        id: `tvmaze:${c.person?.id}`,
                        name: c.person?.name || "Unknown Actor",
                        character: c.character?.name || null,
                        image: c.person?.image?.medium || c.person?.image?.original || null,
                        role: "Acting"
                      }));
                      MovieInfoData = {
                        id: strId,
                        title: show.name,
                        description: show.summary ? show.summary.replace(/<[^>]+>/g, "") : "",
                        image: show.image?.original || show.image?.medium || "/images/image-404.png",
                        image_url: show.image?.original || show.image?.medium || "/images/image-404.png",
                        genres: Array.isArray(show.genres) ? show.genres : [],
                        status: show.status || "Ended",
                        aired: show.premiered || null,
                        released: show.premiered || null,
                        rating: show.rating?.average || null,
                        episodes: epList.length > 0 ? epList : [{ id: `${strId}:1`, number: 1, season: 1, title: show.name }],
                        totalEpisodes: epList.length || 1,
                        cast: castList,
                        type: "Movies",
                        mediaType: "tv"
                      };
                    }
                  } catch (_) {
                  }
                }
                if (!MovieInfoData) {
                  const fallbackName = cleanTitle || "Movie / Series";
                  MovieInfoData = {
                    id: strId,
                    title: fallbackName,
                    description: `Watch and stream ${fallbackName}.`,
                    image: "/images/image-404.png",
                    image_url: "/images/image-404.png",
                    genres: ["Movies & TV"],
                    status: "Available",
                    aired: "Streaming",
                    episodes: [{ id: `${strId}:1`, number: 1, season: 1, title: fallbackName }],
                    totalEpisodes: 1,
                    cast: [],
                    type: "Movies",
                    mediaType: "movie"
                  };
                }
              }
            }
            if (MovieInfoData) {
              if (!Array.isArray(MovieInfoData.cast) || MovieInfoData.cast.length === 0) {
                const searchTitle = MovieInfoData.title || "";
                if (searchTitle) {
                  try {
                    const tvCastRes = await axios.get(
                      `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(searchTitle)}&embed[]=cast`,
                      { timeout: 3e3 }
                    );
                    if (tvCastRes.data?._embedded?.cast?.length > 0) {
                      MovieInfoData.cast = tvCastRes.data._embedded.cast.slice(0, 24).map((c) => ({
                        id: `tvmaze:${c.person?.id}`,
                        name: c.person?.name || "Unknown Actor",
                        character: c.character?.name || null,
                        image: c.person?.image?.medium || c.person?.image?.original || null,
                        role: "Acting"
                      }));
                    }
                  } catch (_) {
                  }
                }
              }
              if (Array.isArray(MovieInfoData.cast)) {
                MovieInfoData.cast = MovieInfoData.cast.map((c, idx) => {
                  if (typeof c === "string") {
                    return {
                      id: `person:${encodeURIComponent(c)}`,
                      name: c,
                      character: null,
                      image: null,
                      role: "Acting"
                    };
                  }
                  return {
                    id: c.id || `person:${encodeURIComponent(c.name || `actor-${idx}`)}`,
                    name: c.name || "Actor",
                    character: c.character || c.role || null,
                    image: c.image || c.profile || c.avatar || null,
                    role: c.role || "Acting"
                  };
                });
              }
              Object.assign(data, MovieInfoData);
              try {
                let seasonCounts = null;
                if (Array.isArray(MovieInfoData.episodes) && MovieInfoData.episodes.length > 0) {
                  seasonCounts = {};
                  for (const ep of MovieInfoData.episodes) {
                    const s = ep.season !== void 0 && ep.season !== null ? Number(ep.season) : 1;
                    const epNum = Number(ep.number || ep.episode || 1);
                    if (!seasonCounts[s] || epNum > seasonCounts[s]) {
                      seasonCounts[s] = epNum;
                    }
                  }
                }
                if (global.db) {
                  await global.db.prepare(
                    `INSERT OR REPLACE INTO Movies (id, title, description, status, genres, aired, image_url, provider, episodes_json, last_updated)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
                  ).run(
                    id,
                    MovieInfoData.title || id,
                    MovieInfoData.description || "",
                    MovieInfoData.status || "",
                    Array.isArray(MovieInfoData.genres) ? MovieInfoData.genres.join(",") : MovieInfoData.genres || "",
                    MovieInfoData.aired || MovieInfoData.released || "",
                    MovieInfoData.image_url || MovieInfoData.image || "",
                    Moviesprovider?.provider_name || "provider",
                    seasonCounts ? JSON.stringify(seasonCounts) : null
                  );
                }
              } catch (dbErr) {
                logger.error(
                  `Failed to update local metadata for Movies ${id}: ${dbErr.message}`
                );
              }
            }
            data.provider = Moviesprovider?.provider_name || "provider";
          }
        } catch (err) {
          if (data && data.id) {
            logger.warn(
              `Failed to fetch online metadata for ${id} (using cached local data): ${err.message}`
            );
          } else {
            throw err;
          }
        }
      }
      if (AnimeManga === "Movies" && data) {
        data.malid = null;
        delete data.MalID;
      }
      if (AnimeManga !== "Movies" && data && global.mappingDb) {
        try {
          const customMappingRow = await global.db.prepare("SELECT malid FROM unlinked_mal_ids WHERE id = ?").get(id);
          let resolvedMalId = void 0;
          let isCustom = false;
          if (customMappingRow) {
            isCustom = true;
            if (customMappingRow.malid) {
              resolvedMalId = parseInt(customMappingRow.malid);
            } else {
              resolvedMalId = null;
            }
          } else if (data.malid) {
            resolvedMalId = parseInt(data.malid);
          }
          if (resolvedMalId !== void 0) {
            if (resolvedMalId !== null) {
              data.malid = resolvedMalId;
              if (isCustom) {
                try {
                  await global.db.prepare(`UPDATE ${AnimeManga} SET MalID = ? WHERE id = ?`).run(String(resolvedMalId), id);
                } catch (_) {
                }
              }
            } else {
              data.malid = null;
              if (isCustom) {
                try {
                  await global.db.prepare(
                    `UPDATE ${AnimeManga} SET MalID = NULL WHERE id = ?`
                  ).run(id);
                } catch (_) {
                }
              }
            }
          } else {
            if (!data.malid && global.mappingDb && id) {
              const foundMalId = await resolveMalIdFromMapping({
                id,
                mediaType: AnimeManga,
                installedOnly: true
              });
              if (foundMalId) {
                data.malid = foundMalId;
                try {
                  await global.db.prepare(`UPDATE ${AnimeManga} SET MalID = ? WHERE id = ?`).run(String(data.malid), id);
                } catch (_) {
                }
              }
            }
          }
          if (data.malid) {
            if (global.mappingDb) {
              try {
                const prov = data.provider || LocalMalProvider || "";
                const clean = (prov || "").toLowerCase().split("/").pop();
                global.mappingDb.prepare(
                  "DELETE FROM unmapped_items WHERE (provider = ? OR provider = ? OR provider LIKE ?) AND (id = ? OR id = ?)"
                ).run(
                  clean,
                  prov,
                  `%/${clean}`,
                  String(id),
                  String(data.id || id)
                );
              } catch (_) {
              }
            }
            try {
              const linkedRecords = await global.db.prepare(
                `SELECT id, provider, title, folder_name FROM ${AnimeManga} WHERE MalID = ?`
              ).all(String(data.malid));
              const linkedProvidersMap = {};
              linkedRecords.forEach((r) => {
                linkedProvidersMap[r.provider] = {
                  id: r.id,
                  provider: r.provider,
                  title: r.title,
                  folder_name: r.folder_name
                };
              });
              const mappedLinked = await getLinkedProvidersForMalId(
                data.malid,
                AnimeManga,
                {
                  currentProvider: data.provider,
                  currentId: data.id || id,
                  title: data.title || "",
                  installedOnly: true
                }
              );
              mappedLinked.forEach((p) => {
                if (!linkedProvidersMap[p.provider]) {
                  linkedProvidersMap[p.provider] = p;
                }
              });
              if (data.provider && !linkedProvidersMap[data.provider] && data.provider !== "provider" && data.provider !== "local source") {
                linkedProvidersMap[data.provider] = {
                  id: data.id || id,
                  provider: data.provider,
                  title: data.title || "",
                  folder_name: data.folder_name || null
                };
              }
              data.linkedProviders = Object.values(linkedProvidersMap);
              if ((!data.provider || data.provider === "local source") && data.linkedProviders.length > 0) {
                const activep = data.linkedProviders.find(
                  (p) => p.provider && p.provider !== "local source"
                ) || data.linkedProviders[0];
                if (activep) {
                  data.provider = activep.provider;
                  data.id = activep.id;
                }
              }
            } catch (e) {
            }
            if (AnimeManga === "Anime") {
              try {
                let livechartId = null;
                if (global.mappingDb) {
                  try {
                    const lcRow = await global.mappingDb.prepare(
                      "SELECT livechart_id FROM anime WHERE malid = ? LIMIT 1"
                    ).get(data.malid);
                    if (lcRow?.livechart_id) {
                      livechartId = lcRow.livechart_id;
                    }
                  } catch (_) {
                  }
                }
                if (livechartId) {
                  const now = Math.floor(Date.now() / 1e3);
                  let watchedEpisodes = 0;
                  try {
                    const watchedRow = await global.db.prepare(
                      "SELECT MAX(episode_number) AS watched_episodes FROM WatchHistory WHERE anime_id = ?"
                    ).get(id);
                    if (watchedRow && watchedRow.watched_episodes) {
                      watchedEpisodes = watchedRow.watched_episodes;
                    }
                  } catch (_) {
                  }
                  const localToday = /* @__PURE__ */ new Date();
                  const localTodayStart = new Date(
                    localToday.getFullYear(),
                    localToday.getMonth(),
                    localToday.getDate(),
                    0,
                    0,
                    0
                  ).getTime() / 1e3;
                  const localYesterdayStart = localTodayStart - 24 * 3600;
                  const airedEp = await global.mappingDb.prepare(
                    `
                    SELECT episode, date FROM next_episodes 
                    WHERE livechart_id = ? AND date <= ? 
                    ORDER BY date DESC LIMIT 1
                  `
                  ).get(livechartId, now);
                  const upcomingEp = await global.mappingDb.prepare(
                    `
                    SELECT episode, date FROM next_episodes 
                    WHERE livechart_id = ? AND date > ? 
                    ORDER BY date ASC LIMIT 1
                  `
                  ).get(livechartId, now);
                  let nextEp = upcomingEp;
                  let showAired = false;
                  if (airedEp && airedEp.date >= localYesterdayStart && watchedEpisodes < airedEp.episode) {
                    nextEp = airedEp;
                    showAired = true;
                  }
                  if (nextEp) {
                    if (showAired) {
                      data.nextEpisodeIn = `Ep ${nextEp.episode}: Aired`;
                    } else {
                      const diff = nextEp.date - now;
                      const minutes = Math.ceil(diff / 60);
                      const hours = Math.ceil(diff / 3600);
                      const days = Math.ceil(diff / (24 * 3600));
                      if (days > 0) {
                        data.nextEpisodeIn = `Ep ${nextEp.episode}: ${days} day${days > 1 ? "s" : ""}`;
                      } else if (hours > 0) {
                        data.nextEpisodeIn = `Ep ${nextEp.episode}: ${hours} hr${hours > 1 ? "s" : ""}`;
                      } else if (minutes > 0) {
                        data.nextEpisodeIn = `Ep ${nextEp.episode}: ${minutes} min${minutes > 1 ? "s" : ""}`;
                      } else {
                        data.nextEpisodeIn = `Ep ${nextEp.episode}: soon`;
                      }
                    }
                  }
                }
              } catch (_) {
              }
            }
          }
          if (!data.malid && !customMappingRow && global.mappingDb && id) {
            try {
              const prov = data.provider || LocalMalProvider || "";
              const clean = (prov || "").toLowerCase().split("/").pop();
              const targetProvider = prov && (prov.startsWith("@") || prov.includes("/")) ? prov.toLowerCase().startsWith("theyogmehta/") ? clean : prov.startsWith("@") ? prov.trim() : `@${prov.trim()}` : clean;
              const reportTitle = (data.title || data.name || "").trim();
              if (reportTitle && reportTitle.toLowerCase() !== "unknown") {
                global.mappingDb.prepare(
                  `INSERT OR REPLACE INTO unmapped_items (
                      id, provider, media_type, name, image_url, type, episodes, status, season, year, last_fetched
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
                ).run(
                  String(id),
                  targetProvider,
                  AnimeManga,
                  reportTitle,
                  data.image_url || data.image || null,
                  data.type || (AnimeManga === "Anime" ? "TV" : "Manga"),
                  cleanEpCount(data.episodes) || cleanEpCount(data.chapters) || (data.totalEpisodes ? String(data.totalEpisodes) : null) || (data.totalChapters ? String(data.totalChapters) : null),
                  data.status || "Unknown",
                  data.season || null,
                  data.year ? parseInt(data.year, 10) : null
                );
                const axiosClient = global.axios || require("axios");
                axiosClient.post(
                  "https://strawverse.theyogmehta.online/api/unmapped/report",
                  {
                    id: String(id),
                    provider: targetProvider,
                    media_type: AnimeManga,
                    name: reportTitle,
                    image_url: data.image_url || data.image || null,
                    type: data.type || (AnimeManga === "Anime" ? "TV" : "Manga"),
                    episodes: cleanEpCount(data.episodes) || cleanEpCount(data.chapters) || (data.totalEpisodes ? String(data.totalEpisodes) : null) || (data.totalChapters ? String(data.totalChapters) : null),
                    status: data.status || "Unknown",
                    season: data.season || null,
                    year: data.year ? parseInt(data.year, 10) : null
                  },
                  { timeout: 5e3 }
                ).catch(() => {
                });
              }
            } catch (_) {
            }
          }
        } catch (mappingErr) {
          logger.error(`Error querying mappingDb: ${mappingErr.message}`);
        }
      }
      if (AnimeManga !== "Movies" && data.malid && global.MalLoggedIn) {
        try {
          if (AnimeManga === "Anime") {
            const MalInfo = await global.db.prepare("SELECT * FROM MyAnimeList WHERE id = ?").get(String(data.malid));
            if (MalInfo) {
              data.watched = MalInfo.watched ?? 0;
              data.malStatus = MalInfo.status ?? "watching";
              if (MalInfo.totalEpisodes > 0) {
                data.totalEpisodes = MalInfo.totalEpisodes;
              }
            }
          } else if (AnimeManga === "Manga") {
            const MalInfo = await global.db.prepare("SELECT * FROM MyMangaList WHERE id = ?").get(String(data.malid));
            if (MalInfo) {
              data.watched = MalInfo.read ?? 0;
              data.malStatus = MalInfo.status ?? "plan_to_read";
              if (MalInfo.totalChapters > 0) {
                data.totalChapters = MalInfo.totalChapters;
              }
            }
          }
        } catch (malDbErr) {
          logger.error(
            `Failed to load MAL list stats for resolved malid ${data.malid}: ${malDbErr.message}`
          );
        }
      }
      try {
        let tagRow = null;
        if (AnimeManga === "Anime") {
          tagRow = await global.db.prepare(
            `SELECT CustomTag FROM Anime WHERE id = ? OR folder_name = ?`
          ).get(id, id);
        } else if (AnimeManga === "Movies") {
          tagRow = await global.db.prepare(
            `SELECT CustomTag FROM Movies WHERE id = ? OR folder_name = ?`
          ).get(id, id);
        } else {
          tagRow = await global.db.prepare(
            `SELECT CustomTag FROM Manga WHERE id = ? OR folder_name = ?`
          ).get(id, id);
        }
        const targetMalId = AnimeManga !== "Movies" ? data?.malid : null;
        if (!tagRow?.CustomTag && targetMalId) {
          const malTable = AnimeManga === "Manga" ? "Manga" : "Anime";
          const malRow = await global.db.prepare(
            `SELECT CustomTag FROM ${malTable} WHERE MalID = ? AND CustomTag IS NOT NULL AND CustomTag != ''`
          ).get(String(targetMalId));
          if (malRow && malRow.CustomTag) {
            tagRow = malRow;
          }
        }
        if (tagRow && tagRow.CustomTag) {
          data.CustomTag = tagRow.CustomTag;
        }
      } catch (tagDbErr) {
        logger.error(`Failed to load CustomTag for ${id}: ${tagDbErr.message}`);
      }
      if (data) {
        data.scraper_image = data.image || null;
        if (AnimeManga !== "Movies" && data.malid) {
          try {
            let remoteImg = null;
            if (global.mappingDb && AnimeManga === "Anime") {
              const imgRow = await global.mappingDb.prepare("SELECT image_url FROM anime WHERE malid = ?").get(Number(data.malid));
              if (imgRow && imgRow.image_url) {
                remoteImg = imgRow.image_url;
              }
            }
            if (!remoteImg) {
              const listTable = AnimeManga === "Anime" ? "MyAnimeList" : "MyMangaList";
              const malRow = await global.db.prepare(
                `SELECT image, main_picture FROM ${listTable} WHERE id = ?`
              ).get(String(data.malid));
              if (malRow) {
                remoteImg = malRow.image || malRow.main_picture;
              }
            }
            if (remoteImg) {
              data.image_url = remoteImg;
              data.image = remoteImg;
              try {
                await global.db.prepare(
                  `UPDATE ${AnimeManga} SET image_url = ? WHERE id = ?`
                ).run(remoteImg, id);
              } catch (_) {
              }
            }
          } catch (_) {
          }
          const isCjkTitle = (t) => t && !/[a-zA-Z]/.test(t);
          if (!data.title || data.title.startsWith("MAL ") || isCjkTitle(data.title)) {
            try {
              const titleRes = await fetch(
                `https://strawverse.theyogmehta.online/api/title/${AnimeManga}/${data.malid}`
              );
              if (titleRes.ok) {
                const tData = await titleRes.json();
                if (tData && tData.title) {
                  data.title = tData.title;
                  try {
                    await global.db.prepare(
                      `UPDATE ${AnimeManga} SET title = ? WHERE id = ?`
                    ).run(data.title, id);
                  } catch (_) {
                  }
                }
              }
            } catch (_) {
            }
          }
        }
      }
      if (AnimeManga === "Movies" && (!Array.isArray(data.DownloadedEpisodes) || data.DownloadedEpisodes.length === 0 || !data.DownloadedEpisodes.some(
        (x) => typeof x === "string" && x.startsWith("s")
      ))) {
        try {
          const cfg = await settingfetch();
          const baseDir = AnimeManga === "Movies" ? cfg?.CustomDownloadLocationMovies || await getDownloadsFolder() : cfg?.CustomDownloadLocationAnime || await getDownloadsFolder();
          const candidates = [];
          if (data.folder_name) {
            const cleanFolder = String(data.folder_name).replace(/[/\\]Season\s*\d+.*$/i, "").trim();
            if (cleanFolder && cleanFolder !== data.folder_name)
              candidates.push(cleanFolder);
            candidates.push(data.folder_name);
          }
          if (data.title) candidates.push(sanitizeFolderName(data.title));
          if (data.id) {
            candidates.push(String(data.id));
            candidates.push(sanitizeFolderName(String(data.id)));
          }
          if (id) {
            candidates.push(String(id));
            candidates.push(sanitizeFolderName(String(id)));
          }
          let matchedFolderPath = null;
          for (const cand of candidates) {
            if (!cand) continue;
            let fp = path.join(baseDir, AnimeManga, cand);
            if (AnimeManga === "Movies" && !fs.existsSync(fp) && fs.existsSync(path.join(baseDir, "MoviesSeries", cand))) {
              fp = path.join(baseDir, "MoviesSeries", cand);
            }
            if (!fs.existsSync(fp) && fs.existsSync(path.join(baseDir, cand))) {
              fp = path.join(baseDir, cand);
            }
            if (fs.existsSync(fp)) {
              matchedFolderPath = fp;
              break;
            }
          }
          if (matchedFolderPath) {
            const filesAndFolders = await fs.promises.readdir(
              matchedFolderPath,
              { withFileTypes: true }
            );
            const scanned = [];
            for (const f of filesAndFolders) {
              if (f.isFile() && isVideoFile(f.name) && !f.name.startsWith(".") && !f.name.includes(".temp")) {
                const sMatch = f.name.match(
                  /\bS(\d{1,3})E(?:p)?(\d+(?:\.\d+)?)/i
                );
                if (sMatch) {
                  scanned.push(
                    `s${parseInt(sMatch[1], 10)}_e${parseFloat(sMatch[2])}`
                  );
                } else {
                  const num = getEpisodeNumberFromFilename(f.name);
                  if (num !== null && !isNaN(num)) scanned.push(num);
                }
              }
            }
            const seasonDirs = filesAndFolders.filter(
              (f) => f.isDirectory() && SEASON_FOLDER_RE.test(f.name)
            );
            for (const sDir of seasonDirs) {
              try {
                const sMatch = sDir.name.match(/\d+/);
                const seasonNum = sMatch ? parseInt(sMatch[0], 10) : 1;
                const sDirPath = path.join(matchedFolderPath, sDir.name);
                const sFiles = await fs.promises.readdir(sDirPath, {
                  withFileTypes: true
                });
                for (const sf of sFiles) {
                  if (sf.isFile() && isVideoFile(sf.name) && !sf.name.startsWith(".") && !sf.name.includes(".temp")) {
                    const epNum = getEpisodeNumberFromFilename(sf.name);
                    if (epNum !== null && !isNaN(epNum)) {
                      scanned.push(`s${seasonNum}_e${epNum}`);
                    }
                  }
                }
              } catch (_) {
              }
            }
            if (scanned.length === 0 && filesAndFolders.some(
              (f) => f.isFile() && isVideoFile(f.name) && !f.name.startsWith(".") && !f.name.includes(".temp")
            )) {
              scanned.push(1);
            }
            if (scanned.length > 0) {
              data.DownloadedEpisodes = Array.from(new Set(scanned));
            }
          }
        } catch (_) {
        }
      }
      if ((!Array.isArray(data.DownloadedEpisodes) || data.DownloadedEpisodes.length === 0) && (AnimeManga === "Anime" || AnimeManga === "Movies")) {
        try {
          const dlCheck = await FindMapping(
            AnimeManga,
            data.id || id,
            data.malid || null,
            AnimeManga === "Anime" ? setting?.CustomDownloadLocationAnime : setting?.CustomDownloadLocationMovies
          );
          if (dlCheck && Array.isArray(dlCheck.DownloadedEpisodes) && dlCheck.DownloadedEpisodes.length > 0) {
            data.DownloadedEpisodes = dlCheck.DownloadedEpisodes;
          }
        } catch (_) {
        }
      } else if ((!Array.isArray(data.DownloadedChapters) || data.DownloadedChapters.length === 0) && AnimeManga === "Manga") {
        try {
          const dlCheck = await FindMapping(
            AnimeManga,
            data.id || id,
            data.malid || null,
            setting?.CustomDownloadLocationManga
          );
          if (dlCheck && Array.isArray(dlCheck.DownloadedChapters) && dlCheck.DownloadedChapters.length > 0) {
            data.DownloadedChapters = dlCheck.DownloadedChapters;
          }
        } catch (_) {
        }
      }
      if (!data?.id) throw new Error(`No ${AnimeManga} Found with id '${id}'`);
      return res.json(data);
    } catch (err) {
      logger.error(
        `Failed To Fetch ${LocalMalProvider} ${AnimeManga} with AnimeID : '${id}'`
      );
      logger.error(`Error message: ${err.message}`);
      logger.error(`Stack trace: ${err.stack}`);
      let localTag = data?.CustomTag || "";
      if (!localTag) {
        try {
          const validTable = AnimeManga === "Movies" ? "Movies" : AnimeManga === "Manga" ? "Manga" : "Anime";
          const row = await global.db.prepare(`SELECT CustomTag FROM ${validTable} WHERE id = ?`).get(id);
          if (row) localTag = row.CustomTag || "";
        } catch (_) {
        }
      }
      return res.json({
        error: true,
        message: err?.message,
        CustomTag: localTag
      });
    }
  }
);
router.post("/api/info/items", async (req, res) => {
  let { id, page, provider, type } = req.body;
  page = parseInt(page ?? 1);
  const isVideo = type === "Anime" || type === "Movies";
  const isAnime = type === "Anime";
  const fetchFunction = type === "Movies" ? async (providerObj, itemId) => {
    const info = await movieInfo(providerObj, null, itemId);
    return { episodes: info?.episodes || [] };
  } : isAnime ? fetchEpisode : fetchChapters;
  const errorName = isVideo ? "Episodes" : "Chapters";
  if (global.db && id) {
    try {
      const table = type === "Movies" ? "Movies" : isAnime ? "Anime" : "Manga";
      const exists = await global.db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id);
      if (!exists) {
        const histTable = type === "Movies" ? "SeriesMovieWatchHistory" : isAnime ? "WatchHistory" : "ReadHistory";
        const idCol = type === "Movies" ? "movie_id" : isAnime ? "anime_id" : "manga_id";
        const titleCol = type === "Movies" ? "title" : isAnime ? "anime_title" : "manga_title";
        const hist = await global.db.prepare(
          `SELECT ${titleCol} FROM ${histTable} WHERE ${idCol} = ? LIMIT 1`
        ).get(id);
        if (hist && hist[titleCol]) {
          const actual = await global.db.prepare(
            `SELECT id FROM ${table} WHERE LOWER(title) = LOWER(?) LIMIT 1`
          ).get(hist[titleCol]);
          if (actual && actual.id) id = actual.id;
        }
      }
    } catch (_) {
    }
  }
  try {
    if (isNaN(page)) throw new Error(`invalid Page '${page}'`);
    if (!id) throw new Error("ID is Missing");
    if (provider !== "local source") {
      const providerObj = await providerFetch(type, provider ?? null);
      let data = null;
      try {
        data = await fetchFunction(providerObj, id, page);
        if (isAnime && typeof providerObj?.healId === "function" && page === 1 && (!data?.episodes || data.episodes.length === 0)) {
          const emptyErr = new Error(
            `${providerObj.name || "Provider"} returned 404 or empty episodes`
          );
          emptyErr.status = 404;
          throw emptyErr;
        }
      } catch (fetchErr) {
        if (isAnime && typeof providerObj?.healId === "function" && (fetchErr?.response?.status === 404 || fetchErr?.status === 404 || fetchErr?.message?.includes("404"))) {
          let animeTitle = null;
          let animeFolderName = null;
          let animeMalId = null;
          if (global.db) {
            try {
              const aRow = await global.db.prepare(
                "SELECT title, folder_name, MalID FROM Anime WHERE id = ? OR id LIKE ?"
              ).get(id, `${id}-%`);
              if (aRow) {
                animeTitle = aRow.title;
                animeFolderName = aRow.folder_name;
                animeMalId = aRow.MalID;
              }
            } catch (_) {
            }
          }
          if (!animeTitle && global.db) {
            try {
              const whRow = await global.db.prepare(
                "SELECT anime_title FROM WatchHistory WHERE anime_id = ? OR anime_id LIKE ? LIMIT 1"
              ).get(id, `${id}-%`);
              if (whRow?.anime_title) {
                animeTitle = whRow.anime_title;
              }
            } catch (_) {
            }
          }
          const healedId = await healProviderId(providerObj, {
            oldId: id,
            title: animeTitle,
            folderName: animeFolderName,
            malid: animeMalId
          });
          if (healedId) {
            logger.info(
              `[api/info/items] Retrying episode fetch with healed id: ${id} -> ${healedId}`
            );
            data = await fetchFunction(providerObj, healedId, page);
          } else {
            throw fetchErr;
          }
        } else {
          throw fetchErr;
        }
      }
      if (!data) throw new Error(`No ${errorName} Found`);
      if (data.hasNextPage === void 0 && data.totalPages !== void 0) {
        data.hasNextPage = page < data.totalPages;
      }
      try {
        const setting = await settingfetch();
        const dlCheck = await FindMapping(
          type,
          id,
          null,
          type === "Anime" ? setting?.CustomDownloadLocationAnime : type === "Movies" ? setting?.CustomDownloadLocationMovies : setting?.CustomDownloadLocationManga
        );
        if (isAnime && dlCheck && Array.isArray(dlCheck.DownloadedEpisodes)) {
          data.DownloadedEpisodes = dlCheck.DownloadedEpisodes;
        } else if (!isAnime && dlCheck && Array.isArray(dlCheck.DownloadedChapters)) {
          data.DownloadedChapters = dlCheck.DownloadedChapters;
        }
      } catch (_) {
      }
      return res.json(data);
    } else {
      return res.json({});
    }
  } catch (err) {
    logger.error(`Error Fetching '${id}' ${errorName} page : ${page}:`);
    logger.error(`Error message: ${err.message}`);
    logger.error(`Stack trace: ${err.stack}`);
    return res.json({ error: true, message: err?.message });
  }
});
router.post("/api/watch", async (req, res) => {
  let { ep, epNum, Downloaded, provider = null, subdub, type } = req.body;
  try {
    if (!Downloaded) {
      if (!ep) throw new Error("Episode ID Not Found");
      const isMovieEp = typeof ep === "string" && (ep.startsWith("tv:") || ep.startsWith("movie:"));
      const isMovieProv = isMovieProvider(provider);
      const isMovie = type === "Movies" || isMovieEp || isMovieProv;
      const mediaType = isMovie ? "Movies" : type === "Manga" ? "Manga" : "Anime";
      const safeProvider = mediaType === "Movies" && !isMovieProv ? null : provider;
      const Animeprovider = await providerFetch(mediaType, safeProvider);
      let sourcesArray = mediaType === "Movies" ? await fetchMovieSources(Animeprovider, ep, subdub) : await fetchEpisodeSources(Animeprovider, ep, subdub);
      if (sourcesArray) {
        const prefSubDub = subdub || "sub";
        let rawSources = [];
        if (prefSubDub && Array.isArray(sourcesArray[prefSubDub]?.sources) && sourcesArray[prefSubDub].sources.length > 0) {
          rawSources = sourcesArray[prefSubDub].sources;
        } else if (prefSubDub && Array.isArray(sourcesArray[prefSubDub]) && sourcesArray[prefSubDub].length > 0) {
          rawSources = sourcesArray[prefSubDub];
        } else if (Array.isArray(sourcesArray.sources) && sourcesArray.sources.length > 0) {
          rawSources = sourcesArray.sources;
        } else {
          const subSrcs = Array.isArray(sourcesArray.sub?.sources) ? sourcesArray.sub.sources : Array.isArray(sourcesArray.sub) ? sourcesArray.sub : [];
          const dubSrcs = Array.isArray(sourcesArray.dub?.sources) ? sourcesArray.dub.sources : Array.isArray(sourcesArray.dub) ? sourcesArray.dub : [];
          const hsubSrcs = Array.isArray(sourcesArray.hsub?.sources) ? sourcesArray.hsub.sources : Array.isArray(sourcesArray.hsub) ? sourcesArray.hsub : [];
          rawSources = [...subSrcs, ...dubSrcs, ...hsubSrcs];
        }
        const isHSub = (s) => s.isHsub || s.type === "hsub" || s.quality?.toLowerCase().includes("hsub");
        const isDub = (s) => s.isDub || s.type === "dub" || s.quality?.toLowerCase().includes("dub");
        let mainSources = rawSources;
        if (prefSubDub === "sub") {
          const cleanSub = rawSources.filter((s) => !isHSub(s) && !isDub(s));
          if (cleanSub.length > 0) mainSources = cleanSub;
        } else if (prefSubDub === "hsub") {
          const cleanHsub = rawSources.filter((s) => isHSub(s));
          if (cleanHsub.length > 0) mainSources = cleanHsub;
        } else if (prefSubDub === "dub") {
          const cleanDub = rawSources.filter((s) => isDub(s));
          if (cleanDub.length > 0) mainSources = cleanDub;
        }
        const rawSubtitles = prefSubDub === "hsub" ? [] : Array.isArray(sourcesArray.subtitles) ? sourcesArray.subtitles : [];
        const formattedSubtitles = rawSubtitles.map((s) => {
          const label = s?.lang || s?.label || s?.name || "";
          return {
            ...s,
            lang: label,
            label
          };
        });
        sourcesArray = {
          ...sourcesArray,
          sources: mainSources,
          subtitles: formattedSubtitles
        };
      }
      res.status(200).json(sourcesArray || { sources: [] });
    } else {
      if (!epNum) throw new Error("Episode Number Not Found");
      if (!ep) throw new Error("Anime ID Not Found");
      const config = await settingfetch();
      let videoData = {
        sources: [],
        subtitles: [],
        intro: null
      };
      const mediaType = req.body.type === "Movies" ? "Movies" : "Anime";
      const downloadLocation = mediaType === "Movies" ? config?.CustomDownloadLocationMovies : config?.CustomDownloadLocationAnime;
      const SourcesData = await getSourceById(
        mediaType,
        downloadLocation,
        ep,
        epNum,
        subdub
      );
      if (SourcesData?.filepath) {
        videoData.sources.push({
          url: `/video?path=${encodeURIComponent(SourcesData?.filepath)}`,
          quality: "HD",
          server: "Local",
          provider: "Local"
        });
      }
      if (SourcesData?.subtitleFiles?.length > 0) {
        videoData.subtitles = SourcesData?.subtitleFiles;
      }
      if (SourcesData?.skipTimes) {
        videoData.skipTimes = SourcesData.skipTimes;
      }
      res.status(200).json(videoData);
    }
  } catch (err) {
    logger.error(`Error Fetching M3U8 Playlist`);
    logger.error(`Error message: ${err.message}`);
    logger.error(`Stack trace: ${err.stack}`);
    res.status(200).json({
      sources: []
    });
  }
});
router.post("/api/watch/server", async (req, res) => {
  let { provider = null, server, type } = req.body;
  try {
    if (!server) throw new Error("Server payload missing");
    const isMovieProv = isMovieProvider(provider);
    const mediaType = type === "Movies" || isMovieProv ? "Movies" : "Anime";
    const safeProvider = mediaType === "Movies" && !isMovieProv ? null : provider;
    const Animeprovider = await providerFetch(mediaType, safeProvider);
    const resolved = await processServer(Animeprovider, server);
    if (!resolved) {
      return res.json({ error: true, message: "Failed to resolve server" });
    }
    res.status(200).json(resolved);
  } catch (err) {
    logger.error(`Error resolving server stream: ${err.message}`);
    res.status(500).json({ error: true, message: err.message });
  }
});
const ALLOWED_SUBTITLE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".vtt",
  ".srt",
  ".ass",
  ".ssa",
  ".sub"
]);
const ALLOWED_VIDEO_EXTENSIONS = /* @__PURE__ */ new Set([
  ".mp4",
  ".mkv",
  ".webm",
  ".avi",
  ".mov",
  ".ts",
  ".m4v",
  ".flv"
]);
async function getAllowedMediaBases() {
  const allowedBases = /* @__PURE__ */ new Set();
  try {
    const userData = getUserDataPath();
    if (userData) {
      allowedBases.add(path.resolve(userData));
      try {
        allowedBases.add(fs.realpathSync(userData));
      } catch (_) {
      }
    }
  } catch (_) {
  }
  try {
    const dlFolder = getDownloadsFolder();
    if (dlFolder) {
      allowedBases.add(path.resolve(dlFolder));
      try {
        allowedBases.add(fs.realpathSync(dlFolder));
      } catch (_) {
      }
    }
  } catch (_) {
  }
  try {
    const config = await settingfetch();
    for (const loc of [
      config?.CustomDownloadLocationAnime,
      config?.CustomDownloadLocationManga,
      config?.CustomDownloadLocationMovies
    ]) {
      if (loc && typeof loc === "string") {
        allowedBases.add(path.resolve(loc));
        try {
          allowedBases.add(fs.realpathSync(loc));
        } catch (_) {
        }
      }
    }
  } catch (_) {
  }
  return Array.from(allowedBases);
}
function isPathInsideBases(targetPath, allowedBases) {
  return allowedBases.some(
    (base) => targetPath === base || targetPath.startsWith(base + path.sep)
  );
}
router.get("/video", async (req, res) => {
  try {
    let filePath = req.query.path;
    if (!filePath) return res.status(400).send("No file path provided");
    filePath = decodeURIComponent(filePath);
    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_VIDEO_EXTENSIONS.has(ext)) {
      return res.status(400).send("Invalid video file format");
    }
    let resolvedPath;
    try {
      resolvedPath = fs.realpathSync(path.resolve(filePath));
    } catch (_) {
      return res.status(404).send("File not found");
    }
    const allowedBases = await getAllowedMediaBases();
    if (!isPathInsideBases(resolvedPath, allowedBases)) {
      return res.status(403).send("Access denied");
    }
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).send("File not found");
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Accept-Ranges", "bytes");
    const stat = fs.statSync(resolvedPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const contentType = ext === ".ts" ? "video/mp2t" : "video/mp4";
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (start >= fileSize || end >= fileSize) {
        res.status(416).send("Requested range not satisfiable");
        return;
      }
      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(resolvedPath, { start, end });
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType
      });
      if (req.method === "HEAD") {
        return res.end();
      }
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": contentType,
        "Accept-Ranges": "bytes"
      });
      if (req.method === "HEAD") {
        return res.end();
      }
      fs.createReadStream(resolvedPath).pipe(res);
    }
  } catch (err) {
    console.error("Error streaming video:", err);
    res.status(500).send("Internal Server Error");
  }
});
router.get("/subtitles", async (req, res) => {
  try {
    let subtitlePath = req.query.file;
    if (!subtitlePath) {
      return res.status(400).json({ error: "Subtitle file path required" });
    }
    subtitlePath = decodeURIComponent(subtitlePath);
    const ext = path.extname(subtitlePath).toLowerCase();
    if (!ALLOWED_SUBTITLE_EXTENSIONS.has(ext)) {
      return res.status(400).json({ error: "Invalid subtitle file format" });
    }
    let resolvedPath;
    try {
      resolvedPath = fs.realpathSync(path.resolve(subtitlePath));
    } catch (_) {
      return res.status(404).json({ error: "Subtitle file not found" });
    }
    const allowedBases = await getAllowedMediaBases();
    if (!isPathInsideBases(resolvedPath, allowedBases)) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: "Subtitle file not found" });
    }
    const mimeType = ext === ".srt" ? "application/x-subrip" : "text/vtt";
    res.setHeader("Content-Type", mimeType);
    return res.sendFile(resolvedPath, { dotfiles: "deny" });
  } catch (err) {
    console.error("Error serving subtitle:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
router.post("/api/read", async (req, res) => {
  const { chapterID, Downloaded = false, MangaID, provider = null } = req.body;
  try {
    if (!chapterID) throw new Error("Chapter ID is missing");
    let isLocal = Downloaded === true || Downloaded === "true";
    let SourcesData = null;
    const config = await settingfetch();
    if (isLocal && MangaID) {
      try {
        SourcesData = await getSourceById(
          "Manga",
          config?.CustomDownloadLocationManga,
          MangaID,
          chapterID
        );
      } catch (e) {
      }
    }
    if (isLocal) {
      if (SourcesData?.filepath && fs.existsSync(SourcesData.filepath)) {
        const zipData = fs.readFileSync(SourcesData.filepath);
        const zip = await JSZip.loadAsync(zipData);
        const pages = await Promise.all(
          Object.keys(zip.files).filter((file) => file.match(/^\d+\./)).sort((a, b) => parseInt(a) - parseInt(b)).map(async (file) => ({
            page: parseInt(file),
            img: `data:image/jpeg;base64,${await zip.file(file).async("base64")}`
          }))
        );
        return res.json(pages);
      } else {
        throw new Error("Chapter Not Found In Downloads!");
      }
    } else {
      const providerObj = await providerFetch("Manga", provider);
      const chapters = await MangaChapterFetch(providerObj, chapterID);
      return res.status(200).json(chapters);
    }
  } catch (err) {
    logger.error(`Failed To Fetch Manga Chapters`);
    logger.error(`Error message: ${err.message}`);
    logger.error(`Stack trace: ${err.stack}`);
    res.status(200).json([]);
  }
});
const inFlightImageFetches = /* @__PURE__ */ new Map();
const failedImageUrls = /* @__PURE__ */ new Map();
const reportedBrokenImages = /* @__PURE__ */ new Set();
function get404PlaceholderPath() {
  const candidates = [
    path.join(__dirname, "../../gui/public/images/image-404.png"),
    path.join(__dirname, "../../gui/dist/images/image-404.png"),
    path.join(process.cwd(), "gui/public/images/image-404.png"),
    path.join(process.cwd(), "gui/dist/images/image-404.png")
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}
router.get("/api/image", async (req, res) => {
  let decodedUrl = "";
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) {
      return res.status(400).send("Missing image url");
    }
    decodedUrl = decodeURIComponent(imageUrl).trim();
    if (decodedUrl.startsWith("//")) {
      decodedUrl = "https:" + decodedUrl;
    }
    const failedTime = failedImageUrls.get(decodedUrl);
    if (failedTime && Date.now() - failedTime < 864e5) {
      const p404 = get404PlaceholderPath();
      if (p404) {
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.sendFile(p404);
      }
      return res.status(404).send("Image not found");
    }
    if (decodedUrl.startsWith("file://") || decodedUrl.startsWith("/")) {
      const filePath = decodedUrl.startsWith("file://") ? decodedUrl.slice(7) : decodedUrl;
      if (fs.existsSync(filePath)) {
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.sendFile(filePath, { dotfiles: "allow" });
      } else {
        return res.status(404).send("Local file not found");
      }
    }
    try {
      const cached = queryOne("SELECT filename FROM ImageCache WHERE url = ?", [
        decodedUrl
      ]);
      const cacheDir = ImageCacheManager.getImageCacheDir();
      if (cached && cached.filename && fs.existsSync(path.join(cacheDir, cached.filename))) {
        run("UPDATE ImageCache SET last_accessed = ? WHERE url = ?", [
          Date.now(),
          decodedUrl
        ]);
        let contentType2 = "image/jpeg";
        if (cached.filename.endsWith(".png")) contentType2 = "image/png";
        else if (cached.filename.endsWith(".gif")) contentType2 = "image/gif";
        else if (cached.filename.endsWith(".webp")) contentType2 = "image/webp";
        res.setHeader("Content-Type", contentType2);
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.sendFile(path.join(cacheDir, cached.filename), {
          dotfiles: "allow"
        });
      }
    } catch (cacheErr) {
      logger.error("Error reading from image cache: " + cacheErr.message);
    }
    async function fetchImageBuffer(url) {
      const resolvedHeaders = getHeaders(url);
      const options = {
        responseType: "arraybuffer",
        skipBypass: true,
        timeout: 12e3,
        headers: {
          ...resolvedHeaders,
          Accept: resolvedHeaders.Accept || "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
        }
      };
      try {
        const response = await global.axios.get(url, options);
        const buf = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
        const ct = response.headers["content-type"] || "image/jpeg";
        return { buffer: buf, contentType: ct };
      } catch (err) {
        const isCfChallenge = err?.response && (err.response.status === 403 || err.response.status === 503);
        if (isCfChallenge && global.scrapperFetchDataUrl) {
          try {
            const dataUrl = await global.scrapperFetchDataUrl(url);
            if (dataUrl && dataUrl.startsWith("data:")) {
              const matches = dataUrl.match(
                /^data:(image\/[a-zA-Z0-9+-]+);base64,(.+)$/
              );
              if (matches) {
                return {
                  contentType: matches[1],
                  buffer: Buffer.from(matches[2], "base64")
                };
              }
            }
          } catch (scrapperErr) {
            console.error(
              "scrapperFetchDataUrl failed for image:",
              scrapperErr.message
            );
          }
        }
        throw err;
      }
    }
    let fetchPromise = inFlightImageFetches.get(decodedUrl);
    if (!fetchPromise) {
      fetchPromise = fetchImageBuffer(decodedUrl).finally(() => {
        inFlightImageFetches.delete(decodedUrl);
      });
      inFlightImageFetches.set(decodedUrl, fetchPromise);
    }
    const { buffer: imageBuffer, contentType } = await fetchPromise;
    if (imageBuffer) {
      try {
        ImageCacheManager.cacheImage(decodedUrl, imageBuffer).catch(() => {
        });
      } catch (_) {
      }
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(imageBuffer);
    }
    res.status(500).send("Failed to load image");
  } catch (err) {
    const is404 = err?.response && (err.response.status === 404 || err.response.status === 410);
    if (is404) {
      failedImageUrls.set(decodedUrl, Date.now());
      if (decodedUrl.includes("myanimelist.net") && !reportedBrokenImages.has(decodedUrl)) {
        reportedBrokenImages.add(decodedUrl);
        let malid = req.query.malid ? parseInt(req.query.malid, 10) : null;
        let title = req.query.title ? String(req.query.title) : null;
        let mediaType = req.query.type;
        if (!mediaType) {
          if (decodedUrl.includes("/images/manga/") || decodedUrl.includes("/manga/")) {
            mediaType = "manga";
          } else if (decodedUrl.includes("/images/anime/") || decodedUrl.includes("/anime/")) {
            mediaType = "anime";
          } else {
            mediaType = "anime";
          }
        }
        if (!malid && global.mappingDb) {
          try {
            const aRow = global.mappingDb.prepare(
              "SELECT malid, title FROM anime WHERE image_url = ? LIMIT 1"
            ).get(decodedUrl);
            if (aRow) {
              malid = aRow.malid;
              title = title || aRow.title;
              mediaType = "anime";
            } else {
              const mRow = global.mappingDb.prepare(
                "SELECT malid, title FROM manga WHERE image_url = ? LIMIT 1"
              ).get(decodedUrl);
              if (mRow) {
                malid = mRow.malid;
                title = title || mRow.title;
                mediaType = "manga";
              }
            }
          } catch (_) {
          }
        }
        axios.post(
          "https://strawverse.theyogmehta.online/api/mal/broken-image",
          {
            malid,
            url: decodedUrl,
            title,
            type: mediaType
          },
          {
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "StrawVerse-Client"
            },
            timeout: 5e3
          }
        ).catch((rErr) => {
          logger.debug(`Failed to report broken MAL image: ${rErr.message}`);
        });
      }
      const p404 = get404PlaceholderPath();
      if (p404) {
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.sendFile(p404);
      }
    }
    console.error("Image proxy fetch failed:", err.message);
    res.status(500).send("Failed to load image");
  }
});
router.get("/api/stream/m3u8", async (req, res) => {
  const url = req.query.url;
  const customReferer = req.query.referer;
  if (!url) return res.status(400).send("No URL");
  try {
    if (customReferer && global.setDynamicReferer) {
      global.setDynamicReferer(url, customReferer);
    }
    const reqHeaders = getHeaders(url);
    if (customReferer) {
      reqHeaders.Referer = customReferer;
    }
    let data;
    try {
      const resp = await global.axios.get(url, {
        headers: reqHeaders,
        responseType: "text",
        timeout: 15e3
      });
      data = resp.data;
    } catch (fetchErr) {
      if (fetchErr.response && (fetchErr.response.status === 403 || fetchErr.response.status === 503) && global.cloudflarebypass) {
        const bypassTarget = customReferer || url;
        await global.cloudflarebypass(bypassTarget, true);
        const freshHeaders = getHeaders(url);
        if (customReferer) freshHeaders.Referer = customReferer;
        const retry = await global.axios.get(url, {
          headers: freshHeaders,
          responseType: "text",
          timeout: 15e3
        });
        data = retry.data;
      } else {
        throw fetchErr;
      }
    }
    if (typeof data !== "string" || !data.includes("#EXTM3U")) {
      logger.warn(
        `[Stream Proxy] Upstream returned invalid m3u8 playlist for ${url}`
      );
      return res.status(502).send("Upstream returned invalid playlist manifest");
    }
    const base = url.substring(0, url.lastIndexOf("/") + 1);
    const refParam = customReferer ? `&referer=${encodeURIComponent(customReferer)}` : "";
    const segProxy = `http://127.0.0.1:${global.PORT}/api/stream/segment.ts?url=`;
    const m3u8Proxy = `http://127.0.0.1:${global.PORT}/api/stream/m3u8?url=`;
    const regHost = (targetAbs) => {
      if (customReferer && global.setDynamicReferer && targetAbs.startsWith("http")) {
        try {
          global.setDynamicReferer(new URL(targetAbs).hostname, customReferer);
        } catch (_) {
        }
      }
    };
    let nextIsVariantPlaylist = false;
    const manifest = String(data).split("\n").map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith("#")) {
        if (t.startsWith("#EXT-X-STREAM-INF:")) {
          nextIsVariantPlaylist = true;
        }
        return t.includes('URI="') ? t.replace(/URI="([^"]+)"/, (_, u) => {
          const abs2 = u.startsWith("http") ? u : base + u;
          regHost(abs2);
          const isSubOrAudio = t.includes("TYPE=SUBTITLES") || t.includes("TYPE=AUDIO");
          const proxy2 = abs2.includes(".m3u8") || isSubOrAudio ? m3u8Proxy : segProxy;
          return `URI="${proxy2}${encodeURIComponent(abs2)}${refParam}"`;
        }) : line;
      }
      const isVariant = nextIsVariantPlaylist;
      nextIsVariantPlaylist = false;
      const abs = t.startsWith("http") ? t : base + t;
      regHost(abs);
      const proxy = isVariant || abs.includes(".m3u8") ? m3u8Proxy : segProxy;
      return `${proxy}${encodeURIComponent(abs)}${refParam}`;
    }).join("\n");
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.send(manifest);
  } catch (err) {
    logger.error(`[StreamProxy] m3u8 error: ${err.message}`);
    res.status(502).send(err.message);
  }
});
router.get(
  ["/api/stream/segment", "/api/stream/segment.ts"],
  async (req, res) => {
    const url = req.query.url;
    const customReferer = req.query.referer;
    if (!url) return res.status(400).send("No URL");
    try {
      if (customReferer && global.setDynamicReferer) {
        global.setDynamicReferer(url, customReferer);
      }
      const reqHeaders = getHeaders(url);
      if (customReferer) {
        reqHeaders.Referer = customReferer;
      }
      const isDirectVideo = Boolean(
        url.split("?")[0].match(/\.(mp4|mkv|webm|mov|avi)$/i)
      );
      if (isDirectVideo) {
        if (req.headers.range) {
          reqHeaders.Range = req.headers.range;
        }
        let attempts2 = 0;
        let resp;
        while (attempts2 < 2) {
          try {
            resp = await global.axios.get(url, {
              headers: reqHeaders,
              responseType: "stream",
              timeout: 3e4,
              validateStatus: (s) => s < 400
            });
            break;
          } catch (err) {
            attempts2++;
            const status2 = err.response?.status;
            if ((status2 === 403 || status2 === 503) && attempts2 < 2 && global.cloudflarebypass) {
              try {
                const bypassTarget = customReferer || url;
                await global.cloudflarebypass(bypassTarget, true);
                const fresh = getHeaders(url);
                if (customReferer) fresh.Referer = customReferer;
                if (req.headers.range) fresh.Range = req.headers.range;
                Object.assign(reqHeaders, fresh);
              } catch (_) {
              }
            } else if (attempts2 >= 2) {
              throw err;
            }
          }
        }
        const status = resp.status || (req.headers.range ? 206 : 200);
        res.status(status);
        const copyHeaders = [
          "content-type",
          "content-length",
          "content-range",
          "accept-ranges",
          "last-modified",
          "etag"
        ];
        copyHeaders.forEach((h) => {
          const val = resp.headers?.[h];
          if (val) res.setHeader(h, val);
        });
        if (!res.getHeader("accept-ranges")) {
          res.setHeader("Accept-Ranges", "bytes");
        }
        if (req.method === "HEAD") {
          return res.end();
        }
        resp.data.pipe(res);
        return;
      }
      let attempts = 0;
      let data, headers;
      while (attempts < 2) {
        try {
          const resp = await global.axios.get(url, {
            headers: reqHeaders,
            responseType: "arraybuffer",
            timeout: 1e4
          });
          data = resp.data;
          headers = resp.headers;
          break;
        } catch (err) {
          attempts++;
          const status = err.response?.status;
          if (status === 429 && attempts < 2) {
            await new Promise((r) => setTimeout(r, 1e3));
          } else if ((status === 403 || status === 503) && attempts < 2 && global.cloudflarebypass) {
            try {
              const bypassTarget = customReferer || url;
              await global.cloudflarebypass(bypassTarget, true);
              const fresh = getHeaders(url);
              if (customReferer) fresh.Referer = customReferer;
              Object.assign(reqHeaders, fresh);
            } catch (_) {
            }
          } else if (attempts >= 2) {
            throw err;
          }
        }
      }
      if (!Buffer.isBuffer(data) && !(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data) && typeof data !== "string") {
        throw new Error("Invalid binary/stream payload from upstream");
      }
      let buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (buffer.length >= 8 && buffer[0] === 137 && buffer[1] === 80 && buffer[2] === 78 && buffer[3] === 71 && buffer[4] === 13 && buffer[5] === 10 && buffer[6] === 26 && buffer[7] === 10) {
        for (let i = 0; i < Math.min(buffer.length - 3, 1024); i++) {
          if (buffer[i] === 73 && buffer[i + 1] === 69 && buffer[i + 2] === 78 && buffer[i + 3] === 68) {
            buffer = buffer.subarray(i + 8);
            break;
          }
        }
      }
      const ct = headers?.["content-type"] || "application/octet-stream";
      res.setHeader("Content-Type", ct.includes("image") ? "video/mp2t" : ct);
      if (req.headers.range) {
        const match = req.headers.range.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : buffer.length - 1;
          if (start < buffer.length && end >= start) {
            const chunk = buffer.subarray(start, end + 1);
            res.status(206);
            res.setHeader(
              "Content-Range",
              `bytes ${start}-${end}/${buffer.length}`
            );
            res.setHeader("Content-Length", chunk.length);
            res.setHeader("Accept-Ranges", "bytes");
            return res.send(chunk);
          }
        }
      }
      res.send(buffer);
    } catch (err) {
      logger.error(`[StreamProxy] segment error: ${err.message}`);
      res.status(502).send(err.message);
    }
  }
);
async function linkMediaItem({ oldId, malId, type, title, image }) {
  if (type === "Movies") {
    throw new Error("Movies do not support database mapping or MAL linking");
  }
  const itemType = type || "Anime";
  const malIdStr = malId ? String(malId) : null;
  if (!malIdStr && !oldId) {
    throw new Error("Missing malId or oldId");
  }
  const numMalId = Number(malIdStr);
  let selectedProvider = null;
  let resolvedProviderId = null;
  const setting = await settingfetch();
  if (global.mappingDb && numMalId) {
    try {
      const best = await getBestProviderForMalId(numMalId, itemType);
      if (best) {
        selectedProvider = best.provider;
        resolvedProviderId = best.id;
      }
    } catch (err) {
      logger.error(`Error querying mappingDb for link-mapping: ${err.message}`);
    }
  }
  if (!selectedProvider) {
    selectedProvider = itemType === "Anime" ? setting?.Animeprovider || Object.keys(global.Anime_providers || {})[0] || "pahe" : setting?.Mangaprovider || Object.keys(global.Manga_providers || {})[0] || "weebcentral";
  }
  const finalId = resolvedProviderId || oldId || malIdStr;
  if (numMalId) {
    if (!title) {
      try {
        const titleRes = await fetch(
          `https://strawverse.theyogmehta.online/api/title/${itemType}/${numMalId}`
        );
        if (titleRes.ok) {
          const tData = await titleRes.json();
          if (tData && tData.title) {
            title = tData.title;
          }
        }
      } catch (_) {
      }
    }
    if (!image && global.mappingDb) {
      try {
        const imgRow = await global.mappingDb.prepare(
          itemType === "Anime" ? "SELECT image_url FROM anime WHERE malid = ?" : "SELECT image_url FROM manga WHERE malid = ?"
        ).get(numMalId);
        if (imgRow && imgRow.image_url) {
          image = imgRow.image_url;
        }
      } catch (_) {
      }
    }
  }
  const cleanFolder = sanitizeFolderName(title || oldId || finalId);
  if (global.db) {
    try {
      const stmt = global.db.prepare(
        "INSERT OR REPLACE INTO unlinked_mal_ids (id, malid) VALUES (?, ?)"
      );
      if (oldId) await stmt.run(oldId, String(numMalId));
      if (finalId) await stmt.run(finalId, String(numMalId));
      if (cleanFolder) await stmt.run(cleanFolder, String(numMalId));
      const existing = await queryOne(
        `SELECT * FROM ${itemType} WHERE id = ? OR id = ? OR folder_name = ?`,
        [finalId, oldId, cleanFolder]
      );
      if (existing) {
        await run(
          `UPDATE ${itemType} SET id = ?, MalID = ?, provider = ?, title = COALESCE(NULLIF(?, ''), title), image_url = COALESCE(NULLIF(?, ''), image_url), folder_name = COALESCE(NULLIF(folder_name, ''), ?) WHERE id = ? OR id = ? OR folder_name = ?`,
          [
            finalId,
            String(numMalId),
            selectedProvider,
            title || existing.title || "",
            image || existing.image_url || "",
            cleanFolder,
            oldId || finalId,
            finalId,
            cleanFolder
          ]
        );
      } else {
        await run(
          `INSERT OR REPLACE INTO ${itemType} (id, title, image_url, folder_name, MalID, provider, CustomTag) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            finalId,
            title || finalId,
            image || "",
            cleanFolder,
            String(numMalId),
            selectedProvider,
            JSON.stringify(["downloads"])
          ]
        );
      }
    } catch (err) {
      logger.error(`Error updating local db in link-mapping: ${err.message}`);
    }
  }
  if (oldId && oldId !== finalId && global.db) {
    try {
      if (itemType === "Anime") {
        await run("UPDATE WatchHistory SET anime_id = ? WHERE anime_id = ?", [
          finalId,
          oldId
        ]);
        await run("UPDATE SkipTimes SET anime_id = ? WHERE anime_id = ?", [
          finalId,
          oldId
        ]);
      } else {
        await run("UPDATE ReadHistory SET manga_id = ? WHERE manga_id = ?", [
          finalId,
          oldId
        ]);
      }
    } catch (_) {
    }
  }
  if (global.mappingDb && (oldId || finalId)) {
    try {
      const cleanProv = (selectedProvider || "").toLowerCase().split("/").pop();
      await global.mappingDb.prepare(
        "DELETE FROM unmapped_items WHERE (id = ? OR id = ?) OR (provider = ? AND id = ?)"
      ).run(oldId || "", finalId || "", cleanProv, oldId || finalId);
      if (cleanProv && numMalId) {
        if (cleanProv === "pahe") {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            String(finalId)
          );
          if (isUuid) {
            await global.mappingDb.prepare(
              "INSERT OR REPLACE INTO pahe (id, uuid, malid) VALUES (?, ?, ?)"
            ).run(finalId, finalId, numMalId);
          } else {
            await global.mappingDb.prepare("INSERT OR REPLACE INTO pahe (id, malid) VALUES (?, ?)").run(finalId, numMalId);
          }
        } else {
          try {
            await global.mappingDb.exec(`
              CREATE TABLE IF NOT EXISTS "${cleanProv}" (
                id TEXT PRIMARY KEY,
                malid INTEGER
              );
            `);
          } catch (_) {
          }
          await global.mappingDb.prepare(
            `INSERT OR REPLACE INTO "${cleanProv}" (id, malid) VALUES (?, ?)`
          ).run(finalId, numMalId);
        }
        const malTable = itemType === "Anime" ? "anime" : "manga";
        await global.mappingDb.prepare(`UPDATE ${malTable} SET has_mapping = 1 WHERE malid = ?`).run(numMalId);
      }
    } catch (_) {
    }
  }
  const linkedProviders = await getLinkedProvidersForMalId(numMalId, itemType, {
    currentProvider: selectedProvider,
    currentId: finalId,
    title: title || "",
    installedOnly: true
  });
  const details = {
    id: finalId,
    dataId: oldId,
    malid: numMalId,
    title: title || finalId,
    image: image || "",
    image_url: image || "",
    provider: selectedProvider,
    linkedProviders,
    CustomTag: JSON.stringify(["downloads"])
  };
  return {
    success: true,
    newId: finalId,
    provider: selectedProvider,
    details
  };
}
router.post(
  ["/api/local/link-mapping", "/api/mapping/link-item"],
  async (req, res) => {
    try {
      const result = await linkMediaItem(req.body);
      return res.json(result);
    } catch (err) {
      logger.error(`Failed to link item: ${err.message}`);
      const isClientError = err.message && err.message.startsWith("Missing");
      return res.status(isClientError ? 400 : 500).json({ error: err.message });
    }
  }
);
module.exports = router;
