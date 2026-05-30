# Data Files

This directory contains all hardcoded game data extracted from `Game.tsx`.

## Files

### `generators.json`
Array of generator definitions (`GenDef[]`). Each generator has: `id`, `name`, `desc`, `locPerSec`, `bugsPerSec`, `fixPerSec`, `baseCost`, `costMult`, `unlockAt`.

### `upgrades.json`
Array of upgrade definitions (`UpgDef[]`). Each upgrade has: `id`, `name`, `desc`, `cost`, `unlockAt`, and optional fields: `clickMult`, `globalMult`, `bugMult`, `reviewLocMult`, `reviewBugMult`, `requires` (string[]), `requiresLaunch` (boolean).

### `events.json`
Array of event definitions (`EventDef[]`). Each event has: `id`, `text`, `type` (`"info" | "bad" | "event" | "news"`), `minLoc`, and optional fields: `locMult`, `locDelta`, `bugDelta`, `freeAccountsDelta`, `requiresLaunch`, `requires` (string[]).

Event `text` fields support:
- `\n` for line breaks between messages
- Lines starting with `>` are rendered as user messages in the conversation log

### `milestones.json`
Array of `{ loc: number, text: string }`. Each milestone fires once when `totalLoc` reaches the given `loc` value.

### `messages.json`
All random message pool arrays:
- `pasteErrorGood` — positive responses when pasting an error
- `pasteErrorBad` — negative/worsening responses when pasting an error
- `pasteErrorNeutral` — neutral/deflecting responses when pasting an error
- `agentMsgs` — messages when kicking off an agent
- `yoloMergeMsgs` — messages when yolo merging
- `clearContextMsgs` — messages when clearing context
- `newAccountMsgs` — messages when creating a new free account (use `tmpl()` with `{ n }`)
- `testMessages` — messages after running tests (use `tmpl()` with `{ n: fixed }`)

### `ui.json`
- `phases` — array of 5 phase description strings shown under the title
- `spinFrames` — braille spinner animation frames
- `spinVerbs` — rotating verbs shown in the streaming indicator

## Template Utility (`../lib/tmpl.ts`)

The `tmpl()` function provides minimal string interpolation for the message pools that previously used functions.

### Syntax

- `{{var}}` — substitute the value of `var` from the vars object (stringified)
- `{{var|suffix}}` — append `suffix` only when `vars[var] !== 1` (for plurals)

### Examples

```typescript
tmpl("{{n}} bug{{n|s}} fixed", { n: 3 })  // → "3 bugs fixed"
tmpl("{{n}} bug{{n|s}} fixed", { n: 1 })  // → "1 bug fixed"
tmpl("account{{n|s}}", { n: 4 })          // → "accounts"
tmpl("That's {{n}} emails.", { n: 5 })    // → "That's 5 emails."
```

Missing keys produce `""`. All values are stringified with `String()`.

### Usage in Game.tsx

```typescript
// newAccountMsgs — pass current account count
tmpl(pick(MESSAGES.newAccountMsgs), { n })

// testMessages — pass number of bugs fixed
tmpl(pick(MESSAGES.testMessages), { n: fixed })
```

## `pick()` Helper

```typescript
pick(arr)  // returns a random element from any array
```

Used to replace the verbose `arr[Math.floor(Math.random() * arr.length)]` pattern throughout the codebase.
