# 0009. Search Suggestions, Auto Complete, and Search History Management

**Date**: 2026-11-22
**Status**: Completed

## Summary

This specification defines the architecture and implementation for instant search suggestions, title auto complete, persistent search history, default Movies and Series landing view, TMDB featured carousel, smart season search clustering, and collapsible download history in Iconmedia. When users interact with the catalog search bar, the interface presents recent search queries on focus and debounced title suggestions as they type, with keyboard navigation and one-click query removal.

## Context

The previous catalog search bar in `CatalogHeader.tsx` required users to type their entire search term and press Enter before seeing any feedback. Users had no visibility into past queries, and there was no autocomplete assistance for long or foreign media titles. Additionally, Movies and Series was secondary to Anime, provider searches for television shows fragmented individual seasons across disjoint cards, and download tracking lacked a historical record.

## Requirements

**User stories**:
- As a user, I want to see my recent searches when I click into the search input so that I can re-run previous queries with one click.
- As a user, I want to see live suggestions matching what I type so that I can jump directly to specific media titles.
- As a user, I want to navigate suggestions using the Up and Down arrow keys and select with Enter so that I can search without taking my hands off the keyboard.
- As a user, I want to remove individual search history entries or clear the entire history so that I can maintain my privacy and clean up unwanted queries.
- As a user, I want Movies and Series to load as the default home view upon opening the app.
- As a user, I want trending featured movies and series cards from TMDB and open providers with endless scrolling.
- As a user, I want multi-season TV show results consolidated into a single card with season choices.
- As a user, I want a collapsible download history panel to review completed downloads.

**Acceptance criteria**:
- **AC-1**: When the search input is focused and empty, a dropdown displays up to 8 recent searches stored locally with timestamps and a Clear History button.
- **AC-2**: When typing a query with two or more characters, debounced suggestions (220ms) fetch and display matching titles with cover thumbnails and media types.
- **AC-3**: Keyboard navigation (ArrowDown, ArrowUp, Enter, Escape) allows seamless highlighting and selection of suggestions or history items.
- **AC-4**: Clicking or pressing Enter on a suggestion populates the search query, closes the dropdown, and executes the search.
- **AC-5**: Each search history entry includes an individual delete action that removes only that entry from stored history.
- **AC-6**: Movies & Series initializes as the primary default catalog view.
- **AC-7**: Featured movie cards display trending titles via `/api/movies/featured` with click to search/stream.
- **AC-8**: `groupSeriesSeasons` clusters multi-season entries (e.g. S1, S2, S3) into a single consolidated card.
- **AC-9**: `DownloadsTracker.tsx` includes an accordion collapsible panel displaying completed downloads with clear actions.

## Architecture and Design

### Component hierarchy:
- `CatalogHeader.tsx`: Houses the search input, state handlers, and renders the suggestions dropdown.
- `SearchSuggestionsDropdown.tsx`: Dropdown rendering either recent history or live title suggestions.
- `FeaturedMoviesSection.tsx`: Horizontal trending carousel with rating, year, and streaming triggers.
- `searchHistory.ts`: Local utility managing persistent search history in localStorage with max 20 items.
- `common.ts`: Contains `groupSeriesSeasons` and `parseSeriesSeasonInfo` with unit test suite.
- `DownloadsTracker.tsx`: Download queue monitor and collapsible completed download history.

### API surface:
- `GET /api/:AnimeManga/suggestions?q=<query>`: Returns instant title matches from TMDB/TVMaze or mapping database.
- `GET /api/movies/featured?page=<page>`: Returns weekly trending and top-rated movies and series.
- `GET /api/downloads/history`: Returns completed download jobs.
- `POST /api/downloads/history/clear`: Clears all completed download history entries.
