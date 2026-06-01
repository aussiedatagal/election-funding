/**
 * Export current node positions from the running app (?edit=1 to drag nodes first).
 * Run: npm run snapshot-layout
 */
import { writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fundingData from '../src/data/funding.json' with { type: 'json' };
import { buildGraphFromFundingData } from '../src/lib/networkGraphBuild.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '../src/data/network-layout.json');
const DEV_PORT = process.env.DEV_PORT || '5178';

const url = `http://localhost:${DEV_PORT}/?layout=semantic&edit=1`;
const result = spawnSync('npx', [
  'playwright@1.57.0', 'eval',
  url,
  `JSON.stringify(await page.evaluate(() => window.__exportLayout?.()))`,
], { encoding: 'utf8', cwd: join(__dirname, '..') });

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(1);
}

const positions = JSON.parse(result.stdout.trim());
if (!positions || typeof positions !== 'object') {
  console.error('No positions exported — is the dev server running?');
  process.exit(1);
}

const graph = buildGraphFromFundingData(fundingData.combined);
const payload = {
  version: 6,
  description: 'Hand-edited layout snapshot from browser',
  layout: 'manual',
  view: { fitTarget: 'all', fitPadding: 38, zoomBoost: 1.0 },
  nodeNames: graph.nodeNames,
  positions,
};

writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${Object.keys(positions).length} positions to ${OUT_PATH}`);
