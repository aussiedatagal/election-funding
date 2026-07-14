/**
 * Generates a layout where party positions reflect donor-sharing similarity.
 * Parties with more shared donors are placed closer together.
 *
 * Algorithm:
 *   1. Build a shared-donor count matrix for every party pair.
 *   2. Convert to distances: d(p1,p2) = 1 / (shared + 1)
 *      (0 shared → distance 1.0; 5 shared → distance ~0.17)
 *   3. Run Classical MDS (Multi-Dimensional Scaling) to embed parties in 2D.
 *      Classical MDS finds the 2D coordinates that best preserve all pairwise
 *      distances via eigendecomposition of the double-centred distance matrix.
 *   4. Scale and orient: x-axis = first principal axis (left–right political),
 *      Labor anchored left, Coalition right.
 *   5. Place donors at the donation-weighted centroid of their connected parties.
 *   6. Resolve all node overlaps (parties then donors) with the physics solver.
 *   7. Write to network-layout-curated.json + network-layout.json.
 *
 * Run: npm run semantic-layout
 */
import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fundingData from '../src/data/funding.json' with { type: 'json' };
import { buildGraphFromFundingData, centerLayoutPositions } from '../src/lib/networkGraphBuild.js';
import {
  countLayoutOverlaps, donorRadius, partyHalfSize,
  resolveBodyOverlaps,
} from '../src/lib/networkGraphLayoutUtils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LAYOUT_PATH  = join(__dirname, '../src/data/network-layout.json');
const CURATED_PATH = join(__dirname, '../src/data/network-layout-curated.json');

// ── graph ─────────────────────────────────────────────────────────────────────
const graph = buildGraphFromFundingData(fundingData.combined);
const { graphLinks, nodeById } = graph;
const nodeDataById = new Map(graph.cyElements.filter(el=>el.group==='nodes').map(el=>[el.data.id,el.data]));

// ── shared-donor matrix ───────────────────────────────────────────────────────
const partyDonors = new Map();   // party name → Set of donor names
const partyWeightedDonors = new Map(); // party name → Map(donor → log-value)
nodeById.forEach(n => {
  if (n.type === 'party') {
    partyDonors.set(n.name, new Set());
    partyWeightedDonors.set(n.name, new Map());
  }
});

for (const l of graphLinks) {
  const src = nodeById.get(l.source), tgt = nodeById.get(l.target);
  if (!src || !tgt || src.type !== 'donor' || tgt.type !== 'party') continue;
  partyDonors.get(tgt.name)?.add(src.name);
  const wmap = partyWeightedDonors.get(tgt.name);
  if (wmap) wmap.set(src.name, (wmap.get(src.name) || 0) + Math.log1p(l.value));
}

const parties = [...partyDonors.keys()];
const N = parties.length;

function sharedCount(p1, p2) {
  const s1 = partyDonors.get(p1), s2 = partyDonors.get(p2);
  let n = 0; for (const d of s1) if (s2.has(d)) n++; return n;
}

// Print shared-donor summary for reference
console.log('Shared-donor counts between connected parties:');
const pairs = [];
for (let i = 0; i < N; i++) for (let j = i+1; j < N; j++) {
  const s = sharedCount(parties[i], parties[j]);
  if (s > 0) pairs.push([s, parties[i], parties[j]]);
}
pairs.sort((a,b) => b[0]-a[0]);
for (const [s,p1,p2] of pairs) console.log(`  ${s}  ${p1} ↔ ${p2}`);

// ── distance matrix ───────────────────────────────────────────────────────────
// d(p1,p2) = 1/(shared+1). Range: (0, 1]. Parties with more shared donors closer.
const D = Array.from({length:N}, (_,i) =>
  Array.from({length:N}, (_,j) => i===j ? 0 : 1/(sharedCount(parties[i],parties[j])+1))
);

// ── Classical MDS ─────────────────────────────────────────────────────────────
// 1. Square the distances
const D2 = D.map(row => row.map(d => d*d));

// 2. Double-centre: B = -½ H D² H  where H = I - (1/n)11^T
const rowMean = D2.map(row => row.reduce((a,b)=>a+b,0)/N);
const grandMean = rowMean.reduce((a,b)=>a+b,0)/N;
const B = D2.map((row,i) => row.map((d,j) => -(d - rowMean[i] - rowMean[j] + grandMean)/2));

