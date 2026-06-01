/**
 * Counts edge crossings (overlapping paths) for each layout preset.
 * An edge crossing is when two straight donor→party lines intersect.
 * Run: node scripts/count_crossings.mjs
 */
import fundingData from '../src/data/funding.json' with { type: 'json' };
import { buildGraphFromFundingData } from '../src/lib/networkGraphBuild.js';
import { buildClusterLayout } from '../src/lib/networkGraphClusterLayout.js';
import { LAYOUT_PRESETS } from '../src/lib/networkGraphLayoutConfig.js';

function cross2d(ox, oy, ax, ay, bx, by) {
  return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
}

function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = cross2d(cx, cy, dx, dy, ax, ay);
  const d2 = cross2d(cx, cy, dx, dy, bx, by);
  const d3 = cross2d(ax, ay, bx, by, cx, cy);
  const d4 = cross2d(ax, ay, bx, by, dx, dy);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;

  // Collinear / on-segment cases (treat as non-crossing to avoid false positives
  // at shared endpoints where donor connects to multiple parties)
  return false;
}

function countCrossings(positions, graphLinks, nodeById) {
  // Build edge list as {x1,y1,x2,y2} segments (donor → party only)
  const segments = [];
  for (const link of graphLinks) {
    const src = nodeById.get(link.source);
    const tgt = nodeById.get(link.target);
    if (!src || !tgt) continue;
    if (src.type !== 'donor' || tgt.type !== 'party') continue;
    const p1 = positions[src.name];
    const p2 = positions[tgt.name];
    if (!p1 || !p2) continue;
    segments.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, donor: src.name, party: tgt.name });
  }

  let crossings = 0;
  for (let i = 0; i < segments.length; i++) {
    const a = segments[i];
    for (let j = i + 1; j < segments.length; j++) {
      const b = segments[j];
      // Skip if they share an endpoint (same donor or same party)
      if (a.donor === b.donor || a.party === b.party) continue;
      if (segmentsIntersect(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2)) {
        crossings++;
      }
    }
  }
  return { crossings, segmentCount: segments.length };
}

const graph = buildGraphFromFundingData(fundingData.combined);

const results = [];
for (const preset of Object.values(LAYOUT_PRESETS)) {
  const layout = buildClusterLayout({
    nodeById: graph.nodeById,
    graphLinks: graph.graphLinks,
    cyElements: graph.cyElements,
    preset,
  });
  const { crossings, segmentCount } = countCrossings(layout.positions, graph.graphLinks, graph.nodeById);
  results.push({
    id: preset.id,
    crossings,
    segmentCount,
    partyOverlap: layout.metrics.partyOverlap,
    score: layout.metrics.score,
  });
}

results.sort((a, b) => a.crossings - b.crossings);

console.log('\nEdge crossings per preset (fewer = better):');
console.log('─'.repeat(60));
for (const r of results) {
  const marker = r === results[0] ? ' ← WINNER' : '';
  console.log(
    `  ${r.id.padEnd(12)} crossings: ${String(r.crossings).padStart(4)}  partyOverlap: ${r.partyOverlap}  score: ${r.score.toFixed(1)}${marker}`
  );
}
console.log('─'.repeat(60));
console.log(`\nTotal donor→party segments checked: ${results[0]?.segmentCount}`);
console.log(`\nRecommended preset: ${results[0]?.id} (${results[0]?.crossings} crossings)`);
