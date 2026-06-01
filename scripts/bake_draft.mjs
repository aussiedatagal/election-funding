/**
 * Merges network-layout-draft.json into network-layout.json immediately.
 * Called by the Vite dev-server plugin after the browser saves a draft.
 * Preserves exact user positions — no donor re-spacing.
 * For cleanup/re-spacing run: npm run process-draft
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import fundingData from '../src/data/funding.json' with { type: 'json' };
import { buildGraphFromFundingData, centerLayoutPositions } from '../src/lib/networkGraphBuild.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRAFT_PATH   = join(__dirname, '../src/data/network-layout-draft.json');
const CURATED_PATH = join(__dirname, '../src/data/network-layout-curated.json');
const LAYOUT_PATH  = join(__dirname, '../src/data/network-layout.json');

const draft    = JSON.parse(readFileSync(DRAFT_PATH, 'utf8'));
const existing = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'));

// Fill any nodes not in the draft from the existing saved layout
const merged = { ...existing.positions, ...draft };

// Center so the graph loads symmetrically
const graph = buildGraphFromFundingData(fundingData.combined);
const positions = centerLayoutPositions(merged);

// Update curated (source of truth for process-draft)
writeFileSync(CURATED_PATH, `${JSON.stringify(positions, null, 2)}\n`);

// Write the full layout payload, preserving metadata from the existing file
const payload = {
  ...existing,
  positions,
  metrics: { ...(existing.metrics ?? {}), source: 'draft' },
  nodeNames: graph.nodeNames,
};
writeFileSync(LAYOUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`bake_draft: wrote ${Object.keys(positions).length} positions`);