// 3. Power iteration for top-2 eigenvectors
function powerIter(B, deflate = []) {
  const n = B.length;
  // Initialise with a non-degenerate vector
  let v = Array.from({length:n}, (_,i) => Math.sin(i+1));
  for (let iter = 0; iter < 2000; iter++) {
    // Multiply B @ v
    let w = B.map(row => row.reduce((s,bij,j) => s+bij*v[j], 0));
    // Deflate (Gram-Schmidt)
    for (const u of deflate) {
      const dot = w.reduce((s,wi,i) => s+wi*u[i], 0);
      w = w.map((wi,i) => wi - dot*u[i]);
    }
    // Normalise
    const norm = Math.sqrt(w.reduce((s,wi) => s+wi*wi, 0)) || 1;
    const vNew = w.map(wi => wi/norm);
    const delta = Math.sqrt(v.reduce((s,vi,i) => s+(vi-vNew[i])**2, 0));
    v = vNew;
    if (delta < 1e-12) break;
  }
  const eigenvalue = v.reduce((s,vi,i) => s+vi*B[i].reduce((ss,bij,j)=>ss+bij*v[j],0), 0);
  return { v, eigenvalue };
}

const { v: v1, eigenvalue: λ1 } = powerIter(B, []);
const { v: v2, eigenvalue: λ2 } = powerIter(B, [v1]);

// Scale by sqrt of eigenvalues (gives true MDS coords)
const scale1 = Math.sqrt(Math.max(0, λ1));
const scale2 = Math.sqrt(Math.max(0, λ2));
let rawX = v1.map(vi => vi * scale1);
let rawY = v2.map(vi => vi * scale2);

console.log(`\nMDS eigenvalues: λ1=${λ1.toFixed(3)}, λ2=${λ2.toFixed(3)}`);
console.log(`Variance explained: ${(λ1/(λ1+λ2)*100).toFixed(1)}% / ${(λ2/(λ1+λ2)*100).toFixed(1)}%`);

// ── rotate so Labor→Coalition axis is horizontal ──────────────────────────────
const laborIdx = parties.indexOf('Australian Labor Party');
const coalIdx  = parties.indexOf('Liberal-National Coalition');
if (laborIdx >= 0 && coalIdx >= 0) {
  const dx = rawX[coalIdx] - rawX[laborIdx];
  const dy = rawY[coalIdx] - rawY[laborIdx];
  const angle = Math.atan2(dy, dx); // rotate this to 0 (horizontal)
  const cos = Math.cos(-angle), sin = Math.sin(-angle);
  const rotX = rawX.map((x,i) => x*cos - rawY[i]*sin);
  const rotY = rawX.map((x,i) => x*sin + rawY[i]*cos);
  rawX = rotX; rawY = rotY;
  // Ensure Labor is to the left of Coalition
  if (rawX[laborIdx] > rawX[coalIdx]) { rawX = rawX.map(x => -x); rawY = rawY.map(y => -y); }
}

// ── handle isolated parties (no shared donors → MDS collapses them) ───────────
// Detect parties that have 0 shared donors with every other party
const isolated = parties.filter(p => parties.every(q => q === p || sharedCount(p, q) === 0));
const connected = parties.filter(p => !isolated.includes(p));
console.log(`\nIsolated parties (no shared donors): ${isolated.join(', ') || 'none'}`);

// Place isolated parties in a row to the right of Coalition, spread vertically
const coalPos = coalIdx >= 0 ? { x: rawX[coalIdx], y: rawY[coalIdx] } : { x: 0.3, y: 0 };
const isolatedSpacing = (Math.max(...rawY.filter((_,i)=>!isolated.includes(parties[i]))) -
                         Math.min(...rawY.filter((_,i)=>!isolated.includes(parties[i])))) / (isolated.length + 1) || 0.1;
isolated.forEach((name, k) => {
  const i = parties.indexOf(name);
  const minY = Math.min(...rawY.filter((_,j)=>!isolated.includes(parties[j])));
  rawX[i] = coalPos.x + 0.12;
  rawY[i] = minY + isolatedSpacing * (k + 1);
});

// ── scale to graph viewport ───────────────────────────────────────────────────
const connectedIndices = connected.map(p => parties.indexOf(p));
const allXs = rawX, allYs = rawY;
const xRange = Math.max(...allXs) - Math.min(...allXs) || 1;
const yRange = Math.max(...allYs) - Math.min(...allYs) || 1;
const scaleX = 1200 / xRange;
const scaleY = 700 / yRange;

const partyPos = {};
parties.forEach((name, i) => {
  partyPos[name] = { x: rawX[i] * scaleX, y: rawY[i] * scaleY };
});

console.log('\nParty positions (MDS):');
const sorted = Object.entries(partyPos).sort((a,b) => a[1].x - b[1].x);
for (const [name, {x, y}] of sorted)
  console.log(`  x=${Math.round(x).toString().padStart(5)}, y=${Math.round(y).toString().padStart(5)}  ${name}`);

