# 0006. GUI Aesthetic Overhaul & Design System Architecture

**Date**: 2026-11-22  
**Status**: Proposed  

---

## Summary

This architecture establishes a cohesive design system for the Iconmedia GUI by integrating components and principles from Aceternity UI, Coss UI, Visual Design Foundations, Typography Mastery, and Smooth Transitions. The plan overhauls media cards with interactive depth, introduces a spotlight hero layout, unifies dark glassmorphic surfaces, elevates typography hierarchy, and adds fluid shared element transitions across views.

---

## Architectural Pillars

### 1. Cards & Interactive Depth (Aceternity UI + Coss UI)

* **Aceternity 3D Perspective Card**:
  * Apply subtle pointer-following 3D perspective transforms (`perspective: 1000px`, `rotateX`, `rotateY`) on media cards in `CatalogGrid.jsx`.
  * Elevate poster art on a virtual Z-axis (`translateZ: 30px`) with depth-based drop shadows.
* **Card Spotlight & Shimmer Borders**:
  * Implement dynamic radial spotlight gradients on hover that follow cursor coordinates across card edges (`rgba(139, 92, 246, 0.15)`).
  * Subtle `1px` translucent border (`border-white/[0.08]` resting, `border-violet-500/40` hovered).
* **Coss UI Particle Badges**:
  * Standardize resolution chips (4K, 1080p, 720p), airing status, and release year with clean typographic badge tokens.

---

### 2. Layout Structure & Hero Surfaces (Aceternity Spotlight + Bento Grid)

* **Spotlight Hero Header**:
  * Place an ambient elliptical spotlight (`Spotlight` component) behind the featured banner on the Home and Discover tabs.
  * Radial gradient accents provide cinematic depth without obstructing readability.
* **Asymmetric Bento Grid for Discovery**:
  * Replace uniform grid columns in Discover with an adaptive Bento Grid: large featured card for top trending, medium cards for continuing watches, and compact cards for upcoming releases.
* **Coss UI Action Bars**:
  * Group filter controls, view toggles, and search inputs into unified horizontal toolbars with accessible focus rings and consistent gap spacing (8px grid).

---

### 3. Borders, Colors & Glassmorphism (Visual Design Foundations)

* **Deep Surface Palette**:
  * **Canvas Background**: `#08090d` (ultra-deep pitch black).
  * **Sidebar & Main Surface**: `#10131c` with `rgba(255, 255, 255, 0.04)` border dividers.
  * **Elevated Cards & Popovers**: `#161a26` with subtle inner glow (`inset 0 1px 0 0 rgba(255,255,255,0.06)`).
  * **Primary Accent**: Electric Violet (`#8b5cf6` / hover `#a78bfa`) paired with Cyan (`#06b6d4`) for subtitles and Emerald (`#10b981`) for completed downloads.
* **Glassmorphism Layers**:
  * Use `backdrop-filter: blur(16px)` on sticky headers, player overlays, and dialog backdrops with `pointer-events-none` on background decorative light paths.

---

### 4. Typography Hierarchy (Typography Mastery + Coss UI)

* **Optical Sizing**: Enable `font-optical-sizing: auto` across Plus Jakarta Sans / Inter.
* **Balanced Headings**: Apply `text-balance` to media titles to eliminate single-word orphan lines.
* **Modular Scale**:
  * **Hero Titles**: `clamp(1.75rem, 4vw, 2.5rem)` with `tracking-tight` and bold weight (700).
  * **Card Titles**: `14px` (`font-semibold`, line-clamp-2).
  * **Section Eyebrows**: `11px` (`uppercase tracking-wider font-bold text-violet-400`).
  * **Metadata & Captions**: `12px` (`text-zinc-400`).

---

### 5. Transitions & Micro-Animations (Smooth Transitions)

* **Shared Element Card-to-Modal Morphing**:
  * Use native View Transitions (`document.startViewTransition`) or Motion `layoutId` so clicking a catalog poster morphs smoothly into the `InfoView` hero banner.
* **Sliding Navigation Pill**:
  * Add a spring-animated sliding pill indicator behind active sidebar icons and catalog tab switches (`transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)`).
* **Mount / Unmount Transitions**:
  * Modern CSS `@starting-style` and `transition-behavior: allow-discrete` for zero-flicker dropdowns and modal dialogs.

---

## Component Mapping: Aceternity Library to Iconmedia

| Aceternity Component | Target View in Iconmedia | Aesthetic Enhancement |
|---|---|---|
| **Spotlight** | `CatalogHeader.jsx` / Home Hero | Cinematic radial lighting behind featured media banner |
| **3D Card Container** | `CatalogGrid.jsx` (Media Cards) | Smooth tilt, parallax depth on posters, dynamic lighting |
| **Bento Grid** | `DiscoverView` / Trending Showcase | Asymmetric layout grouping top series, movies, and updates |
| **Background Beams** | `InfoView.jsx` (Detail Backdrop) | Subtle ambient light paths intersecting behind media synopsis |
| **Sliding Tabs Pill** | `Sidebar.jsx` & Category Tabs | Spring-physics sliding background pill on active view navigation |
| **Shimmer Button** | `InfoView` Stream / Download CTA | Polished animated shimmer border on primary action buttons |

---

## Phased Implementation Roadmap

1. **Phase 1: Design Tokens & CSS Variables**
   * Refine color tokens, spacing scale, and surface borders in `gui/src/index.css`.
2. **Phase 2: Card Architecture & Hover Perspective**
   * Upgrade media cards in `CatalogGrid.jsx` with subtle 3D tilt, hover glow, and Coss UI badges.
3. **Phase 3: Hero & Navigation Polish**
   * Add Spotlight lighting to `CatalogHeader.jsx` and sliding pill transitions to `Sidebar.jsx`.
4. **Phase 4: Shared Element View Transitions**
   * Connect Card $\rightarrow$ `InfoView` layout transitions and animate modal popovers with `@starting-style`.
