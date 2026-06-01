/**
 * Takes network-layout-draft.json (saved from the browser editor) and produces
 * a cleaner layout by:
 *   1. Pinning party positions exactly as the user placed them
 *   2. Re-placing single-party donors in evenly-spaced arcs around their party
 *   3. Moving multi-party donors to the weighted centroid of their connected parties
 *   4. Running overlap resolution so no nodes touch
 *   5. Writing the result to network-layout-curated.json then regenerating network-layout.json
 *
 * Run: npm run process-draft
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';

import fundingData from '../src/data/funding.json' with { type: 'json' };
import { buildGraphFromFundingData, centerLayoutPositions } from '../src/lib/networkGraphBuild.js';
import {
  countLayoutOverlaps,
  donorRadius,
  partyHalfDiagonal,
  partyHalfSize,
  resolveBodyOverlaps,
} from '../src/lib/networkGraphLayoutUtils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRAFT_PATH  = join(__dirname, '../src/data/network-layout-draft.json');
const CURATED_PATH = join(__dirname, '../src/data/network-layout-curated.json');

if (!existsSync(DRAFT_PATH)) {
  console.error('network-layout-draft.json not found — save a layout from the browser editor first (?edit=1)');
  process.exit(1);
}

const draft = JSON.parse(readFileSync(DRAFT_PATH, 'utf8'));
const graph = buildGraphFromFundingData(fundingData.combined);
const { nodeById, graphLinks, cyElements } = graph;

const nodeDataById = new Map(
  cyElements.filter(el => el.group === 'nodes').map(el => [el.data.id, el.data])
);

// ── Build mutable body list ───────────────────────────────────────────────────

const bodies = [];
nodeById.forEach((node, id) => {
  const data = nodeDataById.get(String(id));
  const pos = draft[node.name] ?? { x: 0, y: 0 };
  if (node.type === 'party') {
    const { hw, hh } = partyHalfSize(data);
    bodies.push({ id, name: node.name, type: 'party', x: pos.x, y: pos.y, hw, hh, w: hw*2, h: hh*2 });
  } else {
    const r = donorRadius(data);
    bodies.push({ id, name: node.name, type: 'donor', x: pos.x, y: pos.y, r, hw: r, hh: r, w: r*2, h: r*2 });
  }
});

const partyById  = new Map(bodies.filter(b => b.type === 'party').map(b => [b.id, b]));
const pinnedIds  = new Set(bodies.filter(b => b.type === 'party').map(b => b.id));

// ── Donor → party link weights ────────────────────────────────────────────────

const linksByDonor = new Map();
for (const link of graphLinks) {
  const src = nodeById.get(link.source);
  const tgt = nodeById.get(link.target);
  if (src?.type !== 'donor' || tgt?.type !== 'party') continue;
  if (!linksByDonor.has(link.source)) linksByDonor.set(link.source, []);
  linksByDonor.get(link.source).push({ partyId: link.target, weight: Math.log1p(link.value) });
}

// ── Re-place donors ───────────────────────────────────────────────────────────

// Group donors by primary party (highest donation weight)
const donorsByPrimary = new Map();
for (const body of bodies.filter(b => b.type === 'donor')) {
  const links = linksByDonor.get(body.id) ?? [];
  if (!links.length) continue;
  const primary = links.reduce((a, b) => (a.weight > b.weight ? a : b)).partyId;
  if (!donorsByPrimary.has(primary)) donorsByPrimary.set(primary, []);
  donorsByPrimary.get(primary).push({ body, links });
}

for (const [partyId, donors] of donorsByPrimary) {
  const party = partyById.get(partyId);
  if (!party) continue;
  const pData = nodeDataById.get(String(partyId));
  const baseR = partyHalfDiagonal(pData) + 55;
  const n = donors.length;

  // Sort alphabetically for stable, predictable arcs
  donors.sort((a, b) => a.body.name.localeCompare(b.body.name));

  // Centroid of all parties (used to determine outward direction)
  let cx = 0, cy = 0, cnt = 0;
  partyById.forEach(p => { cx += p.x; cy += p.y; cnt++; });
  cx /= cnt; cy /= cnt;

  // Outward direction from centroid through this party
  let dx = party.x - cx, dy = party.y - cy;
  const dlen = Math.hypot(dx, dy) || 1;
  dx /= dlen; dy /= dlen;

  donors.forEach(({ body, links }, i) => {
    const dData = nodeDataById.get(String(body.id));
    const r = donorRadius(dData);

    if (links.length > 1) {
      // Multi-party: weighted centroid of connected parties
      let wx = 0, wy = 0, wsum = 0;
      for (const { partyId: pid, weight } of links) {
        const p = partyById.get(pid);
        if (!p) continue;
        wx += p.x * weight; wy += p.y * weight; wsum += weight;
      }
      if (wsum) {
        body.x = wx / wsum;
        body.y = wy / wsum;
      }
      return;
    }

    // Single-party: even arc fanning outward from party
    const arcSpan = Math.min(Math.PI * 1.4, 0.5 + n * 0.12);
    // Perpendicular to outward direction
    const px = -dy, py = dx;
    const startAngle = Math.atan2(dy, dx) - arcSpan / 2;
    const angle = n === 1 ? Math.atan2(dy, dx) : startAngle + (i / (n - 1)) * arcSpan;
    const ring = baseR + r + Math.floor(i / 8) * 32;
    body.x = party.x + Math.cos(angle) * ring;
    body.y = party.y + Math.sin(angle) * ring;
  });
}

// ── Resolve overlaps (parties pinned) ─────────────────────────────────────────

for (let pass = 0; pass < 400; pass++) {
  resolveBodyOverlaps(bodies, 4, pinnedIds);
  // Re-pin parties
  for (const body of bodies.filter(b => b.type === 'party')) {
    const original = draft[body.name];
    body.x = original.x; body.y = original.y;
  }
  if (countLayoutOverlaps(bodies) === 0) break;
}

const finalOverlaps = countLayoutOverlaps(bodies);
if (finalOverlaps > 0) {
  console.warn(`⚠ ${finalOverlaps} overlaps remain after resolution — try spreading nodes more in the browser`);
}

// ── Write output ──────────────────────────────────────────────────────────────

const raw = Object.fromEntries(bodies.map(b => [b.name, { x: b.x, y: b.y }]));
const positions = centerLayoutPositions(raw);

writeFileSync(CURATED_PATH, `${JSON.stringify(positions, null, 2)}\n`);
console.log(`Wrote network-layout-curated.json (${Object.keys(positions).length} nodes, ${finalOverlaps} overlaps)`);

const result = spawnSync('node', ['scripts/generate_network_layout.mjs'], { stdio: 'inherit' });
process.exit(result.status ?? 0);
