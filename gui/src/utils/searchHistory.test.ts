import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getSearchHistory,
  addSearchHistory,
  removeSearchHistory,
  clearSearchHistory,
} from "./searchHistory.ts";

describe("searchHistory utility", () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    (globalThis as any).window = {
      localStorage: {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, val: string) => {
          store[key] = val;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
      },
    };
  });

  test("returns empty list initially", () => {
    assert.deepEqual(getSearchHistory(), []);
  });

  test("adds search queries to the top and deduplicates case-insensitively", () => {
    addSearchHistory("Naruto", "Anime");
    addSearchHistory("One Piece", "Anime");
    addSearchHistory("naruto", "Anime");

    const history = getSearchHistory();
    assert.equal(history.length, 2);
    assert.equal(history[0].query, "naruto");
    assert.equal(history[1].query, "One Piece");
  });

  test("removes individual search item cleanly", () => {
    addSearchHistory("Attack on Titan", "Anime");
    addSearchHistory("Bleach", "Anime");

    removeSearchHistory("Attack on Titan");
    const remaining = getSearchHistory();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].query, "Bleach");
  });

  test("clears all search history", () => {
    addSearchHistory("Item 1");
    addSearchHistory("Item 2");
    clearSearchHistory();
    assert.deepEqual(getSearchHistory(), []);
  });

  test("limits history to maximum capacity of 20 entries", () => {
    for (let i = 1; i <= 25; i++) {
      addSearchHistory(`Search Term ${i}`);
    }
    const history = getSearchHistory();
    assert.equal(history.length, 20);
    assert.equal(history[0].query, "Search Term 25");
  });

  test("filters search history by media type", () => {
    addSearchHistory("Inception", "Movies");
    addSearchHistory("Solo Leveling", "Anime");
    addSearchHistory("Berserk", "Manga");

    const movies = getSearchHistory("Movies");
    assert.equal(movies.length, 1);
    assert.equal(movies[0].query, "Inception");

    const anime = getSearchHistory("Anime");
    assert.equal(anime.length, 1);
    assert.equal(anime[0].query, "Solo Leveling");
  });
});
