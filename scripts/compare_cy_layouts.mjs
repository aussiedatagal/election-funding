/**
 * Screenshot each built-in Cytoscape layout.
 * Run: npm run compare-cy-layouts  (dev server required)
 */
import { mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { CY_LAYOUT_NAMES } from '../src/lib/networkGraphCyLayout.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../benchmark/cy-layouts');
const DEV_PORT = process.env.DEV_PORT || '5178';

mkdirSync(OUT_DIR, { recursive: true });

for (const layout of CY_LAYOUT_NAMES) {
  const url = `http://localhost:${DEV_PORT}/?layout=${layout}&v=${Date.now()}`;
  const shotPath = join(OUT_DIR, `${layout}.png`);
  console.log(`Capturing ${layout}…`);
  const result = spawnSync('npx', [
    'playwright@1.57.0', 'screenshot',
    '--browser', 'chromium',
    '--viewport-size', '1400,900',
    '--wait-for-timeout', '3500',
    url,
    shotPath,
  ], { stdio: 'inherit', cwd: join(__dirname, '..') });

  if (result.status !== 0) {
    console.error(`Failed: ${layout}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\nSaved ${CY_LAYOUT_NAMES.length} screenshots to ${OUT_DIR}`);
