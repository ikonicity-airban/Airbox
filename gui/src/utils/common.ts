export async function apiPost<T = unknown>(
  url: string,
  body: unknown = {},
  options: RequestInit = {}
): Promise<T | { success: boolean; error?: string }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...options,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return (
        data || {
          success: false,
          error: `Request failed with status ${response.status}`,
        }
      );
    }
    return (data || { success: true }) as T;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network request failed";
    return {
      success: false,
      error: message,
    };
  }
}

function hexToRgba(hex: string | null | undefined, alpha: number = 1, fallback: string | null = null): string {
  if (!hex || typeof hex !== "string") {
    return fallback || `rgba(124, 58, 237, ${alpha})`;
  }
  let clean = hex.replace(/[^0-9a-fA-F]/g, "").trim();
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((x) => x + x)
      .join("");
  }
  if (clean.length !== 6) {
    return fallback || `rgba(124, 58, 237, ${alpha})`;
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) {
    return fallback || `rgba(124, 58, 237, ${alpha})`;
  }
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}

export function applyThemeVars(s: Record<string, any> = {}): void {
  const root = document.documentElement;
  if (!root) return;

  const cleanColor = (val: unknown): string => {
    if (typeof val !== "string") return "";
    return val.replace(/["']/g, "").trim();
  };

  const getContrastColor = (hex: unknown): string => {
    if (!hex || typeof hex !== "string") return "#ffffff";
    const clean = hex.replace(/["'#]/g, "").trim();
    let r = 255,
      g = 255,
      b = 255;
    if (clean.length === 3) {
      r = parseInt(clean[0] + clean[0], 16);
      g = parseInt(clean[1] + clean[1], 16);
      b = parseInt(clean[2] + clean[2], 16);
    } else if (clean.length >= 6) {
      r = parseInt(clean.substring(0, 2), 16);
      g = parseInt(clean.substring(2, 4), 16);
      b = parseInt(clean.substring(4, 6), 16);
    }
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return "#ffffff";
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.55 ? "#0a0a0f" : "#ffffff";
  };

  const accent = cleanColor(s.themeAccentColor);
  if (accent) {
    root.style.setProperty("--accent", accent);
    root.style.setProperty(
      "--accent-hover",
      hexToRgba(accent, 0.85, "#9061f9"),
    );
    root.style.setProperty("--accent-contrast", getContrastColor(accent));
    root.style.setProperty("--dub-btn-color", accent);
    root.style.setProperty(
      "--dub-btn-bg",
      hexToRgba(accent, 0.15, "rgba(124, 58, 237, 0.15)"),
    );
    root.style.setProperty(
      "--dub-btn-border",
      hexToRgba(accent, 0.35, "rgba(124, 58, 237, 0.35)"),
    );
  }
  const secColor = cleanColor(s.themeSecondaryColor || s.themeSubColor);
  if (secColor) {
    root.style.setProperty("--accent-secondary", secColor);
    root.style.setProperty("--sub-btn-color", secColor);
    root.style.setProperty(
      "--sub-btn-bg",
      hexToRgba(secColor, 0.15, "rgba(59, 130, 246, 0.15)"),
    );
    root.style.setProperty(
      "--sub-btn-border",
      hexToRgba(secColor, 0.35, "rgba(59, 130, 246, 0.35)"),
    );
  }
  const sidebarColor =
    cleanColor(s.themeSidebarColor || s.themeAccentColor) || "#8b5cf6";
  root.style.setProperty("--sidebar-active-color", sidebarColor);
  root.style.setProperty(
    "--sidebar-active-bg",
    hexToRgba(sidebarColor, 0.2, "rgba(139, 92, 246, 0.2)"),
  );
  root.style.setProperty(
    "--sidebar-active-bg-hover",
    hexToRgba(sidebarColor, 0.32, "rgba(139, 92, 246, 0.32)"),
  );
  root.style.setProperty(
    "--sidebar-active-glow",
    hexToRgba(sidebarColor, 0.3, "rgba(139, 92, 246, 0.3)"),
  );

  const bg = cleanColor(s.themeBgColor);
  if (bg) {
    root.style.setProperty("--bg-primary", bg);
    root.style.setProperty("--bg-secondary", hexToRgba(bg, 0.95, "#16181f"));
    root.style.setProperty("--bg-tertiary", hexToRgba(bg, 0.85, "#1f222d"));
    root.style.setProperty(
      "--glass",
      hexToRgba(bg, 0.75, "rgba(22, 24, 31, 0.75)"),
    );
  }
  const text = cleanColor(s.themeTextColor);
  if (text) {
    root.style.setProperty("--text-main", text);
    root.style.setProperty("--text-muted", hexToRgba(text, 0.7, "#9ca3af"));
  }
  if (s.catalogTitleFontSize) {
    root.style.setProperty(
      "--catalog-title-font-size",
      `${s.catalogTitleFontSize}px`,
    );
  }
  if (s.catalogTitleLines) {
    root.style.setProperty("--catalog-title-lines", `${s.catalogTitleLines}`);
  }
  if (s.catalogColumns) {
    if (s.catalogColumns === "auto") {
      root.style.removeProperty("--catalog-columns");
    } else {
      root.style.setProperty("--catalog-columns", s.catalogColumns);
    }
  }
  if (s.catalogCardMaxHeight !== undefined) {
    if (!s.catalogCardMaxHeight || s.catalogCardMaxHeight === "auto") {
      root.style.removeProperty("--catalog-card-max-height");
    } else {
      const val =
        typeof s.catalogCardMaxHeight === "number"
          ? `${s.catalogCardMaxHeight}px`
          : s.catalogCardMaxHeight;
      root.style.setProperty("--catalog-card-max-height", val);
    }
  }
}

export function parseTags(val: unknown): string[] {
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
  } catch {
    // Ignore JSON parse errors and fall back to comma-separated parsing
  }
  if (str.includes(",")) {
    return str
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
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
    "Downloads",
  ]),
});

const RESERVED_TAGS = Object.freeze({
  Anime: Object.freeze(SYSTEM_TAGS.Anime.map((t) => t.toLowerCase())),
  Manga: Object.freeze(SYSTEM_TAGS.Manga.map((t) => t.toLowerCase())),
  Movies: Object.freeze(SYSTEM_TAGS.Movies.map((t) => t.toLowerCase())),
});

export function isReservedTag(tag: unknown, type: string | null = null): boolean {
  if (!tag || typeof tag !== "string") return false;
  const lower = tag.trim().toLowerCase();
  if (type) {
    const norm = String(type || "").toLowerCase();
    const key =
      norm === "manga" ? "Manga" : norm === "movies" ? "Movies" : "Anime";
    return RESERVED_TAGS[key].includes(lower);
  }
  return (
    RESERVED_TAGS.Anime.includes(lower) ||
    RESERVED_TAGS.Manga.includes(lower) ||
    RESERVED_TAGS.Movies.includes(lower)
  );
}

const MAL_ANIME_STATUSES = Object.freeze([
  "plan_to_watch",
  "watching",
  "completed",
  "on_hold",
  "dropped",
]);

const MAL_MANGA_STATUSES = Object.freeze([
  "plan_to_read",
  "reading",
  "completed",
  "on_hold",
  "dropped",
]);

export const MAL_STATUSES = Object.freeze({
  Anime: MAL_ANIME_STATUSES,
  Manga: MAL_MANGA_STATUSES,
});

function getMalStatuses(type: string = "Anime"): readonly string[] {
  const isManga = String(type).toLowerCase() === "manga";
  return isManga ? MAL_MANGA_STATUSES : MAL_ANIME_STATUSES;
}

export const getMalStatusOptions = getMalStatuses;

export function getMalStatusLabel(status: unknown): string {
  if (!status || typeof status !== "string") return "";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface SeasonInfo {
  seasonNumber: number;
  rootTitle: string;
  isMovie?: boolean;
}

export function parseSeriesSeasonInfo(title: string): SeasonInfo | null {
  if (!title || typeof title !== "string") return null;

  // Explicit TV Seasons: Season 1, S02, 1st Season
  const seasonMatch = title.match(
    /^(.*?)(?:[\s:_-]+(?:Season|S)[\s:_-]*(\d+)|[\s:_-]+(\d+)(?:st|nd|rd|th)?\s+Season)(?:\s*\(.*?\))?$/i,
  );
  if (seasonMatch) {
    const rootTitle = seasonMatch[1].replace(/[\s:_-]+$/, "").trim();
    const seasonNumber = parseInt(seasonMatch[2] || seasonMatch[3], 10);
    if (rootTitle && !isNaN(seasonNumber)) {
      return { rootTitle, seasonNumber, isMovie: false };
    }
  }

  return null;
}

export function groupSeriesSeasons<
  T extends { title?: string; year?: string | number; [key: string]: any },
>(
  items: T[],
): (T & {
  isGroupedSeries?: boolean;
  totalSeasons?: number;
  seasons?: any[];
  seasonBadgeText?: string;
})[] {
  if (!Array.isArray(items) || items.length === 0) return [];

  const rootGroups = new Map<
    string,
    {
      rootTitle: string;
      seasons: { seasonNumber: number; item: T }[];
    }
  >();
  const nonGroupable: T[] = [];

  for (const item of items) {
    const title = item.title || "";
    const info = parseSeriesSeasonInfo(title);
    if (info) {
      const key = info.rootTitle.toLowerCase();
      if (!rootGroups.has(key)) {
        rootGroups.set(key, { rootTitle: info.rootTitle, seasons: [] });
      }
      rootGroups.get(key)!.seasons.push({
        seasonNumber: info.seasonNumber,
        item,
      });
    } else {
      nonGroupable.push(item);
    }
  }

  const result: any[] = [];

  for (const group of rootGroups.values()) {
    if (group.seasons.length > 1) {
      group.seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
      const firstItem = group.seasons[0].item;
      const count = group.seasons.length;
      result.push({
        ...firstItem,
        title: group.rootTitle,
        isGroupedSeries: true,
        totalSeasons: count,
        seasons: group.seasons.map((s) => s.item),
        seasonBadgeText: `${count} Seasons`,
      });
    } else {
      result.push(group.seasons[0].item);
    }
  }

  result.push(...nonGroupable);
  return result;
}

