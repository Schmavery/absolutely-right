# Game content

All game-tunable content lives in this directory as YAML. The Vite build
parses these files at compile time (see `vite/yaml-plugin.ts`) and emits
plain JS modules — there is **no** YAML parser shipped to the browser.
`vite/validate-data.ts` checks shapes, duplicate ids, action ids, and
`requires:` references on every dev/build import of `data/*.yaml`.

## Files

| file              | shape                              | what it is                                     |
| ----------------- | ---------------------------------- | ---------------------------------------------- |
| `generators.yaml` | `GenDef[]`                         | purchasable LOC/bug/fix sources                |
| `upgrades.yaml`   | `UpgDef[]`                         | one-shot purchases — effects + flavor in one   |
| `events.yaml`     | `EventDef[]`                       | random AI dialogue events fired during play    |
| `news.yaml`       | `NewsDef[]`                        | one-shot industry headlines (`id`, never repeat) |
| `milestones.yaml` | `{ loc, text }[]`                  | one-shot observer-voice messages at LOC totals |
| `actions.yaml`    | `ActionDef[]`                      | per-action cost, cooldown, formulas, messages  |
| `ui.yaml`         | `{ phases, spinFrames, spinVerbs }`| UI strings and animation frames                |

The TypeScript shapes live in `src/types.ts`. `UpgDef` in particular has a
rich set of optional effect fields that drive the game balance (token bonuses,
review multipliers, auto-bug-drain rates, etc.) — see the inline comments
there for combine semantics (multiplicative, additive, last-wins, max-wins).
`ActionDef` colocates everything per-action (token cost, cooldown, event
probability, formula constants, message pools) so retuning a single action
doesn't require touching code.

**Phase design:** see `PHASES.md`. In dev, `http://localhost:5173/?debug=phases`
renders a timeline from this folder + `src/game/constants.ts`.

Cross-cutting balance numbers (THRESHOLDS,
HYPE display, MONEY, UPTIME, STREAMING, save/theme keys) live in
`src/game/constants.ts`.

## Authoring tips

YAML's literal block scalar (`|`) is the right choice for any multi-line
dialogue. It preserves newlines verbatim, so `> user line` patterns survive:

```yaml
- minLoc: 50
  type: info
  text: |
    > make no mistakes
    Understood! I'll make no mistakes.
    > you just made a mistake
    You're absolutely right. I apologize. I'll make no further mistakes.
```

Lines starting with `> ` in `text` are rendered as right-aligned user
messages in the conversation log; everything else is the AI voice.

**Watch out for unquoted colons.** A value like `Token limits: improved.`
will be misparsed as a nested mapping. Quote it (`"…"`), use a literal
block scalar (`|-`), or restructure.

### Fictional names (in-game copy)

All shipped YAML (`events`, `news`, `milestones`, `generators`, `actions`,
`upgrades`) uses this canon for **AI vendors and consumer brands** — not real
company names or trademarked AI product names (Copilot, Recall, etc.).
`INSPIRATION.md` may cite real names as research notes; translate before
adding to game data.

**Non-AI code tech is fair game** — use real names (Kubernetes, React,
ESLint, TypeScript, Docker, npm, …) in jokes about stack choices.

| Real-ish target | In-game |
| --------------- | ------- |
| Google | **Gnoogle** |
| Microsoft | **Microsift** — products e.g. **Deskmate**, **Screen Memory** |
| GitHub / MS coding assistant | **CodePilot** (generator `copilot`; not “Copilot”) |
| OpenAI / ChatGPT | **OpenGPT** |
| Anthropic / Claude | **Claudius Labs** / model **Claudius** (never Claude) |
| Meta / Facebook | **Facelift** |
| Apple | **Apfel** |
| Amazon / AWS / CodeWhisper | **Amazin** / **Amazin Cloud** / **CodeMurmur** |
| X / Grok | **Xitter** / **Squok** |
| Hugging Face | **SnuggleHub** |
| Stack Overflow | **StackUnderflow** |
| Stability AI | **Plateau AI** |
| Replit | **Ripplet** |
| Cursor | **Cursive** |
| Windsurf | **Kitesurfer** |
| Reddit | **ReadIt** (communities: **subreadits**) |
| LinkedIn | **LinkedOut** |
| Air Canada | **MapleWings** |
| Chevrolet | **Bowtie Motors** (e.g. Tahobo) |
| Sam Altman (persona) | **Salmon Altman** |
| Perplexity | **Pursuelity** |
| DeepSeek | **DeapSeek** |
| Mistral | **Mistrale** |
| Nvidia | **Nivida** |
| Character.ai | **Charactr** |

