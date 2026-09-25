# Nébuleuse

An app to represent ideas as a multidimensional graph.

Each idea is a node on a hand-drawn 2D map (Excalidraw style); every node can be opened
to reveal a deeper map that details it. Ideas are grouped in projects, and each project
defines its own node templates (style + custom fields).

See [SPEC.md](./SPEC.md) for the full product specification (in French).

## Stack

- React 19 + TypeScript + Vite
- [React Flow](https://reactflow.dev) (`@xyflow/react`) for the canvas, [rough.js](https://roughjs.com) for the hand-drawn look
- [TanStack Router](https://tanstack.com/router) for routing
- [shadcn/ui](https://ui.shadcn.com) (standard components) + Tailwind CSS v4
- [Tiptap](https://tiptap.dev) rich-text editor, stored as Markdown
- [Dexie](https://dexie.org) — local-first storage in IndexedDB

## Development

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build
npm run lint     # oxlint
```

## Credits

The canvas font is [Excalifont](https://github.com/excalidraw/excalidraw) (SIL Open Font License),
shipped in `public/fonts/`.
