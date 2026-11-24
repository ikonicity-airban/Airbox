# 0011. Cast and Metadata Keyword Expansion

**Date**: 2026-11-23
**Status**: In Progress

## Summary

This specification defines the architecture and implementation for searching movies and television series by cast, directors, and metadata keywords in Airbox. When users enter an actor or director name like Jet Li or Christopher Nolan, Airbox searches people and titles in parallel and surfaces a dedicated Person Card in the search suggestions dropdown. Selecting the person card opens a full filmography catalog sorted by popularity and year, backed by local SQLite caching for fast sub 50 millisecond repeat searches.

## Context

The previous search engine in Airbox only matched exact title substrings. When a viewer wanted to explore movies starring a specific actor or directed by a particular filmmaker, entering the creator name returned zero results unless the creator name happened to be part of the movie title.

Expanding search capabilities to cast and crew metadata requires resolving human names to media filmographies without creating sluggish search input latency. Direct live queries to external third party APIs on every keystroke introduce noticeable lag and trigger rate limit bans. A balanced solution must offer instant feedback, persistent local caching, offline resiliency, and seamless integration with Airbox video streaming and download pipelines.

## Requirements

**User stories**:
- As a viewer, I want to search for an actor or director by name so that I can discover and watch all films and television series they have worked on.
- As a viewer, I want to see an actor or director profile card directly in the search suggestions dropdown so that I can immediately identify the person and jump to their filmography.
- As a viewer, I want cast and metadata keyword searches to be fast and cached locally so that repeated searches load instantly without network latency or provider rate limits.
- As a viewer, I want to click any film in a cast member filmography and stream or download it using my installed extension providers.

**Acceptance criteria**:
- **AC-1**: When typing a query of two or more characters in the search bar, the suggestions endpoint queries person metadata alongside title matches in parallel.
- **AC-2**: When a person query matches an actor or director, the suggestions dropdown renders a dedicated Person Card at the top with profile portrait, known department, and credit count.
- **AC-3**: Clicking the Person Card or pressing Enter on it opens a dedicated Filmography catalog view displaying all credited movies and television series sorted by popularity and release year.
- **AC-4**: Person metadata and credit lists are cached locally in SQLite tables (`person_metadata`, `person_credits`, `keyword_cache`) with a configurable time to live (default 7 days) to ensure sub 50 millisecond response times on repeat queries.
- **AC-5**: Each filmography item displays title, release year, rating, character or role name, and links to the standard Media Info view for streaming and downloading.
- **AC-6**: When offline or when remote APIs timeout, cached local SQLite person credits and local library media are returned seamlessly without throwing unhandled errors.

## Options considered

### Option 1: Live remote API lookups on every keystroke

Query external person search and credit endpoints directly on every user keystroke without local database persistence.

**Pros**:
- Minimal database schema changes.
- Zero local disk space used for person caching.

**Cons**:
- Severe network latency during search typing.
- Exceeds third party rate limits quickly during rapid user typing.
- Fails completely when internet connection is unstable or offline.

### Option 2: Hybrid multi provider resolution with local SQLite caching

Query local SQLite cache first for instant hits; on cache miss, query TMDB person search and TVMaze people endpoints in parallel, cache results in SQLite, and return unified credits.

**Pros**:
- Near zero latency on repeat lookups.
- Resilient offline fallback using cached filmographies and local media.
- Respects third party API rate limits by caching results for 7 days.

**Cons**:
- Requires a database migration adding three tables to SQLite.
- Background cache pruning is needed to clean up expired queries.

### Option 3: Local offline index only

Only index actors, directors, and keywords from currently downloaded files and installed provider scrapers.

**Pros**:
- Zero external network dependencies.
- Completely offline and private.

**Cons**:
- Filmography discovery is crippled because only already downloaded or locally indexed media appears.
- Defeats the primary user goal of finding new movies starring an actor.

## Decision

**Chosen option**: Option 2: Hybrid multi provider resolution with local SQLite caching

Airbox will resolve cast, directors, and metadata keywords through a parallel multi provider search pipeline backed by local SQLite caching and a dedicated person profile header in the search suggestions interface.

## Rationale

Option 2 delivers sub 50 millisecond responsiveness on search suggestions while protecting against API rate limiting and network outages. Querying remote APIs on every keystroke as in Option 1 leads to noticeable UI sluggishness and frequent rate limit errors from public endpoints. Restricting lookups purely to local media as in Option 3 prevents users from discovering new films by their favorite directors or actors. By caching remote credits in local SQLite tables, Airbox achieves instant feedback and full offline tolerance.

## Feature design

**Data model sketch**:
- Table `person_metadata`:
  - `id`: TEXT PRIMARY KEY (e.g. `tmdb:person:123` or `tvmaze:person:456`)
  - `name`: TEXT NOT NULL
  - `department`: TEXT ('Acting', 'Directing', etc.)
  - `image`: TEXT
  - `biography`: TEXT
  - `updated_at`: INTEGER NOT NULL
