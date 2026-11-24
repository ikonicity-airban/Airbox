# 0007. Native Web Media Downloader with Direct Extractor Integration

**Date**: 2026-11-22
**Status**: Implemented

## Summary

This decision integrates a native media downloader directly into the Iconmedia core application without relying on sandboxed extension boundaries. The desktop backend executes local extractor tooling (`yt-dlp`) with full operating system privileges to resolve and download media from YouTube and future social platforms. The user interface gains a dedicated sidebar route and settings panel to manage quality selection, output directories, and active download queues.

## Context

Users require an integrated downloader for arbitrary web videos, social clips, and lecture streams, starting with YouTube and expanding to Facebook and Instagram. Previously, this capability was attempted within the sandboxed extension framework, which prohibits native child processes, direct filesystem access, and local binary execution. Furthermore, external web scraping services suffer from Cloudflare anti bot verification gates and aggressive advertising network traps.

By embedding the downloader directly inside Iconmedia, the application eliminates sandbox constraints and third party converter vulnerabilities. The Express backend already manages media streaming and file downloads, making it the natural host for a unified download service.

## Requirements

**User stories**:
- As an Iconmedia user, I want a dedicated route to paste YouTube URLs and select my desired resolution so that I can download media directly to my computer.
- As an Iconmedia user, I want download tasks to show live progress, transfer speed, and completion status so that I can monitor active jobs.
- As an Iconmedia user, I want to configure my preferred download folder and default resolution in the Settings route so that I do not have to set them repeatedly.

**Acceptance criteria**:
- **AC-1**: The backend exposes endpoints to analyze video metadata and fetch available formats using native `yt-dlp` execution.
- **AC-2**: The backend queues and spawns download jobs with `yt-dlp`, writing files to the configured destination folder and streaming progress events over Server Sent Events or polling.
- **AC-3**: The frontend includes a dedicated navigation route and sidebar entry for Web Media Downloads with URL input, resolution selectors, and live progress cards.
- **AC-4**: The Settings route allows users to select their default download directory and preferred default video resolution.
- **AC-5**: The architecture provides modular adapter interfaces allowing future social platforms (Facebook, Instagram) to be added without altering the core download manager.

## Options considered

### Option 1: Sandboxed extension scraper (Discarded)
Rely on external web converters within extension modules.
- **Pros**: Keeps the core app codebase untouched.
- **Cons**: Blocked by extension sandbox restrictions against child processes; suffers from Cloudflare 403 blocks and ad spam.

### Option 2: Direct core app integration with native extractor (Chosen)
Embed the downloader natively into the Iconmedia backend and frontend.
- **Pros**: Unrestricted native OS access; full multi resolution support; zero ad redirects; complete UI and settings integration.
- **Cons**: Requires adding new routes and UI components to the core application.

## Decision

**Chosen option**: Option 2: Direct core app integration with native extractor.

Iconmedia will implement a dedicated Web Media Downloader inside `backend/routes/downloads.js` and `backend/download.js` powered by `yt-dlp`, with frontend routing in `gui/src/App.jsx`.

## Feature design

### API surface:
- `POST /api/downloads/analyze`: Accepts `{ url }`, invokes `yt-dlp --dump-json`, returns title, thumbnail, duration, and available formats.
- `POST /api/downloads/start`: Accepts `{ url, formatId, destinationPath }`, queues download job, emits progress.
- `GET /api/downloads/active`: Returns active and completed download jobs.
- `GET /api/downloads/settings` / `POST /api/downloads/settings`: Manages download preferences.

### UI & Navigation:
- **Sidebar**: New "Downloader" item alongside Movies, TV Shows, and Anime.
- **View**: Input bar with auto paste detection, format picker (1080p, 720p, 480p, MP3), and active queue progress list.
- **Settings**: "Download Location" path picker and "Default Video Quality" dropdown.

## Build plan

- [x] Extend `backend/utils/webMediaDownloader.js` and `backend/download.js` with `analyzeUrl`, `startDownload`, `cancelDownload`, `clearJobs`, and `listJobs` using native `yt-dlp` (satisfies **AC-1**, **AC-2**).
- [x] Add web media routes to `backend/routes/downloads.js` for analysis (`/api/downloads/web/analyze`), execution (`/api/downloads/web/start`), job status (`/api/downloads/web/jobs`), cancellation (`/api/downloads/web/cancel`), clearing (`/api/downloads/web/clear`), and extractor status (`/api/downloads/web/status`) (satisfies **AC-2**).
- [x] Build the Downloader view component in `gui/src/components/WebMediaDownloader.jsx` and styling in `gui/src/components/css/WebMediaDownloader.css`, registered in `gui/src/App.jsx` and `gui/src/components/Sidebar.jsx` (satisfies **AC-3**, **AC-5**).
- [x] Add download preferences controls to the Settings panel in `gui/src/components/settings/SettingsView.jsx` with custom storage folder browsing and default quality settings under the new Web Downloader tab (satisfies **AC-4**).
