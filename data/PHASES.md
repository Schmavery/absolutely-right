# Game phases — design outline

Target progression for mechanics, copy, and retuning. **Not** loaded by the
game at runtime. Flavor subtitles ship in `data/ui.yaml` and are selected by
`src/game/phases.ts` from launch / upgrades / flags.

**Core struggle:** grow LOC without bugs getting out of hand. Each chapter is
a different *strategy* for that tension — some help, some trade speed for
control, some lie about control.

**Flavor vs mechanics:** one chapter index. `ui.yaml` holds the subtitle
copy; `getPhase(state)` in `src/game/phases.ts` picks the index from player
progress (see rules below). Retune copy in YAML and gates in `phases.ts`
together.

### Flavor index rules (shipped)

Mechanical gates pick the index; `ui.yaml` lines are **vague mood**, not a label
for the chapter (same energy as “a new conversation”).

| Index | When (mechanics) | Subtitle (mood) |
| ----- | ---------------- | --------------- |
| 0 | not launched | a new conversation |
| 1 | launched | it's running in prod |
| 2 | launched + (`pro_plan` / money **or** `multi_agent`) | additional capacity online |
| 3 | `code_review` or `ai_review` | waiting on sign-off |
| 4 | `revamp_status_page` (`nines_tracking`) | no active incidents |

Add MCP / YOLO upgrade ids to index 2 when those ship.

---

## Mechanical chapters (target order)

### 1. Early — prompts and basic tests

- **Bug strategy:** notice bugs; fix with paste-error / write-test / run-tests.
- **Player role:** typing prompts; learning the loop.
- **Shipped today:** `prompt`, generators, `model_update_*`, `unit_tests`, test actions.
- **Not yet:** MCP, launch-gated corp chaos.

### 2. Early mid — go live, then CI and better models

- **Bug strategy:** tests and lint-ish upgrades; optional CI once moved up in `unlockAt`.
- **Player role:** still prompting; generators matter more.
- **Launch (here):** Deploy button → `launched`, **uptime** visible, revenue *eligible* (money resource still off).
- **Better models:** `model_update_*`, `better_prompts` / few-shot / XML / CoT chain — “smarter” without necessarily “safer.”
- **Money (not here):** paid API/plan is mid, not at launch.

### 3. Mid — tools, approvals, then auto

- **Bug strategy:** gate risky agent behavior before it lands (approval beats).
- **Player role:** approver — chat may block on Allow / Deny (+ small fixed “click” cost in busy time).
- **MCP chapter (target):** upgrade enables “tools”; events sometimes require approval.
- **Progression:** per-call approve → **Always allow** upgrade → **YOLO mode** upgrade (auto tools *and* reckless ship — **upgrade, not a repeat button**).
- **Shipped today:** `multi_agent`, `kick_agent`; `yolo_merge` is still an **action button** — migrate to upgrade per design.
- **Money (here):** `pro_plan` / `team_plan` — tokens up, $/s drain, “scale” fantasy.

### 4. Min–late — reliability crisis and review theater

- **Bug strategy:** process — humans slow you down; AI review speeds you up and makes bugs worse.
- **Player role:** “reverse centaur” — you exist for review/approval theater, not typing.
- **Crisis 1:** after launch, **uptime** drops with bugs (honest coupling).
- **Mandatory code review:** fewer bugs, less LOC/s.
- **AI code review:** restores LOC/s, large bug multiplier — **crisis 2**.
- **Retune note:** today `code_review` / `ai_review` unlock earlier than this chapter; move `unlockAt` / gates to match.

### 5. Late / end — status page, decoupling, nines

- **Bug strategy:** stop pretending bugs affect the number customers see; convert bugs into **nines**.
- **Player role:** metric manager — bug bounty, auto bounty, SLA purchases, nines counter grind.
- **Revamp status page:** `nines_tracking` — reliability managed independently of real state.
- **Shipped today:** `revamp_status_page` → nines ladder → `auto_bug_bounty` / enhanced → `chaos_engineering`.
- **End:** nines as main number-go-up (e.g. game ends at 999,999,999 .. nine nines); this is kind of a credits sequence, with increasingly absurd news ticker items basically. (unless we can think of something better)

---

## Launch vs money (cheat sheet)

| | Launch | Money (`pro_plan` / `team_plan`) |
| - | ------ | -------------------------------- |
| **Fantasy** | We deployed; production exists | We pay for tokens/API at scale |
| **UI** | Uptime %, hype | $ balance, $/s |
| **Economy** | Revenue formula *can* run | `enablesMoney` — costs and income matter |
| **When (target)** | Early mid | Mid (with MCP / paid-model era) |

---

## Approval / chat blocking (target behavior)

When an approval event fires:

1. Stream the AI line (existing `chatBusyUntil` from `appendLog` / `streamingDurationMs`).
2. Hold the prompt until the player clicks **Approve** or **Deny** (optional fixed ms on click so the gate isn’t instant).
3. **Always allow** / **YOLO** upgrades skip or auto-resolve step 2.

Implementation lives in game code + events/actions YAML; this doc only pins the intent.

---

## Debug: visualize flow from data

In dev, open `/debug` for an index, or jump directly:

- `/debug` — home / links to all views
- `/debug/phases` — unlock tables + target chapters from YAML/constants
- `/debug/trace` — bot sim timeline (deduped actions, upgrade heatmap)
- `/debug/graph` — upgrade `requires:` DAG from `upgrades.yaml`

---

## Current vs target (living checklist)

- [ ] Move **CI/CD** earlier if chapter 2 should own “CI handles bugs.”
- [ ] Add **MCP / approvals** (upgrade + events + busy gate).
- [ ] Replace **yolo_merge** button with **YOLO** upgrade; remove or repurpose action.
- [ ] Move **code_review** / **ai_review** later for min–late crisis arc.
- [x] Align **flavor** `phases:` with mechanical chapters (`phases.ts`, not LOC).
- [ ] Revisit **launch** LOC band (today 10k) vs early-mid pacing.