- Table `person_credits`:
  - `id`: INTEGER PRIMARY KEY AUTOINCREMENT
  - `person_id`: TEXT NOT NULL (foreign key to `person_metadata.id` ON DELETE CASCADE)
  - `media_id`: TEXT NOT NULL (e.g. `movie:123` or `tv:456`)
  - `title`: TEXT NOT NULL
  - `media_type`: TEXT NOT NULL ('movie' or 'tv')
  - `role`: TEXT ('cast', 'director', etc.)
  - `character`: TEXT
  - `year`: INTEGER
  - `rating`: REAL
  - `poster`: TEXT
  - `popularity`: REAL
- Table `keyword_cache`:
  - `query`: TEXT PRIMARY KEY
  - `results_json`: TEXT NOT NULL
  - `cached_at`: INTEGER NOT NULL
  - `expires_at`: INTEGER NOT NULL

**State transitions**:
Not applicable (stateless lookup and cache query flow).

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| /api/person/search | GET | q: string (req), limit: number (opt) | people: Person[] | public | 400 (missing query), 500 (internal error) |
| /api/person/:id/credits | GET | id: string (req), refresh: boolean (opt) | person: Person, credits: Credit[] | public | 404 (not found), 500 (internal error) |
| /api/movies/suggestions | GET | q: string (req) | suggestions: Suggestion[], person: Person (opt) | public | 400 (invalid query) |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Search typing | Person suggestions card | `person_metadata` table or remote TMDB/TVMaze API response |
| Filmography click | Filmography grid list | `person_credits` table ordered by popularity and year |
| Stream probing | Movie stream sources | Scraper extensions matching `title` and `year` |
| Image loading | Actor portrait and poster | TMDB image CDN or TVMaze image URL |

**Key invariants**:
- Cache validity duration is 7 days (604,800 seconds); expired entries are refreshed in background.
- Exact title matches always retain top display priority over cast keyword expansions in the main catalog.
- If a person search returns multiple individuals (e.g. sharing a common name), the one with the highest popularity score is presented first.

**Security model**:
All search and metadata endpoints are read only and run locally inside the desktop application context. No private credentials or sensitive user data are transmitted. Public API calls to TMDB and TVMaze use standard HTTPS.

**Configuration required**:
- `TMDB_API_KEY`: optional environment variable or settings entry to provide higher rate limits for TMDB person searches (falls back to TVMaze and public scrapers if omitted).

**Critical test scenarios**:
- Happy path: User searches "Jet Li", sees actor card in suggestions, clicks to open filmography grid with 40+ movies, verifies **AC-1**, **AC-2**, **AC-3**.
- Cache verification: Repeating "Jet Li" search queries SQLite directly and resolves in under 20 milliseconds without hitting external networks, verifies **AC-4**.
- Offline resilience: Disconnecting network connection returns cached local credits and available library titles gracefully, verifies **AC-6**.
- Stream link: Clicking a filmography entry navigates to standard InfoView and resolves playable video streams via installed extensions, verifies **AC-5**.

## Build plan

1. Create SQLite database tables for `person_metadata`, `person_credits`, and `keyword_cache` in backend database initialization, satisfies **AC-4**
2. Implement backend metadata resolver utility in `backend/utils/Metadata.ts` with TMDB and TVMaze person and credit fetching and SQLite caching, satisfies **AC-1**, **AC-4**
3. Add backend API routes `/api/person/search` and `/api/person/:id/credits` in `backend/routes/media.ts`, satisfies **AC-1**, **AC-4**
4. Update `/api/:AnimeManga/suggestions` in `backend/routes/media.ts` to execute parallel multi facet lookup and return top matching person details, satisfies **AC-1**, **AC-2**
5. Extend `SearchSuggestionsDropdown.tsx` to display the Person Card at the top of the dropdown with portrait and credit count, satisfies **AC-2**
6. Implement Person Filmography view in `Catalog.tsx` and `CatalogGrid.tsx` to render credited films and series when a person card is selected, satisfies **AC-3**, **AC-5**
7. Implement offline fallback and cache timeout handling in `Metadata.ts`, satisfies **AC-6**
8. Write comprehensive automated unit tests in `backend/routes/media.test.ts` and `gui/src/utils/search.test.ts` verifying person lookup, caching, and filmography ordering, satisfies **AC-1**, **AC-4**, **AC-6**

## Consequences

**Positive**:
- Users can discover movies and series naturally by typing actor, director, or creator names.
- Instant search response times through local SQLite caching.
- Zero extra clicks required to explore an actor's entire catalog.

**Negative / tradeoffs**:
- Local SQLite database will store a few megabytes of cached actor metadata over time.
- Rare obscure actors absent from TMDB or TVMaze may return empty filmographies.

**Neutral**:
- Requires background cache invalidation to clean up expired entries older than 30 days.

## Follow-up

- [ ] Add explicit search filter chips for `actor:` and `director:` in a future minor patch for power users.
