# CLAUDE.md

Guide for working in this repository. Product spec: `SPEC.md` (French). UI copy is in French.

## Commands
- `npm run dev` — dev server
- `npm run build` — `tsc -b` + Vite build (use it as the type-check)
- `npm run lint` — oxlint

## Architecture
- `src/db/` — data layer, the only place that talks to IndexedDB (Dexie).
  - `types.ts` domain model: Project → ReflexionMap (tree: each non-root map belongs to one node) → IdeaNode / IdeaEdge; NodeTemplate per project.
  - `actions.ts` all writes (cascade deletes live here). `hooks.ts` reactive reads via `useLiveQuery`.
  - `history.ts` undo/redo. Content writes must go through `record()` (actions already do): Dexie hooks capture before/after snapshots of every touched record. Nested `record()` calls join one step; `coalesceKey` merges keystroke edits. Writes outside `record()` (viewport, `ensureChildMap`) are deliberately not undoable.
  - `palette.ts` limited colour palette; colours resolve to CSS variables (`--sketch-*` in `index.css`) so they follow the theme.
  - Node style lives on the template only (`color`, `strokeWidth`, `dashed`); `features/map/node-style.ts` turns it into CSS. Schema changes need a new `db.version(n)` with an `upgrade()` migrating existing data (users have real data in IndexedDB).
- `src/features/map/` — the canvas.
  - `map-canvas.tsx` owns React Flow state. DB → RF sync spreads the previous RF node/edge first so React Flow's internal state (`measured`, selection…) survives; dropping `measured` makes edges disappear.
  - Positions are persisted on drag stop, sizes on resize end (`idea-node.tsx`), viewport on move end.
  - `link-edge.tsx` floating edges (anchored on node borders, handles are only for connecting) with custom arrowheads; `geometry.ts` holds the maths.
  - Navigation: `lock-store.ts` (double-click edits when locked, enters when unlocked), depth arrows in `idea-node.tsx`, bookmarks (`bookmarkedAt` on nodes) in `canvas-toolbar.tsx`. Use `useGoToNode()` to jump to any node: it navigates with `?focus=` or, on the same map, sends a `focus-node` map command.
  - Keyboard shortcuts are a window listener in `map-canvas.tsx`; they're ignored while typing or when a dialog is open. Keep `keyboard-help.tsx` and `SPEC.md` in sync when changing them.
- `src/features/templates/` — per-project template editor. `src/features/projects/` — project list.
- `src/features/shell/` — root layout: command palette (`Ctrl+K`, shadcn Command/cmdk) and global undo/redo shortcuts. The palette talks to the open canvas through `map-commands.ts` (window events).
- `src/router.tsx` — TanStack Router, code-based routes. `/projects/$projectId/maps/$mapId?focus=<nodeId>` (the canvas selects and reveals `focus`).
- `src/components/ui/` — shadcn/ui components, unmodified (new-york style). Add new ones from the shadcn registry rather than hand-writing them.

## Conventions
- Visual style: clean and sober. Excalidraw is the reference for the *UX* (minimal, direct, keyboard-first), not for the hand-drawn look.
- Apply colours through `style` (not SVG attributes) so CSS variables work.
