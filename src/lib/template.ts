import Handlebars from 'handlebars';
import { random } from '../game/runtime';

/**
 * Game-dialogue templating, backed by Handlebars.
 *
 * Authors of `data/*.yaml` content can use the full Handlebars surface:
 *
 *   {{var}}                      variable interpolation
 *   {{plural n "bug" "bugs"}}    custom helper — picks a form by count
 *   {{rand 2 9}}                 random integer in [min, max] (inclusive)
 *   {{pick "a" "b" "c"}}         random choice among string literals
 *   {{hex 8}}                    random hex string (for ids, tokens)
 *   {{#if launched}}…{{/if}}     conditional sections
 *
 * HTML escaping is disabled because the strings are rendered into a
 * pre-styled log panel, not into innerHTML.
 *
 * Compiled templates are cached by source string so reused dialogue lines
 * don't recompile on every render.
 */

const handlebars = Handlebars.create();

handlebars.registerHelper('plural', (n: unknown, singular: string, plural: string): string => {
  return n === 1 ? singular : plural;
});

handlebars.registerHelper('rand', (min: unknown, max: unknown): number => {
  const lo = Math.ceil(Number(min));
  const hi = Math.floor(Number(max));
  return Math.floor(random() * (hi - lo + 1)) + lo;
});

/** Strip Handlebars' trailing `options` argument from helper param lists. */
function helperChoices(args: unknown[]): string[] {
  const last = args[args.length - 1];
  const n =
    last != null && typeof last === 'object' && 'hash' in last ? args.length - 1 : args.length;
  return args.slice(0, n).map(String);
}

/** Random literal: `{{pick "main" "staging"}}`. */
handlebars.registerHelper('pick', (...args: unknown[]): string => {
  const choices = helperChoices(args);
  if (choices.length === 0) return '';
  return choices[Math.floor(random() * choices.length)]!;
});

const HEX = '0123456789abcdef';

/** Random hex: `{{hex 6}}` → six characters (for issue ids, short tokens). */
handlebars.registerHelper('hex', (len: unknown): string => {
  const n = Math.max(1, Math.floor(Number(len)));
  let out = '';
  for (let i = 0; i < n; i++) out += HEX[Math.floor(random() * 16)]!;
  return out;
});

const cache = new Map<string, HandlebarsTemplateDelegate>();

function compile(source: string): HandlebarsTemplateDelegate {
  let fn = cache.get(source);
  if (!fn) {
    fn = handlebars.compile(source, { noEscape: true });
    cache.set(source, fn);
  }
  return fn;
}

export function render(source: string, vars: Record<string, unknown> = {}): string {
  return compile(source)(vars);
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(random() * arr.length)];
}