// ── donor positions: weighted centroid of connected parties ───────────────────
const donorLinks = new Map(); // donor name → [{party, value}]
for (const l of graphLinks) {
  const src = nodeById.get(l.source), tgt = nodeById.get(l.target);
  if (!src || !tgt || src.type !== 'donor' || tgt.type !== 'party') continue;
  if (!donorLinks.has(src.name)) donorLinks.set(src.name, []);
  donorLinks.get(src.name).push({ party: tgt.name, value: l.value });
}

const donorPos = {};
donorLinks.forEach((entries, name) => {
  let wx = 0, wy = 0, wsum = 0;
  for (const { party, value } of entries) {
    const p = partyPos[party]; if (!p) continue;
    const w = Math.log1p(value); wx += p.x * w; wy += p.y * w; wsum += w;
  }
  if (wsum) donorPos[name] = { x: wx / wsum, y: wy / wsum };
});

// ── build bodies and resolve overlaps ─────────────────────────────────────────
const allPos = { ...partyPos, ...donorPos };

// Ensure all graph nodes have a position
nodeById.forEach(n => {
  if (!allPos[n.name]) allPos[n.name] = { x: 0, y: 0 };
});

function makeBodies(pos) {
  const bodies = [];
  nodeById.forEach((node, id) => {
    const p = pos[node.name]; if (!p) return;
    const data = nodeDataById.get(String(id));
    if (node.type === 'party') {
      const { hw, hh } = partyHalfSize(data);
      bodies.push({ id, name: node.name, type: 'party', x: p.x, y: p.y, hw, hh, w: hw*2, h: hh*2 });
    } else {
      const r = donorRadius(data);
      bodies.push({ id, name: node.name, type: 'donor', x: p.x, y: p.y, r, hw: r, hh: r, w: r*2, h: r*2 });
    }
  });
  return bodies;
}

// Resolve overlaps: first pin parties, spread donors; then release all and resolve
const bodies = makeBodies(allPos);
const partyIds = new Set(bodies.filter(b => b.type === 'party').map(b => b.id));

// Pass 1: donors spread around their party positions (parties pinned)
for (let i = 0; i < 600; i++) {
  resolveBodyOverlaps(bodies, 4, partyIds);
  // Re-pin parties
  for (const b of bodies) if (b.type === 'party') { const p = partyPos[b.name]; b.x = p.x; b.y = p.y; }
  if (countLayoutOverlaps(bodies) === 0) break;
}

// Pass 2: free all nodes, settle any remaining overlaps
for (let i = 0; i < 200; i++) {
  resolveBodyOverlaps(bodies, 4);
  if (countLayoutOverlaps(bodies) === 0) break;
}

const finalOverlaps = countLayoutOverlaps(bodies);
console.log(`\nNode overlaps after resolution: ${finalOverlaps}`);

// Write back to allPos
for (const b of bodies) allPos[b.name] = { x: b.x, y: b.y };

// ── write output ──────────────────────────────────────────────────────────────
const positions = centerLayoutPositions(allPos);

// Verify crossings
function cross2d(ox,oy,ax,ay,bx,by){return(ax-ox)*(by-oy)-(ay-oy)*(bx-ox);}
function intersects(ax,ay,bx,by,cx,cy,dx,dy){
  const d1=cross2d(cx,cy,dx,dy,ax,ay),d2=cross2d(cx,cy,dx,dy,bx,by);
  const d3=cross2d(ax,ay,bx,by,cx,cy),d4=cross2d(ax,ay,bx,by,dx,dy);
  return(((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0)));
}
const segs=[];
for(const l of graphLinks){const s=nodeById.get(l.source),t=nodeById.get(l.target);if(!s||!t||s.type!=='donor'||t.type!=='party')continue;const p1=positions[s.name],p2=positions[t.name];if(!p1||!p2)continue;segs.push({x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,d:s.name,p:t.name});}
let crossings=0;for(let i=0;i<segs.length;i++)for(let j=i+1;j<segs.length;j++){const a=segs[i],b=segs[j];if(a.d===b.d||a.p===b.p)continue;if(intersects(a.x1,a.y1,a.x2,a.y2,b.x1,b.y1,b.x2,b.y2))crossings++;}
console.log(`Geometric edge crossings: ${crossings}`);

writeFileSync(CURATED_PATH, `${JSON.stringify(positions, null, 2)}\n`);

const existing = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'));
const payload = {
  ...existing,
  description: 'Semantic layout — party positions from MDS on shared-donor distances',
  positions,
  nodeNames: graph.nodeNames,
  metrics: { source: 'semantic_mds', overlaps: finalOverlaps, crossings },
};
writeFileSync(LAYOUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`\nWritten: ${Object.keys(positions).length} nodes`);
