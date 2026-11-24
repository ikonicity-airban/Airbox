# 0012 Eaziflix UI Design Integration

## Summary

This specification outlines the comprehensive integration of the modern Eaziflix media studio user interface into Airbox. Airbox currently possesses a robust streaming engine, multi connection batch downloader, and multi provider extension architecture. By porting the visual aesthetic, layout structures, typography hierarchy, carousel systems, and detail surfaces from Eaziflix, Airbox will achieve an exceptional, unified streaming interface while retaining its full native desktop and mobile offline downloader power. Authentication flows from Eaziflix are deliberately bypassed in favor of instant local access.

## Requirements

### Functional Requirements
- **Hero Showcase Carousel**: Port Eaziflix eighty percent viewport height hero slider featuring smooth crossfade transitions, auto rotation with manual override, multi angle obsidian gradient masks, genre badges, star ratings, and direct playback or details triggers.
- **Top Ranked Trending Strip**: Implement the horizontal trending carousel with oversized numerical rank typography positioned behind poster cards with smooth gesture scrolling.
- **Modern Poster Cards**: Standardize movie and series cards with two-by-three aspect ratios, subtle hover scaling, star ratings, language tags, release years, and shimmer skeleton placeholders.
- **Media Filtering Drawer**: Add multi select genre pill filtering, release year range selector, minimum rating slider, and sort order controls for library and discover surfaces.
- **Rich Media Details Surface**: Adopt Eaziflix backdrop hero presentation, embedded trailer modal, horizontal cast filmography carousel, metadata badges, and similar title recommendations.
- **Instant Guest Mode**: Retain Airbox direct execution model without mandatory user login or registration screens.

### Non Functional Requirements
- **Zero Dash Punctuation**: Adhere strictly to the project writing style guide with zero punctuation dashes in prose.
- **Fluid Performance**: Hero and carousel transitions must maintain sixty frames per second without frame drops or layout thrashing.
- **Theme Harmony**: Seamlessly harmonize Eaziflix obsidian purple color tokens with Airbox glassmorphic sidebar and titlebar controls.

## Decision

### Design System and Color Palette
We adopt the obsidian space palette from Eaziflix as the default theme foundation for Airbox:
- Primary App Background: `#030014` (Deep Obsidian Indigo)
- Card and Panel Surfaces: `#0f0d23` (`dark-100`) with translucent glass borders `rgba(206, 206, 251, 0.08)`
- Primary Accent: `#cecefb` (`light-100`) for headers and prominent labels
- Muted Accent: `#a8b5db` (`light-200`) for secondary metadata and icons
- Action Accent: `#e50914` to `#9333ea` gradient for high energy play and download triggers
- Warning and Ratings: `#facc15` (`yellow-400`) for TMDB star ratings and critical badges

### Component Mapping

| Eaziflix Source (`CodeOven/Eaziflix/src`) | Airbox Destination (`CodeOven/Airbox/gui/src`) | Integration Purpose |
| :--- | :--- | :--- |
| `components/Hero.jsx` | `components/EaziHero.tsx` | Main hero carousel on Discover and Home views |
| `components/MovieCard.jsx` | `components/EaziMediaCard.tsx` | Standardized card across search, discover, and library |
| `components/MovieFilters.jsx` | `components/EaziFilters.tsx` | Filter modal and slide over drawer |
| `components/TrailerModal.jsx` | `components/TrailerModal.tsx` | Embedded YouTube trailer player dialog |
| `components/Pages/MovieDetailsPage.jsx` | `components/InfoView.tsx` | Overhaul existing detail view with cast and trailer |
| `components/TrendingMoviesSkeleton.jsx` | `components/skeletons/TrendingSkeleton.tsx` | Dimmed shimmer skeleton loader for trending strip |
| `index.css` (custom tokens & fancy text) | `index.css` | Import Bebas Neue font and `.fancy-text` classes |

## Architecture Details

### 1. Hero Showcase System
The hero component reads popular and featured titles from the active provider or TMDB metadata service. It manages an eight second interval timer that automatically pauses when hovering or navigating arrows. Five gradient layers overlay the backdrop image:
1. Bottom to top gradient from `#030014` up through transparent.
2. Left to right gradient from `#030014` at ninety percent opacity through transparent to keep title text legible over bright backdrops.
3. Top down soft vignette ensuring titlebar and search headers remain visible.

### 2. Ranked Trending Strip
The trending section utilizes Bebas Neue styled numbers (1 through 10) with thirty percent opacity positioned next to each poster. Posters overlap the number by fourteen pixels negative margin to create a dynamic depth effect identical to Eaziflix.

### 3. Media Details and Cast Showcase
Airbox InfoView will render a panoramic backdrop image with full width gradient overlays, prominent action buttons (Stream Now, Batch Download, and Watch Trailer), followed by an interactive cast carousel. Cast cards feature circular avatar portraits with fallback placeholder avatars, actor names, and character roles.

## Build Plan

### Phase 1: Stylesheet and Design Tokens
1. Add DM Sans and Bebas Neue Google Web Fonts to `gui/index.html`.
2. Configure theme variables in `gui/src/index.css` including `--color-primary: #030014`, `--color-dark-100: #0f0d23`, `--color-light-100: #cecefb`, and `.fancy-text` styling.
3. Build the trending and media card skeleton loaders.

### Phase 2: Hero Carousel and Ranked Strip
1. Implement `EaziHero.tsx` with auto play, crossfade transition, metadata badges, and responsive controls.
2. Integrate the ranked trending horizontal carousel into `DiscoverView.tsx`.
3. Standardize `MediaCard.tsx` with hover zooming and rating stars.

### Phase 3: Media Details and Trailer Modal
1. Implement `TrailerModal.tsx` for trailer viewing without leaving the app.
2. Refactor `InfoView.tsx` hero section with backdrop gradients and action button layout.
3. Integrate horizontal scrolling cast filmography with left and right navigation chevrons.

### Phase 4: Filter Drawer and Verification
1. Add `EaziFilters.tsx` supporting genre pills, sort order, and year ranges.
2. Verify responsive layout across desktop and mobile screens.
3. Validate smooth playback handoff from "Watch Now" into the Airbox embedded MPV player.

## Consequences

- The user interface acquires a commercial streaming studio appearance on par with Netflix and Eaziflix.
- Offline and local playback capabilities remain fully intact because all data fetching connects to Airbox internal controllers and extensions.
- User accounts and login screens are completely avoided, maintaining zero friction startup.