Generator **display names** (ids stay stable for saves): CodePilot, FreeChat,
Claudius, Facelift Orchestrator, etc.

### Identifiers

Game objects whose state needs a stable cross-reference — generators
(purchase counts), upgrades (`requires:`, owned set, on-purchase effects),
actions (cooldown keys, code-side dispatch) — carry an explicit `id`.
Events do **not** carry ids: their only stateful role is "don't repeat this
one until the fresh pool runs out", and that dedup key is derived
automatically from the first non-empty line of `text` (slugged, truncated to
60 chars). Editing an event's first line resets dedup for that event, which
matches the authoring intent. Once the fresh pool is empty, early events
(`minLoc` below `repeatableEventMaxLoc` in `constants.ts`) can repeat;
selection is weighted toward higher `minLoc` within the pool.

**News** (`news.yaml`) uses explicit `id` fields and fires at most once per
save (`usedNewsIds`). Headlines never enter the early repeat pool. Prefer
satirical `Industry:` beats here rather than in `events.yaml` — keep random
dialogue focused on the coding session, not milestone LOC counts or upgrade
mechanics (those have `milestones.yaml` / `actions.yaml`).

Milestones are keyed by their `loc` threshold for the same reason — the
unlock condition is the identity.

### Feature flags

Upgrades can grant **feature flags** while owned:

```yaml
flags:
  - nines_tracking
unlockMinUptimeNines: 4          # shop unlock gate (optional)
thresholdOverrides:               # merge into UI/progression thresholds (optional)
  showBugBountyBugs: 30
```

Known flag names live in `GAME_FLAGS` in `src/game/flags.ts`. The `money`
flag is also set automatically when an upgrade has `enablesMoney: true`.

Game logic and UI should use `deriveGame(state)` / `hasFlag(...)` rather
than checking `state.upgrades.includes('some_id')`.

## Templating

Every author-supplied log string in this folder is rendered through
Handlebars (see `src/lib/template.ts`) — action message pools, event
text, milestones (LOC + test), upgrade `purchaseMsg`, prompt
`earlyPromptMsgs`, and first-purchase flavor. Literal text passes through unchanged, so you
only pay the cost of templating when you opt in.

The full Handlebars surface is available; in particular:

- `{{var}}` — variable substitution
- `{{plural n "bug" "bugs"}}` — picks the singular form when `n === 1`
- `{{rand 3 47}}` — random integer in `[min, max]` (inclusive); rerolls
  on every render
- `{{#if cond}}…{{else}}…{{/if}}` — conditional sections

Variables passed per call site:

| Where | Vars |
|-------|------|
| `actions.yaml` `run_tests.messages` | `n` (bugs fixed) |
| `actions.yaml` `bug_bounty.runMsg` | `converted`, `ninesGain` |
| `actions.yaml` `new_free_account.messages` | `n` (accounts) |
| `actions.yaml` `buy_gen.firstPurchaseMsg` | `name`, `desc` |
| `actions.yaml` `write_test.milestones[].text` | `n` (test count) |
| `actions.yaml` `prompt.earlyPromptMsgs[]` | `{}` (scripted beats only) |
| `milestones.yaml` `text` | `loc` (threshold) |
| `upgrades.yaml` `purchaseMsg` | `name`, `desc` |
| everything else | `{}` (use `{{rand}}` / `{{#if}}` only) |

HTML escaping is disabled because text is rendered into a styled log
panel, never `innerHTML`.

Add new helpers in `src/lib/template.ts` and document them here.
