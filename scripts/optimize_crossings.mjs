/**
 * For each multi-party donor in HAND_DONOR_POSITIONS, computes:
 *  - current crossing count contribution
 *  - optimal position (weighted centroid of connected parties)
 *  - projected crossing count if moved there
 *
 * Run: node scripts/optimize_crossings.mjs
 */
import fundingData from '../src/data/funding.json' with { type: 'json' };
import { buildGraphFromFundingData } from '../src/lib/networkGraphBuild.js';
import savedLayout from '../src/data/network-layout.json' with { type: 'json' };
import { HAND_DONOR_POSITIONS } from '../src/lib/networkGraphManualLayout.js';

// ── geometry ──────────────────────────────────────────────────────────────────

function cross2d(ox, oy, ax, ay, bx, by) {
  return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
}
function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = cross2d(cx, cy, dx, dy, ax, ay);
  const d2 = cross2d(cx, cy, dx, dy, bx, by);
  const d3 = cross2d(ax, ay, bx, by, cx, cy);
  const d4 = cross2d(ax, ay, bx, by, dx, dy);
  return (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
          ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)));
}

function countCrossings(segments) {
  let total = 0;
  for (let i = 0; i < segments.length; i++) {
    const a = segments[i];
    for (let j = i + 1; j < segments.length; j++) {
      const b = segments[j];
      if (a.donor === b.donor || a.party === b.party) continue;
      if (segmentsIntersect(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2)) total++;
    }
  }
  return total;
}

// ── load data ─────────────────────────────────────────────────────────────────

const graph = buildGraphFromFundingData(fundingData.combined);
const positions = savedLayout.positions;

// Build segment list from current layout
function makeSegments(overridePositions = {}) {
  const segs = [];
  for (const link of graph.graphLinks) {
    const src = graph.nodeById.get(link.source);
    const tgt = graph.nodeById.get(link.target);
    if (!src || !tgt || src.type !== 'donor' || tgt.type !== 'party') continue;
    const p1 = overridePositions[src.name] ?? positions[src.name];
    const p2 = overridePositions[tgt.name] ?? positions[tgt.name];
    if (!p1 || !p2) continue;
    segs.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, donor: src.name, party: tgt.name });
  }
  return segs;
}

// Compute donation weights per donor→party
const donorPartyWeights = new Map();
for (const link of graph.graphLinks) {
  const src = graph.nodeById.get(link.source);
  const tgt = graph.nodeById.get(link.target);
  if (!src || !tgt || src.type !== 'donor' || tgt.type !== 'party') continue;
  const key = src.name;
  if (!donorPartyWeights.has(key)) donorPartyWeights.set(key, []);
  donorPartyWeights.get(key).push({ party: tgt.name, value: link.value });
}

// Baseline
const baseline = makeSegments();
const baselineCrossings = countCrossings(baseline);
console.log(`\nBaseline crossings: ${baselineCrossings}`);

// ── per-donor analysis ────────────────────────────────────────────────────────

// Multi-party donors — those connected to more than one party
const multiPartyDonors = [];
donorPartyWeights.forEach((entries, name) => {
  if (entries.length > 1) multiPartyDonors.push({ name, entries });
});

console.log(`\nMulti-party donors: ${multiPartyDonors.length}`);

// For each multi-party donor, try moving to weighted centroid of its parties
const improvements = [];

for (const { name, entries } of multiPartyDonors) {
  const currentPos = positions[name];
  if (!currentPos) continue;

  // Weighted centroid of connected party positions
  let wx = 0, wy = 0, wsum = 0;
  for (const { party, value } of entries) {
    const p = positions[party];
    if (!p) continue;
    const w = Math.log1p(value);
    wx += p.x * w; wy += p.y * w; wsum += w;
  }
  if (!wsum) continue;
  const centroid = { x: wx / wsum, y: wy / wsum };

  // Count crossings with donor at centroid
  const moved = makeSegments({ [name]: centroid });
  const movedCrossings = countCrossings(moved);
  const saving = baselineCrossings - movedCrossings;

  improvements.push({
    name,
    saving,
    currentPos,
    centroid,
    currentCrossings: baselineCrossings,
    movedCrossings,
    isHandPlaced: name in HAND_DONOR_POSITIONS,
    parties: entries.map(e => e.party),
  });
}

improvements.sort((a, b) => b.saving - a.saving);

console.log('\nDonor relocation impact (moving to weighted centroid of connected parties):');
console.log('─'.repeat(90));
for (const r of improvements) {
  if (r.saving <= 0) continue;
  const marker = r.isHandPlaced ? '[HAND]' : '[AUTO]';
  console.log(
    `  ${marker} ${r.saving > 0 ? '+' : ' '}${r.saving} crossings  ${r.name.slice(0, 38).padEnd(38)}`
  );
  console.log(
    `         current: (${Math.round(r.currentPos.x)}, ${Math.round(r.currentPos.y)})  → optimal: (${Math.round(r.centroid.x)}, ${Math.round(r.centroid.y)})`
  );
  console.log(`         parties: ${r.parties.join(', ')}`);
}

// Simulate applying ALL improvements at once
const allMoves = {};
let projectedTotal = baselineCrossings;
for (const r of improvements) {
  if (r.saving > 0) allMoves[r.name] = r.centroid;
}
if (Object.keys(allMoves).length) {
  const allMoved = makeSegments(allMoves);
  const allMovedCrossings = countCrossings(allMoved);
  console.log('\n─'.repeat(90));
  console.log(`\nIf ALL above donors moved to their weighted centroids:`);
  console.log(`  ${baselineCrossings} → ${allMovedCrossings} crossings (−${baselineCrossings - allMovedCrossings})`);
}

// ── party position exploration ────────────────────────────────────────────────
// Can swapping Jacqui Lambie Network to the right side reduce crossings?
// (It receives Coalition-type donors, currently placed far-left)

console.log('\n── Party position experiments ──');

// Try moving Jacqui Lambie closer to its donors' centroid
const jlDonors = [...donorPartyWeights.entries()]
  .filter(([, entries]) => entries.some(e => e.party === 'Jacqui Lambie Network'))
  .map(([name]) => name);

console.log(`\nDonors to Jacqui Lambie Network (${jlDonors.length}): ${jlDonors.join(', ')}`);
console.log(`Current Jacqui Lambie pos: (${Math.round(positions['Jacqui Lambie Network'].x)}, ${Math.round(positions['Jacqui Lambie Network'].y)})`);

// Compute centroid of Jacqui Lambie's donors
let jlCx = 0, jlCy = 0, jlN = 0;
for (const dName of jlDonors) {
  const p = positions[dName];
  if (!p) continue;
  jlCx += p.x; jlCy += p.y; jlN++;
}
if (jlN) {
  console.log(`Centroid of Jacqui Lambie's donors: (${Math.round(jlCx / jlN)}, ${Math.round(jlCy / jlN)})`);
}
