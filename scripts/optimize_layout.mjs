/**
 * Finds donor positions that minimise edge crossings.
 * Strategy: greedy grid search — for each multi-party donor try many candidate
 * positions (grid + along-party-edge samples), keep the global minimum, repeat
 * for several passes until crossings stop decreasing.
 *
 * Run: node scripts/optimize_layout.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fundingData from '../src/data/funding.json' with { type: 'json' };
import { buildGraphFromFundingData, centerLayoutPositions } from '../src/lib/networkGraphBuild.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CURATED_PATH = join(__dirname, '../src/data/network-layout-curated.json');
const LAYOUT_PATH  = join(__dirname, '../src/data/network-layout.json');

// ── geometry ──────────────────────────────────────────────────────────────────
function cross2d(ox,oy,ax,ay,bx,by){return(ax-ox)*(by-oy)-(ay-oy)*(bx-ox);}
function intersects(ax,ay,bx,by,cx,cy,dx,dy){
  const d1=cross2d(cx,cy,dx,dy,ax,ay), d2=cross2d(cx,cy,dx,dy,bx,by);
  const d3=cross2d(ax,ay,bx,by,cx,cy), d4=cross2d(ax,ay,bx,by,dx,dy);
  return(((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0)));
}

function countCrossings(segs) {
  let n = 0;
  for (let i = 0; i < segs.length; i++) {
    const a = segs[i];
    for (let j = i+1; j < segs.length; j++) {
      const b = segs[j];
      if (a.donor===b.donor || a.party===b.party) continue;
      if (intersects(a.x1,a.y1,a.x2,a.y2,b.x1,b.y1,b.x2,b.y2)) n++;
    }
  }
  return n;
}

// Count only crossings involving a specific donor
function crossingsForDonor(segs, donorName) {
  let n = 0;
  const mine = segs.filter(s => s.donor === donorName);
  const others = segs.filter(s => s.donor !== donorName);
  for (const a of mine) for (const b of others) {
    if (a.party === b.party) continue;
    if (intersects(a.x1,a.y1,a.x2,a.y2,b.x1,b.y1,b.x2,b.y2)) n++;
  }
  return n;
}

// ── build segment list from positions map ────────────────────────────────────
function buildSegs(pos, graphLinks, nodeById) {
  const segs = [];
  for (const link of graphLinks) {
    const src = nodeById.get(link.source);
    const tgt = nodeById.get(link.target);
    if (!src||!tgt||src.type!=='donor'||tgt.type!=='party') continue;
    const p1 = pos[src.name], p2 = pos[tgt.name];
    if (!p1||!p2) continue;
    segs.push({ x1:p1.x, y1:p1.y, x2:p2.x, y2:p2.y, donor:src.name, party:tgt.name });
  }
  return segs;
}

// ── candidate positions for a multi-party donor ───────────────────────────────
function candidates(partyPositions, gridSteps = 72, padding = 280) {
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  for (const p of partyPositions) {
    minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x);
    minY=Math.min(minY,p.y); maxY=Math.max(maxY,p.y);
  }
  minX -= padding; maxX += padding; minY -= padding; maxY += padding;

  const pts = [];
  // Uniform grid
  for (let gx = 0; gx <= gridSteps; gx++) {
    for (let gy = 0; gy <= gridSteps; gy++) {
      pts.push({
        x: minX + (maxX - minX) * gx / gridSteps,
        y: minY + (maxY - minY) * gy / gridSteps,
      });
    }
  }
  // Weighted centroid of party pairs at various blend ratios
  for (let i = 0; i < partyPositions.length; i++) {
    for (let j = i+1; j < partyPositions.length; j++) {
      for (let t = 0; t <= 20; t++) {
        const w = t / 20;
        pts.push({
          x: partyPositions[i].x * (1-w) + partyPositions[j].x * w,
          y: partyPositions[i].y * (1-w) + partyPositions[j].y * w,
        });
      }
    }
  }
  return pts;
}

// ── main ──────────────────────────────────────────────────────────────────────
const graph = buildGraphFromFundingData(fundingData.combined);
const { graphLinks, nodeById } = graph;
const existingLayout = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'));

const pos = { ...existingLayout.positions };

// Build donor→parties map
const donorToParties = new Map();
for (const link of graphLinks) {
  const src = nodeById.get(link.source);
  const tgt = nodeById.get(link.target);
  if (!src||!tgt||src.type!=='donor'||tgt.type!=='party') continue;
  if (!donorToParties.has(src.name)) donorToParties.set(src.name, new Set());
  donorToParties.get(src.name).add(tgt.name);
}

const multiDonors = [...donorToParties.entries()]
  .filter(([,parties]) => parties.size > 1)
  .map(([name, parties]) => ({ name, parties: [...parties] }));

console.log(`Starting crossings: ${countCrossings(buildSegs(pos, graphLinks, nodeById))}`);
console.log(`Multi-party donors to optimise: ${multiDonors.length}`);

// Also gather single-party donors involved in crossings (can be moved to dodge)
const singleDonors = [...donorToParties.entries()]
  .filter(([,parties]) => parties.size === 1)
  .map(([name, parties]) => ({ name, parties: [...parties] }));

function optimizePass(donors, label) {
  let improved = false;
  const segs = buildSegs(pos, graphLinks, nodeById);
  donors.sort((a, b) => crossingsForDonor(segs, b.name) - crossingsForDonor(segs, a.name));

  for (const { name, parties } of donors) {
    if (crossingsForDonor(buildSegs(pos, graphLinks, nodeById), name) === 0) continue;
    const partyPositions = parties.map(p => pos[p]).filter(Boolean);
    if (!partyPositions.length) continue;

    const cands = candidates(partyPositions);
    const baseline = countCrossings(buildSegs(pos, graphLinks, nodeById));
    let bestX = pos[name].x, bestY = pos[name].y, bestCount = baseline;

    for (const { x, y } of cands) {
      pos[name] = { x, y };
      const count = countCrossings(buildSegs(pos, graphLinks, nodeById));
      if (count < bestCount) { bestCount = count; bestX = x; bestY = y; }
    }

    pos[name] = { x: bestX, y: bestY };
    if (bestCount < baseline) improved = true;
  }
  return improved;
}

let pass = 0;
while (pass < 12) {
  pass++;
  const before = countCrossings(buildSegs(pos, graphLinks, nodeById));
  const a = optimizePass(multiDonors, 'multi');
  const b = optimizePass(singleDonors, 'single');
  const after = countCrossings(buildSegs(pos, graphLinks, nodeById));
  console.log(`Pass ${pass}: ${after} crossings`);
  if (after === 0 || (!a && !b)) break;
}

const finalCrossings = countCrossings(buildSegs(pos, graphLinks, nodeById));
console.log(`\nFinal: ${finalCrossings} crossings`);

if (finalCrossings < countCrossings(buildSegs(existingLayout.positions, graphLinks, nodeById))) {
  const centered = centerLayoutPositions(pos);
  writeFileSync(CURATED_PATH, `${JSON.stringify(centered, null, 2)}\n`);
  const payload = { ...existingLayout, positions: centered, metrics: { source: 'optimized', crossings: finalCrossings } };
  writeFileSync(LAYOUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log('Written to network-layout.json');
} else {
  console.log('No improvement — layout unchanged.');
}
