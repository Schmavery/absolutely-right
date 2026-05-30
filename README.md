# Incremental LLM Game

A parody-style incremental clicker about shipping a startup with an over-eager AI coding
assistant. Originally exported from a [Figma Make][figma-make] project, then stripped down
to a plain React + Vite + TypeScript app so it can be hacked on locally without dragging in
shadcn/ui, Tailwind, Radix, MUI, Emotion, etc.

[figma-make]: https://staging.figma.com/design/QDWN25HukkYJZn64JXFUro/Incremental-LLM-Game

## Stack

- React 18 + TypeScript
- Vite 6
- That's it. The game is a single ~1.4k-line component (`src/app/components/Game.tsx`)
  that uses inline styles and `localStorage` for persistence.

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
```

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — type-check and produce a production build in `dist/`
- `npm run preview` — preview the production build

## Layout

```
src/
  main.tsx                    # react-dom entry point
  app/
    App.tsx                   # renders <Game />
    components/Game.tsx       # the entire game
    data/                     # generators, upgrades, events, milestones, messages, ui copy
    lib/tmpl.ts               # tiny string-template helper used by the message pools
```

Game state is persisted in `localStorage` under the key `just_ship_it_v4`. There's a
"rewrite from scratch" button in the UI to wipe it.
