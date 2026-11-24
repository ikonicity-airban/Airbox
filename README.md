<h6 align="right">Supports Windows, macOS, Linux & Android</h6>
<p align="center">
  <img src="gui/public/images/logo.png" width="108" height="108" alt="Airbox Logo" />
</p>
<h1 align="center">
  Airbox
</h1>

<p align="center">
  <strong>Modern open source streaming and download studio for Movies, Television Series, Anime, and Manga.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Android-blue?style=for-the-badge" alt="Platforms">
  <img src="https://img.shields.io/badge/UI-React%2019%20%2B%20TypeScript-8b5cf6?style=for-the-badge" alt="React 19 & TypeScript">
  <img src="https://img.shields.io/badge/License-GPL--3.0-green?style=for-the-badge" alt="License">
</p>

<p align="center">
  Airbox is a high performance desktop media studio and downloader designed for seamless streaming, offline library management, and batch downloads across multiple providers. Built with React 19, TypeScript, Electron, and Capacitor, Airbox pairs a refined dark glassmorphic interface with an accelerated multi connection download worker.
</p>

<p align="center">
  <a href="#quick-download"><b>Quick Download</b></a> &bull;
  <a href="#key-features"><b>Key Features</b></a> &bull;
  <a href="#architecture"><b>Architecture</b></a> &bull;
  <a href="#developer-guide"><b>Developer Guide</b></a> &bull;
  <a href="#roadmap"><b>Roadmap</b></a>
</p>

---

## Quick Download

| Platform | Installer Format | Architecture | Compatibility |
| :--- | :--- | :--- | :--- |
| **Windows** | Setup Installer (`.exe`) | x64 | Windows 10, Windows 11 |
| **macOS** | Disk Image (`.dmg`) & Archive (`.zip`) | Apple Silicon (`arm64`) | macOS 12+ (M1, M2, M3, M4) |
| **Linux** | AppImage & Debian Package (`.AppImage`, `.deb`) | x64 | Ubuntu, Debian, Arch, Fedora |
| **Android** | Mobile Package (`.apk`) | arm64-v8a | Android 7.0+ |

> [!NOTE]
> **macOS (Apple Silicon) First Launch:** Because Airbox is a community open source binary without commercial notarization, macOS Gatekeeper may prompt for confirmation on first open. Right click `Airbox.app` in your Applications folder and select **Open**, or run:
> ```bash
> xattr -cr /Applications/Airbox.app
> ```

---

## Key Features

### 🎬 Movies & TV Series Studio
* **Multi-Season Consolidation:** Automatically clusters individual seasons (e.g. S1, S2, S3) into a single cohesive media card with an interactive season selector.
* **Structured Media Organization:** Downloads episodes into standardized season folders (`Show Name/Season 01/...`), while standalone movies save cleanly without clutter.
* **Trending & Top Rated Feeds:** Live carousel powered by TMDB metadata featuring weekly trending releases and search discovery.

### ⚡ Batch Media Downloader
* **Sequential & Parallel Processing:** Download entire seasons, playlists, or selected episodes in bulk with configurable concurrency limits.
* **Quality & Audio Selection:** Choose between 1080p FHD, 720p, 480p, or Audio Only (MP3) with automatic resolution fallback.
* **Subtitle Remuxing & Extraction:** Extract soft subtitles (`.srt`, `.vtt`) beside files or remux tracks directly into `.mp4` containers.
* **Web Media Link Downloader:** Dedicated downloader view for direct web video links and YouTube playlists with queue management and speed tracking.

### 🎨 Refined Coss UI Design System
* **Hairline Borders & Theme Tokens:** Built with pure CSS tokens (`--bg-primary`, `--bg-secondary`, `--accent`, `--border`), eliminating harsh AI color artifacts and translucent card borders.
* **Fluid Shimmer Skeletons:** Skeleton wave shimmers replace legacy GIF spinners across all views for a responsive loading experience.
* **SVG Stroke Startup Animation:** Clean application splash screen featuring animated vector stroke paths during backend initialization.

### 🔍 Instant Suggestions & Search History
* **Live Title Suggestions:** Debounced query matching displays instant title recommendations with cover art thumbnails.
* **Local Search History:** Persistent query history with keyboard navigation (`ArrowUp`, `ArrowDown`, `Enter`) and single click deletion.
* **MyAnimeList Synchronization:** Connect via MAL OAuth to sync watch lists, track completed episodes, and discover seasonal anime.

---

## Architecture

```
Airbox/
├── backend/            # Express application server and media services
│   ├── routes/         # REST API endpoints (downloads, media, library, system)
│   ├── scrapers/       # Dynamic extension registry and scraper runtimes
│   └── utils/          # SQLite database helpers, downloader, and directory makers
├── electron/           # Desktop native wrapper
│   ├── gui.ts          # Main process, window creation, and update checks
│   ├── preload.ts      # Context isolated secure IPC communication bridge
│   └── sharedState.ts  # State management between main and renderer
├── gui/                # User interface
│   ├── src/
│   │   ├── components/ # Modular React views (Catalog, InfoView, MangaReader, Downloads)
│   │   ├── types/      # Shared domain interfaces and TypeScript definitions
│   │   ├── utils/      # Common helpers, search history, and native bridge utilities
│   │   ├── App.tsx     # Application router, splash gating, and layout
│   │   └── main.tsx    # React entry point
│   └── index.html      # Document shell and pre-hydration vector splash
└── capacitor/          # Mobile Android wrapper and background worker bindings
```

---

## Developer Guide

### Prerequisites
* **Node.js**: v18.0.0 or higher
* **npm**: v9.0.0 or higher
* **Git**: Installed and configured

### Installation

Clone the repository and install dependencies across the workspace:

```bash
# Clone the repository
git clone https://github.com/ikonicity-airban/Airbox.git
cd Airbox

# Install frontend dependencies
npm run install --prefix gui

# Install desktop runtime dependencies
npm run install --prefix electron
```

### Development Scripts

Run the development environment on your local machine:

```bash
# Start frontend Vite development server (hot reload on http://localhost:5173)
npm run dev:gui

# Start Electron desktop runtime (compiles TypeScript backend and opens window)
npm run dev:desktop

# Run type checking across the entire frontend
npm run typecheck

# Execute unit and integration tests
npm run test
```

### Production Build

Package production binaries for your target operating system:

```bash
# Compile optimized React production bundle
npm run build:gui

# Compile TypeScript backend services
npm run build:backend

# Build desktop installer for current OS (Windows .exe, Linux AppImage, macOS dmg)
npm run build:desktop

# Package specifically for macOS Apple Silicon
npm run build:desktop:mac

# Synchronize and package Android mobile APK
npm run build:android
```

---

## Backward Compatibility

Airbox automatically detects existing user database files (`database.db`, `settings.json`, and `mapping.db`) from legacy Iconmedia and StrawVerse configurations. Upgrading to Airbox preserves all active download queues, custom tags, and watch history without requiring manual file migrations.

---

## License

Airbox is licensed under the [GNU General Public License v3.0](LICENSE). You are free to inspect, modify, and redistribute this software in accordance with the terms of the GPL-3.0 license.
