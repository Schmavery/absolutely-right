import Handlebars from 'handlebars';

/**
 * Game-dialogue templating, backed by Handlebars.
 *
 * Authors of `data/*.yaml` content can use the full Handlebars surface:
 *
 *   {{var}}                      variable interpolation
 *   {{plural n "bug" "bugs"}}    custom helper — picks a form by count
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
  return arr[Math.floor(Math.random() * arr.length)];
}
