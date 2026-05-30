/**
 * tmpl — minimal string template utility
 *
 * Conventions:
 *   {{var}}         substitute the value of `var` from the vars object
 *   {{var|suffix}}  append `suffix` only when vars[var] !== 1  (plurals)
 *
 * Examples:
 *   tmpl("{{n}} bug{{n|s}} fixed", { n: 3 })  →  "3 bugs fixed"
 *   tmpl("{{n}} bug{{n|s}} fixed", { n: 1 })  →  "1 bug fixed"
 *   tmpl("account{{n|s}}", { n: 4 })          →  "accounts"
 *
 * All values are stringified with String(). Missing keys produce "".
 */
export function tmpl(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{\{(\w+)(?:\|([^}]*))?\}\}/g, (_, key, suffix) => {
    const val = vars[key];
    if (val === undefined) return '';
    if (suffix !== undefined) return val !== 1 ? suffix : '';
    return String(val);
  });
}

/** Pick a random element from an array. */
export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
