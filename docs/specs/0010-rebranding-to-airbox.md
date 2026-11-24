# 0010. Project Rebranding to Airbox Across Manifests, UI, and Documentation

**Date**: 2026-11-23
**Status**: Accepted

## Summary

This specification defines the complete project rebrand to Airbox across all package manifests, Electron desktop configuration, Capacitor mobile bindings, user interface components, and public documentation. The effort establishes Airbox as the single canonical identity for the application while maintaining backward compatibility with existing user libraries and local database stores. Implementing this decision eliminates legacy StrawVerse and Iconmedia naming discrepancies, delivers a production grade README showcase, and aligns the visual brand with clean typography and hairline styling.

## Context

The application has undergone multiple evolutionary stages, leading to split branding across the repository. The root documentation still references StrawVerse, while the root package configuration, window titles, and recent components refer to Iconmedia. Furthermore, desktop window creation, splash screens, and mobile configuration files carry mismatched titles and package identifiers.

Leaving multiple brand names active causes user confusion, complicates release automation, and weakens the open source identity of the studio. A comprehensive rebrand standardizes the name Airbox across every layer. It updates package files, native desktop window headers, mobile application labels, SVG startup animations, and the public project README.

## Requirements

**User stories**:
* As a user, I want the desktop application and mobile app to display Airbox consistently in window titles, splash screens, and navigation bars so that I experience a polished media studio.
* As an existing user, I want my downloaded episodes, movies, and library tags to persist automatically under the new brand so that I lose no files or watch progress.
* As a developer or contributor, I want clear and accurate README documentation with quick start scripts, architecture diagrams, and release guides so that I can set up and contribute without friction.
* As a maintainer, I want package manifests, scripts, and build outputs unified under the name airbox so that distribution binaries and releases publish reliably.

**Acceptance criteria**:
* **AC-1**: Root and workspace package files (`package.json`, `gui/package.json`, `electron/package.json`) use the package name airbox and updated product descriptions.
* **AC-2**: Electron main process (`electron/gui.ts`) and preload bridges initialize application windows titled Airbox, pointing to consistent application metadata.
* **AC-3**: Mobile Capacitor configuration (`capacitor.config.ts` or `capacitor/`) names the application Airbox with aligned display labels.
* **AC-4**: Frontend assets, HTML document titles (`gui/index.html`), SVG splash loaders (`AppSplashLoader.tsx`), and startup hooks render Airbox with smooth outline drawing animations.
* **AC-5**: Local storage and database path resolvers implement graceful dual checks, locating existing user data in Iconmedia paths if present before writing to Airbox directories.
* **AC-6**: The public `README.md` is replaced with a comprehensive studio showcase featuring high level capabilities, platform download tables, quick start commands, and architecture overviews.
* **AC-7**: Production builds for desktop (`npm run build:desktop`) and web (`npm run build:gui`) complete cleanly with zero broken asset references or naming regressions.

## Options considered

### Option 1: Cosmetic documentation update only

Rewrite the README to introduce Airbox while leaving all internal package names, window titles, and component strings as Iconmedia.

**Pros**:
* Minimal development effort with zero risk to existing native runtime code.

**Cons**:
* Leaves deep brand confusion across application window headers, system trays, mobile installs, and package builds.

### Option 2: Hard cutover with fresh storage directories

Rename all files and change internal application data directory names immediately to Airbox without backward compatibility logic.

**Pros**:
* Clean separation with no legacy checks in backend filesystem utilities.

**Cons**:
* Disruptive to existing users who would find their downloaded media library, history records, and custom tags suddenly inaccessible.

### Option 3: Full surface rebrand with graceful legacy data compatibility

Standardize the Airbox brand across all manifests, native window wrappers, frontend components, and public documentation, while adding an automatic fallback check for legacy Iconmedia database directories.

**Pros**:
* Delivers a unified brand identity across all user facing and developer touchpoints while safeguarding existing user data and watch progress.

**Cons**:
* Requires updating multiple configuration files and testing filesystem fallback routines.

## Decision

**Chosen option**: Option 3: Full surface rebrand with graceful legacy data compatibility.

The project will adopt Airbox as its single canonical brand across package manifests, window titles, mobile metadata, user interface components, and project documentation, supported by backward compatible directory resolution for existing user libraries.

## Rationale

Unifying under Airbox provides a clean, modern identity that matches the refined Coss UI and Aceternity design overhaul recently completed. Option 3 succeeds because it fixes the legacy StrawVerse and Iconmedia fragmentation without harming existing installations. By incorporating a dual check for application data paths, users upgrading to Airbox retain their full library, download queues, and historical settings seamlessly.

## Standard definition

**Canonical pattern**:
```json
{
  "name": "airbox",
  "productName": "Airbox",
  "description": "Airbox - Modern open source streaming and download studio for movies, series, anime, and manga"
}
```

**Replaces**:
* Legacy package naming referencing StrawVerse or iconmedia in manifest descriptions.
* Mismatched window titles displaying Iconmedia or generic loader text.
* Outdated README copy describing legacy scraper repositories instead of the desktop and mobile media studio.

**Enforcement**:
* Automated type checking (`npm run typecheck`) and build verification (`npm run build:gui`).
* Project search scans ensuring zero orphaned StrawVerse or Iconmedia strings in user facing interfaces.

**Rollout**:
* Single coordinated migration encompassing configuration files, splash screens, window bindings, and the README showcase.

**Exceptions**:
* Internal API route paths (such as `/api/local/tags` and `/api/movies/featured`) and third party scraper protocol definitions remain unchanged to preserve extension compatibility.

## Build plan

1. Update root and subproject manifests (`package.json`, `gui/package.json`, `electron/package.json`) to name airbox and update product descriptions, satisfies **AC-1**.
2. Update Electron window configuration (`electron/gui.ts`) to set window title Airbox and verify desktop runtime startup, satisfies **AC-2**.
3. Align mobile configuration and display strings in Capacitor configuration, satisfies **AC-3**.
4. Update web page titles in `gui/index.html`, SVG stroke animation in `AppSplashLoader.tsx`, and splash status copy in `App.tsx` to render Airbox, satisfies **AC-4**.
5. Verify and test backend directory resolvers in `backend/utils/DirectoryMaker.ts` to ensure automatic discovery of existing Iconmedia storage paths, satisfies **AC-5**.
6. Rewrite `README.md` from scratch as a production studio showcase featuring platform tables, features, architecture overview, and quick start scripts, satisfies **AC-6**.
7. Execute full production build and test suites to verify complete integrity, satisfies **AC-7**.

## Consequences

**Positive**:
* Single clear identity across all platforms, documents, and repositories.
* Professional open source presentation welcoming to new users and contributors.
* Existing user data preserved without manual migrations.

**Negative / tradeoffs**:
* Requires one time audit of documentation links, release scripts, and badges.

**Neutral**:
* Extension scrapers continue functioning using existing API protocols without modification.

## Follow-up

* [ ] Update GitHub repository description, social preview card, and release tags to reflect the Airbox brand upon merge.
* [ ] Update installer graphics and desktop application icon assets for macOS, Windows, and Linux packaging.
