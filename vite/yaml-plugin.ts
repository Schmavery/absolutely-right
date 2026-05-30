import path from 'node:path';
import type { Plugin } from 'vite';
import yaml from 'yaml';
import { validateGameDataDirIfStale } from './validate-data';

/**
 * Tiny Vite plugin that lets `import data from './foo.yaml'` work.
 * Files ending in .yaml or .yml are parsed at build time and emitted as a JS
 * module exporting the parsed value as `default`. No runtime YAML parser ships
 * to the browser.
 *
 * Imports under `data/` also run Zod validation (see `validate-data.ts`).
 */
export function yamlPlugin(): Plugin {
  return {
    name: 'yaml-loader',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.ya?ml(\?|$)/.test(id)) return null;
      const cleanId = id.split('?')[0]!;
      if (/\/data\//.test(cleanId) || cleanId.includes(`${path.sep}data${path.sep}`)) {
        validateGameDataDirIfStale(path.dirname(cleanId));
      }
      const parsed = yaml.parse(code);
      return {
        code: `export default ${JSON.stringify(parsed)};`,
        map: null,
      };
    },
  };
}
