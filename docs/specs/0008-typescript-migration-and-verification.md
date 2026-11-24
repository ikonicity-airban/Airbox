# 0008. Full Codebase TypeScript Migration and Verification

**Date**: 2026-11-22
**Status**: Accepted

## Summary

This specification defines the complete migration of the Iconmedia application from JavaScript to TypeScript. The migration introduces strict type safety, shared domain interfaces, automated testing, and compile time verification across the React user interface, Electron preload layer, and backend communication contracts.

## Context

The Iconmedia desktop application was originally scaffolded in pure JavaScript using JSX and CommonJS. While rapid to prototype, untyped code has led to runtime vulnerabilities, including missing hook imports that crashed the React root tree, malformed JSON payloads that disrupted backend processes, and untyped IPC message passing.

Converting the codebase to TypeScript ensures that props, state models, API payloads, and IPC event channels are validated at compile time. This eliminates entire classes of runtime exceptions, accelerates development through rich editor autocompletion, and provides a stable foundation before implementing subsequent features like search suggestions and download controls.

## Requirements

**User stories**:
- As a developer, I want all React components, hooks, and utilities written in TypeScript with explicit props and state types so that interface regressions are caught during build.
- As a developer, I want shared domain types for media catalog items, download tasks, history records, and scraper extensions so that API contracts remain uniform across all views.
- As a developer, I want automated component and utility tests so that changes can be verified quickly without manual regression runs.
- As a developer, I want a dedicated type check script that validates all files without emitting artifacts, failing immediately if any type error occurs.

**Acceptance criteria**:
- **AC-1**: TypeScript is installed and configured in `gui/` with `tsconfig.json`, `tsconfig.node.json`, and Vite integration.
- **AC-2**: Core domain interfaces are defined in `gui/src/types/`, including `MediaItem`, `CatalogFilter`, `DownloadTask`, `HistoryEntry`, `CustomTag`, and `IPCChannels`.
- **AC-3**: All frontend utility modules in `gui/src/utils/` are migrated to `.ts` with full parameter and return type annotations.
- **AC-4**: All React views and components in `gui/src/components/` and `gui/src/App.jsx` are migrated to `.tsx` with typed props, event handlers, and refs.
- **AC-5**: Electron preload and IPC bridges expose typed window methods on `window.sharedStateAPI`.
- **AC-6**: Automated unit and component tests are introduced, validating critical UI rendering, state transitions, and utility routines.
- **AC-7**: Both `npm run typecheck` (`tsc --noEmit`) and `npm run build` pass with zero diagnostic errors or bundle warnings.

## Options considered

### Option 1: Incremental JSDoc with checkJs (Discarded)
Use JSDoc comments across existing `.js` and `.jsx` files without renaming them.
- **Pros**: Requires no file renaming or bundler configuration changes.
- **Cons**: Verbose syntax, incomplete type coverage, weak developer ergonomics, and lacks true interface definitions.

### Option 2: Full TypeScript Migration across UI and Contracts (Chosen)
Install TypeScript compiler, configure strict `tsconfig.json`, convert all `.jsx` and `.js` modules to `.tsx` and `.ts`, and create dedicated interface definitions.
- **Pros**: Complete compile time safety, first class React 19 support in Vite, strong editor intelligence, and clean types for testing and refactoring.
- **Cons**: Requires migrating existing component props and typing third party dependencies.

## Decision

**Chosen option**: Option 2: Full TypeScript Migration across UI and Contracts.

Iconmedia will adopt TypeScript for the entire user interface and communication layers, starting with configuration and domain interfaces, progressing through utilities and React components, and concluding with automated test verification and audit passes.

## Architecture and Build Plan

### Phase 1: Tooling and Compiler Configuration
- Install `typescript`, `@types/node`, and test dependencies in `gui/`.
- Create `gui/tsconfig.json` with strict mode, DOM libraries, and JSX preserve / react-jsx settings.
- Create `gui/tsconfig.node.json` for Vite configuration typing.
- Update `gui/package.json` with `"typecheck": "tsc --noEmit"`.

### Phase 2: Domain Types Definition (`gui/src/types/`)
- `media.ts`: Schema for media titles, episodes, seasons, providers, and stream links.
- `catalog.ts`: Schema for catalog filters, grid pagination, sorting, and tag selections.
- `download.ts`: Schema for download queue items, active tasks, transfer speeds, and segment counts.
- `history.ts`: Schema for watch history, progress tracking, and statistics.
- `electron.ts`: Type declarations for `window.sharedStateAPI` and IPC event listeners.

### Phase 3: Utilities and Common Helpers Migration
- Migrate `gui/src/utils/common.js` to `common.ts`.
- Migrate `gui/src/utils/nativeBridge.js` to `nativeBridge.ts`.
- Ensure helpers provide strict return types and error guards.

### Phase 4: React Components and Views Migration
- Migrate shared components (`LoadingSpinner`, `Modal`, `Navbar`, `Header`).
- Migrate view components (`Catalog.jsx`, `CatalogGrid.jsx`, `InfoView.jsx`, `DownloadsTracker.jsx`, `SettingsView.jsx`, `Marketplace.jsx`).
- Migrate entry points (`gui/src/App.jsx` -> `App.tsx`, `gui/src/main.jsx` -> `main.tsx`).

### Phase 5: Automated Testing and Verification
- Set up unit testing using Vitest and React Testing Library.
- Write tests for core utilities, component rendering, and custom hooks.
- Execute full type check (`tsc --noEmit`) and Vite production build.

### Phase 6: Code Quality Audit and Review
- Run code review and audit using the jsmastery-pro check and audit workflow.
- Verify running application inside Electron with live HMR.

## Consequences

- **Positive**: Eliminates runtime type errors, ensures consistent API contracts, simplifies onboarding and refactoring, and unlocks strict testing.
- **Negative**: Initial migration effort across existing large components like `Catalog.jsx` and `InfoView.jsx`.
