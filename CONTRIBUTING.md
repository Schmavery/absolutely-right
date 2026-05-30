
## Stack

- React 18 + TypeScript
- Vite 6
- Tailwind v4 (`@tailwindcss/vite`) — class-based styling, theme tokens via
  CSS variables
- Handlebars — game-dialogue templating (see `src/lib/template.ts`)
- An in-repo Vite plugin (`vite/yaml-plugin.ts`) so YAML data files can be
  imported directly at build time

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
```

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — type-check (`tsc --noEmit`) and produce a production
  build in `dist/`
- `npm run preview` — preview the production build

## Layout

```
data/                         # game content
  generators.yaml             # purchasable LOC sources
  upgrades.yaml               # one-shot perks (incl. purchase flavor lines)
  events.yaml                 # AI dialogue events
  milestones.yaml             # observer-voice beats
  actions.yaml                # per-action cost / cooldown / formulas / messages
  ui.yaml                     # phase strings, spinner frames
  README.md                   # authoring guide

src/
  main.tsx                    # react-dom entry; mounts <Game />
  Game.tsx                    # orchestrator: state, tick, handlers, layout
  types.ts                    # GenDef, UpgDef, EventDef, ActionDef, GameState, …
  yaml.d.ts                   # *.yaml module shim

  game/                       # pure game logic
    constants.ts              # cross-cutting tunable numbers (THRESHOLDS, HYPE, …)
    flags.ts                  # feature flags from upgrades + threshold merge
    derive.ts                 # deriveGame(state) — flags, thresholds, UI gates
    data.ts                   # typed YAML re-exports + action(id) lookup
    rates.ts                  # rate / cost / uptime calculations
    state.ts                  # default + load + save persistence
    log.ts                    # appendLog reducer
    events.ts                 # random event firing
    tick.ts                   # one-tick state→state reducer
    actions.ts                # player action reducers (read from actions.yaml)

  lib/                        # generic helpers (would work outside this game)
    format.ts                 # fmt, fmtRate
    template.ts               # Handlebars wrapper + plural helper
    theme.ts                  # active theme + persistence + dark/light toggle
    useStreamingLog.ts        # word-by-word log streaming hook
    useWindowWidth.ts         # responsive helper

  components/                 # presentational React components
    Button.tsx
    ResourcePanel.tsx
    ActionBar.tsx
    Generators.tsx
    Upgrades.tsx
    ConversationLog.tsx
    Settings.tsx              # top-right toolbar: dark/light toggle + gear modal

  styles/
    index.css                 # imports Tailwind + theme tokens
    themes.css                # CSS variables for each theme

vite/yaml-plugin.ts           # in-repo Vite plugin: yaml → js module
```

## Themes

CSS variables are defined per-theme under `[data-theme="…"]` selectors in
`src/styles/themes.css`. The current active theme is mirrored onto
`<html data-theme="…">` by `useTheme()`. Tailwind utilities like `bg-bg`,
`text-fg`, `border-card-border`, `text-log-bad`, etc. resolve to these
variables, so all components restyle automatically when the theme changes.

Built-in themes:

- `terminal-dark` (default), `terminal-light` — the original look
- `solarized-dark`, `solarized-light` — Ethan Schoonover's palette
- `gruvbox-dark` — Pavel Pertsev's palette
- `nord` — Arctic Ice Studio's palette

Each theme declares a `kind` (`'dark' | 'light'`) and may declare a
`sibling` id pointing at its opposite-kind counterpart. The sun/moon
toolbar button uses these to swap between dark and light variants;
themes without a sibling fall back to `terminal-dark` / `terminal-light`.

Add another by copying one of the `[data-theme="…"]` blocks in `themes.css`
and adding the new id to `THEMES` in `src/lib/theme.ts`.

## State persistence

Game state is persisted in `localStorage` under `absolutely_right_v1`. The
selected theme lives under `absolutely_right_theme`. There's a "rewrite
from scratch" button at the bottom of the UI that wipes the save.
