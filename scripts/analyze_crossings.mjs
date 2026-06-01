/**
 * Analyzes edge crossings in the current production (manual) layout.
 * Identifies which edge pairs cross and what the main causes are.
 * Run: node scripts/analyze_crossings.mjs
 */
import fundingData from '../src/data/funding.json' with { type: 'json' };
import { buildGraphFromFundingData } from '../src/lib/networkGraphBuild.js';
import savedLayout from '../src/data/network-layout.json' with { type: 'json' };

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

const graph = buildGraphFromFundingData(fundingData.combined);
const positions = savedLayout.positions;

// Build segments
const segments = [];
for (const link of graph.graphLinks) {
  const src = graph.nodeById.get(link.source);
  const tgt = graph.nodeById.get(link.target);
  if (!src || !tgt) continue;
  if (src.type !== 'donor' || tgt.type !== 'party') continue;
  const p1 = positions[src.name];
  const p2 = positions[tgt.name];
  if (!p1 || !p2) continue;
  segments.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, donor: src.name, party: tgt.name });
}

// Count crossings and track hotspots
let total = 0;
const partyCrossCount = new Map();
const donorCrossCount = new Map();
const crossingPairs = [];

for (let i = 0; i < segments.length; i++) {
  const a = segments[i];
  for (let j = i + 1; j < segments.length; j++) {
    const b = segments[j];
    if (a.donor === b.donor || a.party === b.party) continue;
    if (!segmentsIntersect(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2)) continue;
    total++;
    partyCrossCount.set(a.party, (partyCrossCount.get(a.party) || 0) + 1);
    partyCrossCount.set(b.party, (partyCrossCount.get(b.party) || 0) + 1);
    donorCrossCount.set(a.donor, (donorCrossCount.get(a.donor) || 0) + 1);
    donorCrossCount.set(b.donor, (donorCrossCount.get(b.donor) || 0) + 1);
    crossingPairs.push({ a, b });
  }
}

console.log(`\nTotal crossings in production layout: ${total}`);
console.log(`Total donor→party segments: ${segments.length}`);

// Top donors by crossing count
const topDonors = [...donorCrossCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log('\nTop donors causing crossings:');
for (const [name, count] of topDonors) {
  // Find which parties this donor connects to
  const donorParties = segments.filter(s => s.donor === name).map(s => s.party);
  console.log(`  ${count.toString().padStart(4)}x  ${name.slice(0, 40).padEnd(40)}  → ${donorParties.join(', ')}`);
}

// Top parties by involvement in crossings
const topParties = [...partyCrossCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log('\nParties most involved in crossings:');
for (const [name, count] of topParties) {
  const p = positions[name];
  console.log(`  ${count.toString().padStart(4)}x  ${name.padEnd(35)}  pos: (${Math.round(p.x)}, ${Math.round(p.y)})`);
}

// Party positions for reference
console.log('\nAll party positions:');
const partyNodes = [...graph.nodeById.values()].filter(n => n.type === 'party');
const partyPosSorted = partyNodes
  .map(n => ({ name: n.name, ...positions[n.name] }))
  .filter(p => p.x != null)
  .sort((a, b) => a.x - b.x);
for (const p of partyPosSorted) {
  console.log(`  x=${String(Math.round(p.x)).padStart(5)}, y=${String(Math.round(p.y)).padStart(5)}  ${p.name}`);
}
