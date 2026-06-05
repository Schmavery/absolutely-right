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
| `mcp.yaml`        | `McpCopy`                          | MCP `tools` (+ `safe` flag) + allow / deny     |
| `ui.yaml`         | `{ phases, spinFrames, spinVerbs }`| UI strings and animation frames                |

The TypeScript shapes live in `src/types.ts`. `UpgDef` in particular has a
rich set of optional effect fields that drive the game balance (token bonuses,
review multipliers, auto-bug-drain rates, etc.) — see the inline comments
there for combine semantics (multiplicative, additive, last-wins, max-wins).
`ActionDef` colocates everything per-action (token cost, cooldown, event
probability, formula constants, message pools) so retuning a single action
doesn't require touching code.

**Phase design:** see `PHASES.md` (mechanical chapters, flavor indices, and the
target **investor overlay** — burn rate, buzz meter, LOC-bought subs, raises
that grant **McMinis**). In dev: `/debug` (index), `/debug/phases`,
`/debug/trace`, `/debug/graph`.

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

`mcp.yaml` defines a flat `tools` list: each entry has `id`, `safe: true|false`,
and typed fields per `tool` kind. `always_allow` auto-approves only `safe: true`;
others still show Allow/Deny. Display text is built in `formatMcpToolCall`.
Each tool has `onAllow` (log line after approval) and, when `safe: false`, `onDeny`.
Unsafe allows also pick a line from top-level `unsafeAllowLeakAck` (oblivious “code leak” aside).
**Always allow** upgrade adds a third button on every card (`deny` / `allow` / `always allow`). Unsafe **always allow** is one-time (same as allow); only safe tools are policy-covered. **Safe allow** adds LOC (`safeAllowLocMin` + fraction of `totalLoc`). **Safe deny** — flavor only (missed LOC). **Unsafe allow** — **50% LOC** loss plus ack/leak lines. **Unsafe deny** — trims ~12% of bugs. **YOLO** — tool cards only (safe still earns LOC silently).
`Read` tools may include `snippet` (fake file body). `Shell` may use `note` for stderr-style
stats. `Write` uses `preview`.

Template helpers in any string field (expanded when the beat fires):

- `{{rand min max}}` — integer in range
- `{{pick "a" "b" "c"}}` — random literal
- `{{hex n}}` — `n` hex characters

### MCP approval — real-world discourse (research)

Game beats should feel like the warnings people actually post about **Always allow**, **YOLO / auto-run**, and **MCP tool approval** — not generic “hacker” tropes alone.

