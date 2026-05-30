import type { Plugin } from 'vite';
import yaml from 'yaml';

/**
 * Tiny Vite plugin that lets `import data from './foo.yaml'` work.
 * Files ending in .yaml or .yml are parsed at build time and emitted as a JS
 * module exporting the parsed value as `default`. No runtime YAML parser ships
 * to the browser.
 */
export function yamlPlugin(): Plugin {
  return {
    name: 'yaml-loader',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.ya?ml(\?|$)/.test(id)) return null;
      const parsed = yaml.parse(code);
      return {
        code: `export default ${JSON.stringify(parsed)};`,
        map: null,
      };
    },
  };
}
