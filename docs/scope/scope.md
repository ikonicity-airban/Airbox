# Scope: Airbox

A modern open source media studio and downloader for movies, television series, anime, and manga.

**Build approach:** Tracer Bullet (vertical end to end slices, thin but complete through every layer).
**Workflow:** Alpha (after develop, check verify on the real app). The project default level of rigor. /architect is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag to do more or less.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Electron and backend foundation | Foundation | existing |
| 2 | Extension and scraper runtime | Foundation | existing |
| 3 | Media downloads and queue engine | Foundation | existing |
| 4 | Settings and storage configuration | Foundation | existing |
| 5 | Series and movie storage alignment | Foundation | done |
| 6 | Full TypeScript migration and verification | Slice 1 | done |
| 7 | Search suggestions and auto complete | Slice 2 | done |
| 8 | Search history management | Slice 2 | done |
| 9 | Cast and metadata keyword expansion | Slice 2 | in-progress |
| 10 | Voice search integration | Slice 2 | planned |
| 11 | Download queue reordering | Slice 3 | planned |
| 12 | Individual task pause and resume | Slice 3 | planned |
| 13 | Downloaded library inspector | Slice 3 | planned |
| 14 | Embedded desktop media player | Slice 4 | planned |
| 15 | Project rebranding to Airbox | Slice 5 | done |

## Existing foundations

### 1. Electron and backend foundation · existing
Desktop window shell with local Express server, SQLite metadata storage, and IPC event channels.
code in `electron/` and `backend/`

### 2. Extension and scraper runtime · existing
Dynamic scraper loader supporting anime, manga, and movies from community repositories with guest session token rotation.
code in `backend/scrapers/` and `backend/utils/provider.js`

### 3. Media downloads and queue engine · existing
Background download queue with concurrency management, HLS segment merging, and progress logging.
code in `backend/utils/queue.js` and `backend/utils/downloader.js`

### 4. Settings and storage configuration · existing
User preferences for download locations, audio languages, subtitle tracks, and media naming conventions.
code in `gui/src/components/SettingsView.jsx` and `backend/routes/settings.js`

### 5. Series and movie storage alignment · done
Season folder hierarchy ensuring Season 1 Episode 1 resides inside Season 01, standalone movies save with clean titles, and subtitles sit cleanly beside media files or remux inside the container.
**Done when:** series episodes download into season folders, standalone movies do not carry episode numbers, and duplicate subtitle folders are removed.
- [x] Design it (spec): `/architect series and movie storage alignment`
- [x] Build it: `/develop series and movie storage alignment`
- [x] Verify it: `/check verify series and movie storage alignment`
code in `backend/download.js`, `backend/utils/queue.js`, `backend/utils/downloader.js`, and `backend/utils/mediaServer.js`

## Slice 1: TypeScript migration and foundation hardening

### 6. Full TypeScript migration and verification · done
Migrate frontend components, utilities, state handlers, and IPC communication contracts to TypeScript with compile time verification and automated test coverage.
**Done when:** TypeScript is configured with strict mode, all JSX and JS files in `gui/src/` are converted to TSX and TS with domain interfaces, automated tests verify core flows, and both `tsc --noEmit` and `npm run build` pass cleanly.
- [x] Design it (spec): [0008](../specs/0008-typescript-migration-and-verification.md)
- [x] Build it: `/develop typescript migration and verification`
- [x] Verify it: `/check verify typescript migration and verification`
code in `gui/`, `gui/src/types/`, and `electron/`

## Slice 2: Search, discovery, and keyword expansion

### 7. Search suggestions and auto complete · done
Provide responsive search query suggestions and title completions as you type in the search bar.
**Done when:** typing queries presents instant title suggestions with keyboard navigation and click to select.
- [x] Design it (spec): [0009](../specs/0009-search-suggestions-and-history.md)
- [x] Build it: `/develop search suggestions and auto complete`
- [x] Verify it: `/check verify search suggestions and auto complete`
code in `gui/src/components/catalog/CatalogHeader.tsx`, `gui/src/components/catalog/SearchSuggestionsDropdown.tsx`, and `backend/routes/media.ts`

### 8. Search history management · done
Persist recent searches locally and show them upon focusing the search bar with clear and delete actions.
**Done when:** recent search queries persist across app launches, display in a dropdown, and allow single item removal or full clearing.
- [x] Design it (spec): [0009](../specs/0009-search-suggestions-and-history.md)
- [x] Build it: `/develop search history management`
- [x] Verify it: `/check verify search history management`
code in `gui/src/utils/searchHistory.ts` and `gui/src/components/catalog/SearchSuggestionsDropdown.tsx`

