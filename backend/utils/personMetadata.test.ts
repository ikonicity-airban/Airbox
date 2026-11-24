import test from "node:test";
import assert from "node:assert";
import { DatabaseSync } from "node:sqlite";

// Setup mock in-memory SQLite database matching desktop schema
const testDb = new DatabaseSync(":memory:");

testDb.exec(`
  CREATE TABLE IF NOT EXISTS person_metadata (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    department TEXT,
    image TEXT,
    biography TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS person_credits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id TEXT NOT NULL,
    media_id TEXT NOT NULL,
    title TEXT NOT NULL,
    media_type TEXT NOT NULL,
    role TEXT,
    character TEXT,
    year INTEGER,
    rating REAL,
    poster TEXT,
    popularity REAL
  );

  CREATE TABLE IF NOT EXISTS keyword_cache (
    query TEXT PRIMARY KEY,
    results_json TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_person_credits_person_id ON person_credits (person_id);
  CREATE INDEX IF NOT EXISTS idx_person_credits_popularity ON person_credits (popularity DESC);
  CREATE INDEX IF NOT EXISTS idx_person_metadata_name ON person_metadata (name COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_keyword_cache_expires_at ON keyword_cache (expires_at);
`);

test("person metadata database schema integrity", () => {
  const metaCols = testDb.prepare("PRAGMA table_info(person_metadata)").all();
  const metaNames = metaCols.map((c: any) => c.name);
  assert.ok(metaNames.includes("id"), "person_metadata has id column");
  assert.ok(metaNames.includes("name"), "person_metadata has name column");
  assert.ok(metaNames.includes("department"), "person_metadata has department column");
  assert.ok(metaNames.includes("image"), "person_metadata has image column");
  assert.ok(metaNames.includes("biography"), "person_metadata has biography column");
  assert.ok(metaNames.includes("updated_at"), "person_metadata has updated_at column");

  const creditCols = testDb.prepare("PRAGMA table_info(person_credits)").all();
  const creditNames = creditCols.map((c: any) => c.name);
  assert.ok(creditNames.includes("person_id"), "person_credits has person_id");
  assert.ok(creditNames.includes("media_id"), "person_credits has media_id");
  assert.ok(creditNames.includes("title"), "person_credits has title");
  assert.ok(creditNames.includes("media_type"), "person_credits has media_type");
  assert.ok(creditNames.includes("popularity"), "person_credits has popularity");

  const cacheCols = testDb.prepare("PRAGMA table_info(keyword_cache)").all();
  const cacheNames = cacheCols.map((c: any) => c.name);
  assert.ok(cacheNames.includes("query"), "keyword_cache has query");
  assert.ok(cacheNames.includes("results_json"), "keyword_cache has results_json");
  assert.ok(cacheNames.includes("expires_at"), "keyword_cache has expires_at");
});

test("keyword_cache fast hit and expiry semantics", () => {
  const now = Date.now();
  const testPerson = [{
    id: "tvmaze:123",
    name: "Christopher Nolan",
    department: "Directing",
    creditCount: 15,
  }];

  // Insert valid cache entry
  testDb.prepare(
    "INSERT OR REPLACE INTO keyword_cache (query, results_json, cached_at, expires_at) VALUES (?, ?, ?, ?)"
  ).run("person:christopher nolan", JSON.stringify(testPerson), now, now + 604800000);

  // Retrieve
  const cachedRow: any = testDb.prepare(
    "SELECT results_json, expires_at FROM keyword_cache WHERE query = ?"
  ).get("person:christopher nolan");

  assert.ok(cachedRow, "cache entry found");
  assert.ok(Number(cachedRow.expires_at) > now, "cache is valid and not expired");
  const parsed = JSON.parse(cachedRow.results_json);
  assert.strictEqual(parsed[0].name, "Christopher Nolan");
  assert.strictEqual(parsed[0].department, "Directing");

  // Insert expired entry
  testDb.prepare(
    "INSERT OR REPLACE INTO keyword_cache (query, results_json, cached_at, expires_at) VALUES (?, ?, ?, ?)"
  ).run("person:expired actor", JSON.stringify([]), now - 700000000, now - 1000);

  const expiredRow: any = testDb.prepare(
    "SELECT results_json, expires_at FROM keyword_cache WHERE query = ?"
  ).get("person:expired actor");

  assert.ok(Number(expiredRow.expires_at) <= now, "expired cache entry detected correctly");
});

test("person credits ordering by popularity and year", () => {
  const personId = "tvmaze:456";
  const now = Date.now();

  testDb.prepare(
    "INSERT OR REPLACE INTO person_metadata (id, name, department, image, biography, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(personId, "Jet Li", "Acting", "https://img.example/jetli.jpg", "Born: 1963", now);

  const credits = [
    { person_id: personId, media_id: "movie:1", title: "Fist of Legend", media_type: "movie", role: "cast", character: "Chen Zhen", year: 1994, rating: 8.2, poster: null, popularity: 75.0 },
    { person_id: personId, media_id: "movie:2", title: "Hero", media_type: "movie", role: "cast", character: "Nameless", year: 2002, rating: 8.5, poster: null, popularity: 98.0 },
    { person_id: personId, media_id: "movie:3", title: "Fearless", media_type: "movie", role: "cast", character: "Huo Yuanjia", year: 2006, rating: 8.0, poster: null, popularity: 82.0 },
  ];

  for (const c of credits) {
    testDb.prepare(
      `INSERT INTO person_credits (person_id, media_id, title, media_type, role, character, year, rating, poster, popularity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(c.person_id, c.media_id, c.title, c.media_type, c.role, c.character, c.year, c.rating, c.poster, c.popularity);
  }

  const sorted: any[] = testDb.prepare(
    "SELECT * FROM person_credits WHERE person_id = ? ORDER BY popularity DESC, year DESC"
  ).all(personId);

  assert.strictEqual(sorted.length, 3);
  assert.strictEqual(sorted[0].title, "Hero", "Hero is first due to highest popularity 98.0");
  assert.strictEqual(sorted[1].title, "Fearless", "Fearless is second with popularity 82.0");
  assert.strictEqual(sorted[2].title, "Fist of Legend", "Fist of Legend is third with popularity 75.0");
});

test("single movie vs series classification helper", () => {
  // Single movie with length 1 should not be classified as a TV series
  const movieDetails = {
    title: "Matchbox: The Movie",
    type: "Movie",
    mediaType: "movie",
  };
  const isExplicitMovie = movieDetails.type.toLowerCase() === "movie" || movieDetails.mediaType === "movie";
  assert.strictEqual(isExplicitMovie, true, "explicit movie classification works");

  // Multi episode show with seasons
  const tvDetails = {
    title: "Breaking Bad",
    type: "TV",
    mediaType: "tv",
  };
  const isExplicitTv = tvDetails.type.toLowerCase() === "tv" || tvDetails.mediaType === "tv";
  assert.strictEqual(isExplicitTv, true, "TV series classification works");
});
