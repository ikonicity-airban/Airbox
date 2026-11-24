import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseTags,
  isReservedTag,
  getMalStatusLabel,
  parseSeriesSeasonInfo,
  groupSeriesSeasons,
} from "./common.ts";

describe("common utility functions", () => {
  test("parseTags handles array inputs correctly", () => {
    const input = ["Action", "  Drama ", ""];
    const result = parseTags(input);
    assert.deepEqual(result, ["Action", "Drama"]);
  });

  test("parseTags parses JSON string arrays", () => {
    const input = JSON.stringify(["Sci-Fi", "Comedy"]);
    const result = parseTags(input);
    assert.deepEqual(result, ["Sci-Fi", "Comedy"]);
  });

  test("parseTags parses comma separated string fallback", () => {
    const input = "Action, Adventure, Fantasy";
    const result = parseTags(input);
    assert.deepEqual(result, ["Action", "Adventure", "Fantasy"]);
  });

  test("parseTags returns empty array on null or empty input", () => {
    assert.deepEqual(parseTags(null), []);
    assert.deepEqual(parseTags(""), []);
    assert.deepEqual(parseTags("[]"), []);
  });

  test("isReservedTag detects system reserved tags", () => {
    assert.equal(isReservedTag("Watching"), true);
    assert.equal(isReservedTag("plan to watch"), true);
    assert.equal(isReservedTag("Completed", "Anime"), true);
    assert.equal(isReservedTag("CustomUserTag"), false);
  });

  test("getMalStatusLabel formats snake_case statuses to Title Case", () => {
    assert.equal(getMalStatusLabel("plan_to_watch"), "Plan To Watch");
    assert.equal(getMalStatusLabel("watching"), "Watching");
    assert.equal(getMalStatusLabel("on_hold"), "On Hold");
    assert.equal(getMalStatusLabel(""), "");
  });

  test("parseSeriesSeasonInfo correctly identifies season number and root title", () => {
    const s1 = parseSeriesSeasonInfo("The Boys Season 1");
    assert.deepEqual(s1, { rootTitle: "The Boys", seasonNumber: 1, isMovie: false });

    const s2 = parseSeriesSeasonInfo("Stranger Things S02");
    assert.deepEqual(s2, { rootTitle: "Stranger Things", seasonNumber: 2, isMovie: false });

    const s3 = parseSeriesSeasonInfo("Loki - Season 3");
    assert.deepEqual(s3, { rootTitle: "Loki", seasonNumber: 3, isMovie: false });

    const movie = parseSeriesSeasonInfo("Inception (2010)");
    assert.equal(movie, null);

    const movieSequel = parseSeriesSeasonInfo("Transformers 2");
    assert.equal(movieSequel, null);

    const moviePart = parseSeriesSeasonInfo("Harry Potter Part 1");
    assert.equal(moviePart, null);
  });

  test("groupSeriesSeasons clusters multi-season entries into a single series card", () => {
    const rawItems = [
      { id: 101, title: "The Boys Season 1", provider: "flix" },
      { id: 102, title: "The Boys Season 2", provider: "flix" },
      { id: 103, title: "The Boys Season 3", provider: "flix" },
      { id: 201, title: "Oppenheimer", provider: "flix" },
      { id: 301, title: "Solo Leveling Season 1", provider: "flix" },
    ];

    const grouped = groupSeriesSeasons(rawItems);

    // The Boys should be consolidated into 1 card with totalSeasons = 3
    const theBoys = grouped.find((g) => g.title === "The Boys");
    assert.ok(theBoys);
    assert.equal(theBoys.isGroupedSeries, true);
    assert.equal(theBoys.totalSeasons, 3);
    assert.equal(theBoys.seasonBadgeText, "3 Seasons");
    assert.ok(theBoys.seasons);
    assert.equal(theBoys.seasons.length, 3);

    // Standalone items remain untouched
    const oppenheimer = grouped.find((g) => g.title === "Oppenheimer");
    assert.ok(oppenheimer);
    assert.equal(oppenheimer.isGroupedSeries, undefined);

    // Single season without counterpart stays single
    const solo = grouped.find((g) => g.title === "Solo Leveling Season 1");
    assert.ok(solo);
    assert.equal(solo.isGroupedSeries, undefined);
  });

  test("groupSeriesSeasons preserves movie franchises as individual entries without grouping", () => {
    const rawMovies = [
      { id: 501, title: "Transformers", year: "2007", type: "Movies" },
      { id: 502, title: "Transformers 2", year: "2009", type: "Movies" },
      { id: 503, title: "Transformers 3", year: "2011", type: "Movies" },
      { id: 601, title: "Matchbox: The Movie", year: "2026", type: "Movies" },
    ];

    const grouped = groupSeriesSeasons(rawMovies);

    // Each movie must remain as its own standalone card to maintain search responsiveness
    assert.equal(grouped.length, 4);
    assert.ok(grouped.some((m) => m.title === "Transformers"));
    assert.ok(grouped.some((m) => m.title === "Transformers 2"));
    assert.ok(grouped.some((m) => m.title === "Transformers 3"));
    assert.ok(grouped.some((m) => m.title === "Matchbox: The Movie"));
    assert.ok(grouped.every((m) => !m.isGroupedSeries));
  });
});
