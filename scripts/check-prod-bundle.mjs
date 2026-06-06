/**
 * Fail the build if dev-only planner/trace modules appear in production assets.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const ASSETS = join(DIST, 'assets');

/** Strings that only appear in src/debug and debug UI — not in shipped game code. */
const FORBIDDEN = [
  'planShortestPath',
  'metaPlanShortestPath',
  'solveCruiseByEstimate',
  'runOptSuite',
  'useTraceSim',
  'PlannerDebug',
  'TraceDebug',
  'debug-entry',
];

function collectJsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) out.push(...collectJsFiles(path));
    else if (name.name.endsWith('.js')) out.push(path);
  }
  return out;
}

let assetsDir;
try {
  assetsDir = ASSETS;
  readdirSync(assetsDir);
} catch {
  console.error('check-prod-bundle: dist/assets not found — run vite build first');
  process.exit(1);
}

const hits = [];
for (const file of collectJsFiles(assetsDir)) {
  const text = readFileSync(file, 'utf8');
  for (const needle of FORBIDDEN) {
    if (text.includes(needle)) {
      hits.push({ file, needle });
    }
  }
}

if (hits.length > 0) {
  console.error('Production bundle contains dev-only debug code:\n');
  for (const { file, needle } of hits) {
    console.error(`  ${needle} in ${file}`);
  }
  process.exit(1);
}

console.log('check-prod-bundle: ok (no debug planner/trace modules in dist)');
