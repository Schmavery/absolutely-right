import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';
import { validateGameDataDir } from '../vite/validate-data';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data');

it('validates all game YAML', () => {
  validateGameDataDir(dataDir);
});
