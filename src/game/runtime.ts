/**
 * Runtime hooks that everything in the game model funnels through:
 *
 *   - `now()`     — wall-clock timestamp (ms). Used for cooldowns and the
 *                   agent buff expiry.
 *   - `random()`  — uniform [0, 1). Used by event sampling, action variance,
 *                   message-pool selection, and `{{rand}}` in templates.
 *
 * In normal play these are just thin wrappers around `Date.now` and
 * `Math.random`. The simulator in `src/sim/` swaps them out via
 * `setClock` / `setRandom` so a deterministic seeded RNG and a virtual
 * clock can drive the same reducers React drives — no separate model.
 */

let _now: () => number = () => Date.now();
let _random: () => number = () => Math.random();

export function now(): number {
  return _now();
}

export function random(): number {
  return _random();
}

export function setClock(fn: () => number): void {
  _now = fn;
}

export function setRandom(fn: () => number): void {
  _random = fn;
}

export function resetClock(): void {
  _now = () => Date.now();
}

export function resetRandom(): void {
  _random = () => Math.random();
}
