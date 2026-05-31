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
| 2 | launched + (`pro_plan` / money **or** `multi_agent` **or** `mcp_tools`) | additional capacity online |
| 3 | `code_review` or `ai_review` | waiting on sign-off |
| 4 | `revamp_status_page` (`nines_tracking`) | no active incidents |

`mcp_tools` gates flavor index 2. Post-prompt MCP beats show an in-scroll card; manual Allow/Deny, `always_allow` (card then auto-allow + execute spinner), or `yolo_mode` (no beats/cards).

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
- **Progression:** per-call approve → **Always allow** (+2× bugs) → **YOLO mode** (+10× bugs, stacks — **upgrade, not a repeat button**).
- **Pricing:** shop `cost` rises along each narrative chain (MCP → crisis review → nines); later theater costs more than earlier recklessness.
- **Shipped today:** `multi_agent`, `kick_agent`, `mcp_tools` / `always_allow` / `yolo_mode` shop chain (no yolo button — upgrade only).
- **Money (here):** `pro_plan` / `team_plan` — tokens up, $/s drain, “scale” fantasy.

### 4. Min–late — reliability crisis and review theater

- **Bug strategy:** process — accountability theater, humans slow you down, meta-review fixes metrics but kills growth, AI review speeds you up and makes bugs worse.
- **Player role:** “reverse centaur” — you exist for review/approval theater, not typing.
- **Crisis 1:** after launch, **uptime** drops with bugs (honest coupling). Bug spawn scales **superlinearly** with generator stacks and LOC/s (`BUG_GENERATION` in `constants.ts`) so CI/tests cannot permanently zero it at scale.
- **Shop chain (uptime ≤ ~1 nine, post-MCP):**
  1. **Upside-down centaur policy** (`upside_down_centaur_policy`) — slide deck that you own what ships; **+15%** bugs.
  2. **Mandatory code review** (`code_review`) — fewer bugs, less LOC/s.
  3. **Mandatory code review review** (`code_review_review`) — review the reviewers; reliability recovers, growth stays low.
  4. **AI code review** (`ai_review`) — restores LOC/s, large bug multiplier — **crisis 2** → chapter 5.

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
3. **Always allow** auto-fires Allow after the card; **YOLO** skips cards entirely. Both use a **5s execute spinner** (`MCP.executeSpinnerMs`) before the ack line (no token streaming).

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

- [x] Move **CI/CD** earlier — chapter 2 (`cicd` post-launch unlock).
- [x] **MCP / approvals** — post-prompt beats, prompt block, Allow/Deny; `yolo_mode` suppresses.
- [x] Remove **yolo_merge** action; **yolo_mode** is upgrade-only (rates + flag).
- [x] Move **code_review** / **ai_review** later for min–late crisis arc.
- [x] Align **flavor** `phases:` with mechanical chapters (`phases.ts`, not LOC).
- [ ] Revisit **launch** LOC band (today 10k) vs early-mid pacing.