| Theme | What people say | In `mcp.yaml` (examples) |
| ----- | ---------------- | --------------------------- |
| Always allow removes the safety gate | Elastic, Praetorian, DataDome: with auto-run, poisoned tools or injected issue text can exfil or run SSH workflows **with no prompt** | `read_env_local`, `shell_call_home`, upgrade copy in `always_allow` |
| Read-only + Always allow still chains | Praetorian: “safe” read tools become zero-click when combined with a malicious server | safe `Read` / `CallMcpTool` vs unsafe exfil reads |
| YOLO / denylist is not a boundary | [Backslash / The Register (Jul 2025)](https://www.backslash.security/blog/cursor-ai-security-flaw-autorun-denylist): base64, subshells, write-then-exec bypass string denylists | `shell_base64_decode_zsh` |
| Prompt injection in repo context | Same research: README, rules, comments can steer the agent without a web page | `read_rules_injection` |
| Persistence | OpenClaw CVE writeups (GHSA): symlinked workspace file → `/etc/crontab`, `~/.bashrc`, `authorized_keys` | `shell_crontab_beacon`, `write_bashrc_hook`, `read_ssh_key` |
| Supply chain | `curl \| sh`, fake install scripts | `shell_curl_pipe_sh` |
| MCP spec / OWASP | Tool poisoning: malicious text in **tool responses** treated as trusted context | `read_mcp_tool_definition_poisoned` |
| Allowlists ≠ security | Cursor docs: `permissions.json` / `mcpAllowlist` is convenience, not a guarantee | fictional `write_permissions_wildcard` |

Sources worth rereading when adding tools: [Elastic MCP attack/defense](https://www.elastic.co/security-labs/mcp-tools-attack-defense-recommendations), [OWASP MCP Tool Poisoning](https://owasp.org/www-community/attacks/MCP_Tool_Poisoning), [VS Code agent tools / yolo](https://code.visualstudio.com/docs/copilot/agents/agent-tools), [Cursor permissions.json](https://cursor.com/docs/reference/permissions).

**Watch out for unquoted colons.** A value like `Token limits: improved.`
will be misparsed as a nested mapping. Quote it (`"…"`), use a literal
block scalar (`|-`), or restructure.

### Fictional names (in-game copy)

All shipped YAML (`events`, `news`, `milestones`, `generators`, `actions`,
`upgrades`) uses this canon for **AI vendors and consumer brands** — not real
company names or trademarked AI product names (Copilot, Recall, etc.).
`INSPIRATION.md` may cite real names as research notes; translate before
adding to game data. **Do not** use real personal-agent project names in shipped
YAML or UI copy (e.g. Clawdbot, OpenClaw, Moltbook, Moltbot) — see lobster-agent row below.

**Non-AI code tech is fair game** — use real names (Kubernetes, React,
ESLint, TypeScript, Docker, npm, …) in jokes about stack choices.

| Real-ish target | In-game |
| --------------- | ------- |
| Google | **Gnoogle** |
| Microsoft | **MicroSith** — products e.g. **Deskmate**, **Screen Memory** |
| GitHub / MS coding assistant | **CodePilot** (generator `copilot`; not “Copilot”) |
| OpenAI / ChatGPT | **OpenGPT** |
| Anthropic / Claude | **Claudius Labs** / model **Claudius** (never Claude) |
| Meta / Facebook | **Facelift** |
| Apple | **Lemon** (wrong fruit; “a lemon” = defective product — for the name only; do not spell that out in headlines) |
| Mac mini hoarding (agent-hosting meme) | **McMini** — UI resource for deployable boxes (McDonald’s × Mac mini pun). Assign each to a lane; do not label creatures “molty” in HUD |
| Agent-only social feed (Instagram parody) | **Lobstagram** — growth lane + `lobstagram_post`; not Moltbook |
| Personal lobster agent (research in `INSPIRATION.md` only) | **Pinchbot** in copy; “molt”, “new shell”. Never real product names. **Claudius** = model; capacity = **McMini** + lane |
| Amazon / AWS / CodeWhisper | **Amazin** / **Amazin Cloud** / **CodeMurmur** |
| X / Grok | **Xitter** / **Squok** |
| Hugging Face | **SnuggleHub** |
| Stack Overflow | **StackUnderflow** |
| Stability AI | **Plateau AI** |
| Replit | **Ripplet** |
| Cursor | **Cursive** |
| Windsurf | **Kitesurfer** |
| Reddit | **ReadIt** (communities: **subreadits**) |
| LinkedIn | **SloppedIn** |
| Air Canada | **MapleWings** |
| Chevrolet | **Bowtie Motors** (e.g. Tahobo) |
| Sam Altman (persona) | **Salmon Altman** |
| Perplexity | **Pursuelity** |
| DeepSeek | **SteepSeek** |
| Mistral | **Mistrale** |
| Nvidia | **Envideo** |
| Character.ai | **Charactr** |

Generator **display names** (ids stay stable for saves): CodePilot, FreeChat,
Claudius, Facelift Orchestrator, etc.

### Identifiers

Game objects whose state needs a stable cross-reference — generators
(purchase counts), upgrades (`requires:`, owned set, on-purchase effects),
actions (cooldown keys, code-side dispatch) — carry an explicit `id`.
Events do **not** carry ids: dedup is by the first non-empty line of `text`
(slugged, truncated to 60 chars). Each gated event is skipped until every
other eligible line at the current `totalLoc` has fired once; then the gated
pool can repeat. Selection is weighted toward higher `minLoc` within the pool.

Action message pools and MCP approval lines use the same exhaust-then-repeat
scheme via `usedEventIds` (see `src/lib/messageKey.ts`).

**News** (`news.yaml`) uses explicit `id` fields and fires at most once per
save (`usedNewsIds`). Headlines never enter the early repeat pool. Prefer
satirical `Industry:` beats here rather than in `events.yaml` — keep random
dialogue focused on the coding session, not milestone LOC counts or upgrade
mechanics (those have `milestones.yaml` / `actions.yaml`).

Milestones are keyed by their `loc` threshold for the same reason — the
unlock condition is the identity.

### Upgrade pricing

On each narrative chain in `data/PHASES.md`, later upgrades should have a higher
shop `cost` than earlier ones on the same chain (build checks `NARRATIVE_SPINE`
and branch spines in `vite/validate-data.ts`). `unlockAt` is separate — it
controls when the row appears, not how punishing the purchase is.

### Feature flags

Upgrades can grant **feature flags** while owned:

```yaml
flags:
  - nines_tracking
unlockMinUptimeNines: 4          # shop unlock when uptime nines ≥ this (optional)
unlockMaxUptimeNines: 1          # shop unlock when uptime nines ≤ this — crisis gate (optional)
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
