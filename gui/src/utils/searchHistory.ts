export interface SearchHistoryEntry {
  query: string;
  timestamp: number;
  type?: string;
}

const STORAGE_KEY = "iconmedia_search_history";
const MAX_HISTORY_ITEMS = 20;

export function getSearchHistory(type?: string): SearchHistoryEntry[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: SearchHistoryEntry[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    if (!type) return parsed;
    return parsed.filter((item) => !item.type || item.type.toLowerCase() === type.toLowerCase());
  } catch (_) {
    return [];
  }
}

export function addSearchHistory(query: string, type?: string): SearchHistoryEntry[] {
  const cleanQuery = (query || "").trim();
  if (!cleanQuery) return getSearchHistory(type);

  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }

  try {
    const all = getSearchHistory();
    const filtered = all.filter(
      (item) => item.query.toLowerCase() !== cleanQuery.toLowerCase()
    );

    const newEntry: SearchHistoryEntry = {
      query: cleanQuery,
      timestamp: Date.now(),
      type: type || undefined,
    };

    const updated = [newEntry, ...filtered].slice(0, MAX_HISTORY_ITEMS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return type
      ? updated.filter((item) => !item.type || item.type.toLowerCase() === type.toLowerCase())
      : updated;
  } catch (_) {
    return [];
  }
}

export function removeSearchHistory(query: string, type?: string): SearchHistoryEntry[] {
  const cleanQuery = (query || "").trim();
  if (!cleanQuery) return getSearchHistory(type);

  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }

  try {
    const all = getSearchHistory();
    const updated = all.filter(
      (item) => item.query.toLowerCase() !== cleanQuery.toLowerCase()
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return type
      ? updated.filter((item) => !item.type || item.type.toLowerCase() === type.toLowerCase())
      : updated;
  } catch (_) {
    return [];
  }
}

export function clearSearchHistory(type?: string): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    if (!type) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const all = getSearchHistory();
    const remaining = all.filter(
      (item) => item.type && item.type.toLowerCase() !== type.toLowerCase(),
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
  } catch (_) {}
}
