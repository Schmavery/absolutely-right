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

`mcp_tools` gates flavor index 2. Post-prompt MCP beats use an approval card (manual / always-allow) or go straight to a `tool` log card in YOLO; approved calls persist as `tool` entries in the log.

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
- **Investor overlay (target, same chapter):** runs **alongside** MCP/agents —
  see [Investor overlay](#investor-overlay-target) below. Does not replace the
  bugs/uptime → review → nines spine.
- **Shipped today (economy UI):** `pro_plan` / `team_plan` tick a **money**
  balance and show **hype** — target replaces that with burn + buzz meter.

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

## Investor overlay (target)

Satire: big AI spend never gets “repaid”; each **raise** adds **McMinis**
(hardware), not solvency. This layer is **parallel** to the bugs arc (launch →
uptime → review crises → nines) — same mid/late chapters, extra meters and
actions.

### Resources (target HUD)

| Surface | Meaning | Player wants it… |
| ------- | ------- | ---------------- |
| **Burn rate** (`$X/s`) | Credibility / scale signal from **subs** (and later per-McMini load). Higher unlocks the **next** raise. | **High** (not a tax) |
| **McMinis** | Deployed **Lemon McMini** boxes — finite slots; assign each to a lane. | **More** after raises |
| **Buzz meter** | “Ready to raise” — fills from growth/marketing; **resets to 0** on raise. **No decay.** | **Full** when raising |
| *(hidden)* | Optional `fundingRound` flag for shop gates | — |

**Remove** shipped hype counter and money balance (UI + passive tick); burn rate
+ buzz meter replace them. (Still in code today — see cheat sheet below.)

### Subs vs raises (ordering)

- **Subs** (`pro_plan`, `team_plan`, …): bought in the **LOC shop** (existing
  `cost` / `requires` / `unlockAt`). Each tier adds **token headroom** and
  **`moneyCostPerSec`** → contributes to **burn rate**.
- **Subs are not raise-granted** — burn from subs **gates** raises; you must
  buy subs first to look “big enough.”
- **Raise** (action): requires **full buzz meter** + **burn ≥ round minimum**.
  On success: meter → 0, `fundingRound++`, grant **+McMinis** (not cash, not
  subs). Copy carries round size; mechanics add capacity + higher burn floor
  for later rounds.

Anti-spam on subs: **one row per tier in the upgrade DAG**, LOC price, unlock
bands — same as today, not unlimited burn shopping.

### McMinis + lanes (target)

**UI resource:** **McMini** count (McDonald’s × Mac mini — see `README.md`
canon). Player assigns each deployed McMini to a **lane**; lanes consume
**tokens/s**. Do **not** surface “molty” (or similar) as a resource label —
lobster / molt / Pinchbot wording lives in **copy only** (actions, news,
`purchaseMsg`, kick/deploy lines).

Real-world joke (research notes only — see `INSPIRATION.md`): Mac minis
hosting always-on lobster agents. **In-game** use **Lobstagram** / molt / McMini
only; do not name real projects in shipped copy. Raises grant **boxes**; subs
raise **burn**; assignment spends **tokens**.

| Lane | Output |
| ---- | ------ |
| **Code** | LOC (replaces/supersedes buff-only `kick_agent`) |
| **Growth** | Buzz meter (Lobstagram-style marketing in flavor text) |
| **Tests** | Test / CI leverage |
| **Accounts** (later) | `freeAccounts` / rotation fantasy |

`multi_agent` → more McMinis and/or code throughput, not only 2× a 30s buff.

**Copy voice (not HUD):** “molt”, “new shell”, optional deprecated **Pinchbot**
(or “before the molt”) — never real product names. **Lobstagram** for growth
beats; lobster memes without a creature resource.

### Token actions (target)

Mid-game needs more **token sinks** than prompt/tests: social beats, meter
nudges, MCP — in addition to allocation. Evolve the action bar by phase flags.

### Vs bugs arc (timing)

| Bugs spine | Investor overlay |
| ---------- | ---------------- |
| Ch 2 launch, uptime honest | Burn label appears; meter teased or live |
| Ch 3 MCP, agents, subs | McMinis, lane allocation, subs → burn, raises |
| Ch 4 review theater | Competes for tokens / McMini lanes vs process |
| Ch 5 nines decoupling | Burn/meter fade in importance |

Flavor subtitles (`ui.yaml` / `getPhase`) stay vague; fundraise is **`fundingRound`**, not phase index.

---

## Launch vs economy UI (shipped vs target)

| | Launch (shipped + target) | Mid subs (`pro_plan` / `team_plan`) |
| - | ------------------------- | ------------------------------------- |
| **Fantasy** | We deployed; production exists | We pay for API at scale; investors love spend |
| **Shipped UI** | Uptime %, **hype** number | **$ balance**, $/s |
| **Target UI** | Uptime % | **Burn rate: $X/s**, **buzz meter** |
| **Shipped economy** | Revenue formula *can* run; money off until `enablesMoney` | Balance ticks; $/s ≈ cost − tiny LOC revenue |
| **Target economy** | — | Burn from subs **gates** raises; meter **gates** raises; LOC buys subs |

---

## Approval / chat blocking (target behavior)

When an approval event fires:

1. Stream the AI line (existing `chatBusyUntil` from `appendLog` / `streamingDurationMs`).
2. Hold the prompt until the player clicks **Approve** or **Deny** (optional fixed ms on click so the gate isn’t instant).
3. **Always allow** upgrade shows **deny / allow / always allow** on every card. **Always allow** on unsafe is one-time (same as allow). Then a **5s execute spinner** before a **`tool` log card**. **Safe allow** adds LOC; **safe deny** is flavor only. **Unsafe allow** — **50% LOC** plus leak/ack lines. **Unsafe deny** trims bugs. **YOLO** — tool cards only (safe still earns LOC).

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
- [x] **MCP / approvals** — post-prompt beats, prompt block, Allow/Deny; approved calls as `tool` log cards; `yolo_mode` skips approval card.
- [x] Remove **yolo_merge** action; **yolo_mode** is upgrade-only (rates + flag).
- [x] Move **code_review** / **ai_review** later for min–late crisis arc.
- [x] Align **flavor** `phases:` with mechanical chapters (`phases.ts`, not LOC).
- [ ] Revisit **launch** LOC band (today 10k) vs early-mid pacing.
- [x] **Investor overlay:** burn rate HUD (good number), buzz meter (no decay), raise → **McMinis**.
- [x] **Subs → burn** gates raises; subs stay **LOC-purchased**, not raise-granted.
- [x] **McMinis:** lane allocation (code/growth/tests); `kick_agent` hidden once McMinis deployed.
- [ ] **Copy:** Lobstagram / molt / Pinchbot flavor pass in more YAML (actions started).
- [x] **Remove** shipped **hype** and **money balance**; burn-only $/s from subs.
