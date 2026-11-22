# Scope: Iconmedia

A modern media desktop player and downloader for movies, television series, anime, and manga.

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
| 6 | Search suggestions and auto complete | Slice 1 | planned |
| 7 | Search history management | Slice 1 | planned |
| 8 | Cast and metadata keyword expansion | Slice 1 | planned |
| 9 | Voice search integration | Slice 1 | planned |
| 10 | Download queue reordering | Slice 2 | planned |
| 11 | Individual task pause and resume | Slice 2 | planned |
| 12 | Downloaded library inspector | Slice 2 | planned |
| 13 | Embedded desktop media player | Slice 3 | planned |

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

## Slice 1: Search, discovery, and keyword expansion

### 6. Search suggestions and auto complete · needs a decision
Provide responsive search query suggestions and title completions as you type in the search bar.
**Done when:** typing queries presents instant title suggestions with keyboard navigation and click to select.
- [ ] Design it (spec): `/architect search suggestions and auto complete`

### 7. Search history management · needs a decision
Persist recent searches locally and show them upon focusing the search bar with clear and delete actions.
**Done when:** recent search queries persist across app launches, display in a dropdown, and allow single item removal or full clearing.
- [ ] Design it (spec): `/architect search history management`

### 8. Cast and metadata keyword expansion · needs a decision
Expand searches beyond exact title matches to actor names, directors, and genre metadata, enabling queries like Jet Li to surface films he stars in.
**Done when:** entering cast or crew names surfaces all matching movies and television series through metadata keyword lookup.
- [ ] Design it (spec): `/architect cast and metadata keyword expansion`

### 9. Voice search integration · needs a decision
Hands free speech to text input trigger in the search header, translating spoken words into search queries.
**Done when:** clicking the voice search icon records audio, transcribes the voice query, and initiates title search automatically.
- [ ] Design it (spec): `/architect voice search integration`

## Slice 2: Download queue control and library tracking

### 10. Download queue reordering · needs a decision
Allow reordering queued tasks up and down or by drag and drop so high priority downloads complete first.
**Done when:** users can change task order in the download list and the queue worker respects the updated order immediately.
- [ ] Design it (spec): `/architect download queue reordering`

### 11. Individual task pause and resume · needs a decision
Pause or resume individual downloads at will without pausing the entire download worker.
**Done when:** each download item has an independent pause toggle that halts active connections and resumes seamlessly.
- [ ] Design it (spec): `/architect individual task pause and resume`

### 12. Downloaded library inspector · needs a decision
Surface completed downloads stored in configured download folders, verifying on disk files and offering quick playback.
**Done when:** the app scans the target video folder, lists confirmed local files, and allows direct launch.
- [ ] Design it (spec): `/architect downloaded library inspector`

## Slice 3: Embedded desktop media player

### 13. Embedded desktop media player · needs a decision
Directly integrate video and audio playback within the main application window instead of opening external players.
**Done when:** clicking play opens the integrated video player inside the app view, with playback controls and track switching.
- [ ] Design it (spec): `/architect embedded desktop media player`

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
