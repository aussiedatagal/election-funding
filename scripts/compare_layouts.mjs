/**
 * Benchmark layout presets: scores each config and saves screenshots.
 * Run: npm run compare-layouts
 */
import { mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import fundingData from '../src/data/funding.json' with { type: 'json' };
import { buildGraphFromFundingData } from '../src/lib/networkGraphBuild.js';
import { buildClusterLayout } from '../src/lib/networkGraphClusterLayout.js';
import { LAYOUT_PRESETS, DEFAULT_LAYOUT_PRESET } from '../src/lib/networkGraphLayoutConfig.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEV_PORT = process.env.DEV_PORT || '5178';
const OUT_DIR = join(__dirname, '../benchmark/layouts');
const LAYOUT_PATH = join(__dirname, '../src/data/network-layout.json');

mkdirSync(OUT_DIR, { recursive: true });

const graph = buildGraphFromFundingData(fundingData.combined);
const results = [];

for (const preset of Object.values(LAYOUT_PRESETS)) {
  const layout = buildClusterLayout({
    nodeById: graph.nodeById,
    graphLinks: graph.graphLinks,
    cyElements: graph.cyElements,
    preset,
  });

  const payload = {
    version: 3,
    description: `Cluster layout preset: ${preset.id}`,
    layout: 'cluster',
    presetId: preset.id,
    view: layout.view,
    simEdges: layout.simEdges,
    metrics: layout.metrics,
    nodeNames: graph.nodeNames,
    positions: layout.positions,
  };

  writeFileSync(LAYOUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);

  const shotPath = join(OUT_DIR, `${preset.id}.png`);
  const url = `http://localhost:${DEV_PORT}/?v=${Date.now()}`;
  spawnSync('npx', [
    'playwright@1.57.0', 'screenshot',
    '--browser', 'chromium',
    '--viewport-size', '1400,900',
    '--wait-for-timeout', '4500',
    url,
    shotPath,
  ], { stdio: 'inherit', cwd: join(__dirname, '..') });

  results.push({ id: preset.id, ...layout.metrics, view: layout.view });
  console.log(`${preset.id}: score ${layout.metrics.score.toFixed(1)}`, layout.metrics);
}

results.sort((a, b) => b.score - a.score);
writeFileSync(join(OUT_DIR, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);

const viable = results.filter(r => r.offScreen === 0);
const winner = (viable.length ? viable : results)[0];
console.log(`\nRecommended: ${winner.id} (score ${winner.score.toFixed(1)}, offScreen parties ${winner.offScreen})`);
console.log(`Default preset remains "${DEFAULT_LAYOUT_PRESET}" — run npm run generate-layout to apply.`);