### 9. Cast and metadata keyword expansion · in-progress
Expand searches beyond exact title matches to actor names, directors, and genre metadata, enabling queries like Jet Li to surface films he stars in.
**Done when:** entering cast or crew names surfaces all matching movies and television series through metadata keyword lookup.
- [x] Design it (spec): [0011](../specs/0011-cast-and-metadata-keyword-expansion.md)
- [x] Build it: `/develop cast and metadata keyword expansion`
  - [x] SQLite schema and migration for person metadata, credits, and keyword cache (AC-4)
  - [x] Backend metadata resolver and parallel multi facet suggestion pipeline in media routes (AC-1, AC-2, AC-4, AC-6)
  - [x] Frontend person card in search suggestions dropdown and filmography catalog view (AC-2, AC-3, AC-5)
  - [x] Automated unit test coverage for lookup, caching, and stream linkage (AC-1, AC-4, AC-6)
- [ ] Verify it: `/check verify cast and metadata keyword expansion`
code in `backend/routes/media.ts`, `backend/utils/Metadata.ts`, `gui/src/components/catalog/SearchSuggestionsDropdown.tsx`, and `gui/src/components/Catalog.tsx`

### 10. Voice search integration · needs a decision
Hands free speech to text input trigger in the search header, translating spoken words into search queries.
**Done when:** clicking the voice search icon records audio, transcribes the voice query, and initiates title search automatically.
- [ ] Design it (spec): `/architect voice search integration`

## Slice 3: Download queue control and library tracking

### 11. Download queue reordering · needs a decision
Allow reordering queued tasks up and down or by drag and drop so high priority downloads complete first.
**Done when:** users can change task order in the download list and the queue worker respects the updated order immediately.
- [ ] Design it (spec): `/architect download queue reordering`

### 12. Individual task pause and resume · needs a decision
Pause or resume individual downloads at will without pausing the entire download worker.
**Done when:** each download item has an independent pause toggle that halts active connections and resumes seamlessly.
- [ ] Design it (spec): `/architect individual task pause and resume`

### 13. Downloaded library inspector · needs a decision
Surface completed downloads stored in configured download folders, verifying on disk files and offering quick playback.
**Done when:** the app scans the target video folder, lists confirmed local files, and allows direct launch.
- [ ] Design it (spec): `/architect downloaded library inspector`

## Slice 4: Embedded desktop media player

### 14. Embedded desktop media player · needs a decision
Directly integrate video and audio playback within the main application window instead of opening external players.
**Done when:** clicking play opens the integrated video player inside the app view, with playback controls and track switching.
- [ ] Design it (spec): `/architect embedded desktop media player`

## Slice 5: Rebranding and identity standard

### 15. Project rebranding to Airbox · done
Standardize the Airbox identity across root and workspace manifests, Electron and Capacitor window metadata, SVG stroke splash animations, and the public project README showcase.
**Done when:** package manifests, native window titles, mobile app labels, and splash screen animations display Airbox consistently, and the project README is rewritten as a production studio showcase.
- [x] Design it (spec): [0010](../specs/0010-rebranding-to-airbox.md)
- [x] Build it: /develop rebranding to airbox
  - [x] Update package manifests and product metadata (AC-1)
  - [x] Set Electron window title and Capacitor labels (AC-2, AC-3)
  - [x] Update frontend index.html and SVG stroke splash loader (AC-4)
  - [x] Verify backend storage path dual checks (AC-5)
  - [x] Rewrite public README as production studio showcase (AC-6)
- [x] Verify it: /check verify rebranding to airbox
code in `package.json`, `electron/gui.ts`, `gui/src/components/common/AppSplashLoader.tsx`, and `README.md`

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.
* **Torrent stream client**: direct peer to peer streaming for distributed releases · needs a decision
* **Cloud backup sync**: sync watch history and favorites to private cloud storage · needs a decision

## Legend

**The decision box.** Every feature carries exactly one, the sub task whose label ends with `(spec)`. Skills locate it by that `(spec)` suffix. Every other box is an execution box.

**Feature lifecycle**: the scope updates as a feature moves:
* `planned` needs a decision: `/scope` sets one box: `Design it (spec): /architect <feature>`
* `in-progress` (designed): `/architect` ticks `Design it`, links the spec, rolls up milestone sub items under `Build it: /develop <feature>`, and adds verify boxes
* `in-progress` (building): `/develop` ticks milestone sub boxes and fills the code pointer
* `in-progress` (verified): `/check verify` ticks verify boxes
* `done`: you decide when the feature is complete

* **Next step**: the first unticked box (always a command or tracked milestone).
* **needs a decision**: run `/architect` first, or jump to `/develop` if you already know the build.
* **Atomic build tasks live in the spec**: the scope carries only the milestone rollup.
