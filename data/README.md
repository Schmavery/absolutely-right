# Game content

All game-tunable content lives in this directory as YAML. The Vite build
parses these files at compile time (see `vite/yaml-plugin.ts`) and emits
plain JS modules — there is **no** YAML parser shipped to the browser.

## Files

| file              | shape                              | what it is                                     |
| ----------------- | ---------------------------------- | ---------------------------------------------- |
| `generators.yaml` | `GenDef[]`                         | purchasable LOC/bug/fix sources                |
| `upgrades.yaml`   | `UpgDef[]`                         | one-shot purchases — effects + flavor in one   |
| `events.yaml`     | `EventDef[]`                       | random AI dialogue events fired during play    |
| `milestones.yaml` | `{ loc, text }[]`                  | one-shot observer-voice messages at LOC totals |
| `messages.yaml`   | `Record<string, string[]>`         | random message variants per player action      |
| `ui.yaml`         | `{ phases, spinFrames, spinVerbs }` | UI strings and animation frames               |

The TypeScript shapes live in `src/types.ts`. `UpgDef` in particular has a
rich set of optional effect fields that drive the game balance (token bonuses,
review multipliers, auto-bug-drain rates, etc.) — see the inline comments
there for combine semantics (multiplicative, additive, last-wins, max-wins).
Cross-cutting balance numbers live in `src/game/constants.ts`.

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

### Identifiers

Game objects whose state needs a stable cross-reference — generators
(purchase counts), upgrades (`requires:`, owned set, on-purchase effects)
— carry an explicit `id`. Events do **not**: their only stateful role is
"don't repeat this one until the fresh pool runs out", and that dedup key
is derived automatically from the first non-empty line of `text` (slugged,
truncated to 60 chars). Editing an event's first line resets dedup for
that event, which matches the authoring intent.

Milestones are keyed by their `loc` threshold for the same reason — the
unlock condition is the identity.

## Templating

`messages.yaml` and `events.yaml` strings are rendered through Handlebars
(see `src/lib/template.ts`). The full Handlebars surface is available; in
particular:

- `{{var}}` — variable substitution
- `{{plural n "bug" "bugs"}}` — picks the singular form when `n === 1`
- `{{#if cond}}…{{else}}…{{/if}}` — conditional sections

HTML escaping is disabled because text is rendered into a styled log
panel, never `innerHTML`.

Add new helpers in `src/lib/template.ts` and document them here.
