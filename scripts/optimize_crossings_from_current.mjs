/**
 * Pure crossing-minimization search, seeded from whatever is currently the
 * best-known layout (network-layout-draft.json, i.e. your latest manual
 * save) rather than re-running the force simulation from scratch. The force
 * sim in generate_weighted_layout.mjs isn't monotonic — rerunning it can
 * regress below a layout you improved by hand. This script never does that:
 * it only accepts moves that are provably no worse than the current best,
 * so the output can only match or beat what you started with.
 *
 * NOTE on "optimal": true minimum edge-crossing-number layout (subject to
 * fixed party positions, node sizes, and a minimum node clearance) is an
 * NP-hard combinatorial problem — there's no practical way to *certify*
 * global optimality for a graph this size. This is a strong local search
 * (greedy + randomized restarts) that pushes hard toward the practical
 * floor within a time budget; it reports the best it finds, not a proof.
 *
 * Method:
 *   1. Load current best positions (draft if present, else network-layout.json).
 *   2. Build node bodies with a minimum clearance buffer (never flush against
 *      a party or another donor).
 *   3. Greedy pass: for every donor still involved in a crossing, try a rich
 *      candidate set — rings around its current spot, the centroid of its
 *      connected parties, and points along the lines between pairs of its
 *      connected parties — and take the best crossing-reducing, overlap-free
 *      move. Parties never move.
 *   4. When greedy stalls, randomly reposition a chunk of the still-crossing
 *      donors to fresh candidates and greedy again — classic random-restart
 *      local search. Always keep the best positions seen.
 *   5. Stop at 0 crossings or when the time budget runs out.
 *
 * Run: npm run optimize-crossings [-- <seconds>]
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fundingData from '../src/data/funding.json' with { type: 'json' };
import { buildGraphFromFundingData, centerLayoutPositions } from '../src/lib/networkGraphBuild.js';
import {
  countLayoutOverlaps, donorRadius, partyHalfSize,
  resolveBodyOverlaps, separateCircleCircle, separateCircleRect,
} from '../src/lib/networkGraphLayoutUtils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LAYOUT_PATH  = join(__dirname, '../src/data/network-layout.json');
const CURATED_PATH = join(__dirname, '../src/data/network-layout-curated.json');
const DRAFT_PATH   = join(__dirname, '../src/data/network-layout-draft.json');

const NODE_CLEARANCE = 20;   // px — same buffer as generate_weighted_layout.mjs, never flush
const TIME_BUDGET_MS = (Number(process.argv[2]) || 180) * 1000;
const STUCK_LIMIT = 3;       // consecutive non-improving passes before a random restart
const RESTART_FRACTION = 0.4; // fraction of still-crossing donors perturbed per restart

// ── geometry ──────────────────────────────────────────────────────────────────
function cross2d(ox, oy, ax, ay, bx, by) { return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox); }
function segIntersects(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = cross2d(cx, cy, dx, dy, ax, ay), d2 = cross2d(cx, cy, dx, dy, bx, by);
  const d3 = cross2d(ax, ay, bx, by, cx, cy), d4 = cross2d(ax, ay, bx, by, dx, dy);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// ── graph ─────────────────────────────────────────────────────────────────────
const graph = buildGraphFromFundingData(fundingData.combined);
const { graphLinks, nodeById } = graph;
const nodeDataById = new Map(graph.cyElements.filter(el => el.group === 'nodes').map(el => [el.data.id, el.data]));

const existingLayout = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'));

// Seed from whichever of draft / network-layout.json currently has fewer
// crossings — this script's own previous run may already beat the draft.
function quickCrossingCount(posMap) {
  const segs = [];
  for (const l of graphLinks) {
    const src = nodeById.get(l.source), tgt = nodeById.get(l.target);
    if (!src || !tgt || src.type !== 'donor' || tgt.type !== 'party') continue;
    const p1 = posMap[src.name], p2 = posMap[tgt.name];
    if (!p1 || !p2) return Infinity;
    segs.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, d: src.name, p: tgt.name });
  }
  let n = 0;
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const a = segs[i], b = segs[j];
    if (a.d === b.d || a.p === b.p) continue;
    if (segIntersects(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2)) n++;
  }
  return n;
}

const candidates = [
  { label: 'network-layout.json', positions: existingLayout.positions },
  ...(existsSync(DRAFT_PATH) ? [{ label: 'network-layout-draft.json', positions: JSON.parse(readFileSync(DRAFT_PATH, 'utf8')) }] : []),
];
const scored = candidates.map(c => ({ ...c, crossings: quickCrossingCount(c.positions) }));
scored.sort((a, b) => a.crossings - b.crossings);
const seedPositions = scored[0].positions;
console.log(`Seeding from ${scored[0].label} (${scored[0].crossings} crossings)${scored.length > 1 ? ` — beat ${scored[1].label} (${scored[1].crossings})` : ''}`);

const donorPartyLinks = new Map(); // donor name → [{ partyName, value }]
for (const l of graphLinks) {
  const src = nodeById.get(l.source), tgt = nodeById.get(l.target);
  if (!src || !tgt || src.type !== 'donor' || tgt.type !== 'party') continue;
  if (!donorPartyLinks.has(src.name)) donorPartyLinks.set(src.name, []);
  donorPartyLinks.get(src.name).push({ partyName: tgt.name, value: l.value });
}

// ── bodies (donor radius inflated by NODE_CLEARANCE — never flush) ────────────
function makeBodies(posMap) {
  const bodies = [];
  nodeById.forEach((node, id) => {
    const p = posMap[node.name]; if (!p) return;
    const data = nodeDataById.get(String(id));
    if (node.type === 'party') {
      const { hw, hh } = partyHalfSize(data);
      bodies.push({ id, name: node.name, type: 'party', x: p.x, y: p.y, hw, hh, w: hw * 2, h: hh * 2 });
    } else {
      const r = donorRadius(data) + NODE_CLEARANCE;
      bodies.push({ id, name: node.name, type: 'donor', x: p.x, y: p.y, r, hw: r, hh: r, w: r * 2, h: r * 2 });
    }
  });
  return bodies;
}

const pos = { ...seedPositions };
const bodies = makeBodies(pos);
const partyIds = new Set(bodies.filter(b => b.type === 'party').map(b => b.id));

// Resolve any overlaps introduced purely by the clearance buffer (donors stay
// put unless the buffer pushes them into another body; parties never move).
for (let i = 0; i < 300; i++) {
  resolveBodyOverlaps(bodies, 4, partyIds);
  for (const b of bodies) if (b.type === 'party') { const p = pos[b.name]; b.x = p.x; b.y = p.y; }
  if (countLayoutOverlaps(bodies) === 0) break;
}
for (const b of bodies) pos[b.name] = { x: b.x, y: b.y };
console.log(`Overlaps after clearance resolution: ${countLayoutOverlaps(bodies)}`);

const bodyByName = new Map(bodies.map(b => [b.name, b]));
const donorNames = [...bodyByName.keys()].filter(n => bodyByName.get(n).type === 'donor');

// ── crossing helpers ────────────────────────────────────────────────────────
function buildSegs(posMap) {
  const segs = [];
  for (const l of graphLinks) {
    const src = nodeById.get(l.source), tgt = nodeById.get(l.target);
    if (!src || !tgt || src.type !== 'donor' || tgt.type !== 'party') continue;
    const p1 = posMap[src.name], p2 = posMap[tgt.name];
    if (!p1 || !p2) continue;
    segs.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, d: src.name, p: tgt.name });
  }
  return segs;
}
function totalCrossings(segs) {
  let n = 0;
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const a = segs[i], b = segs[j];
    if (a.d === b.d || a.p === b.p) continue;
    if (segIntersects(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2)) n++;
  }
  return n;
}
function crossingsInvolving(dname, segs) {
  let n = 0;
  for (const ds of segs) {
    if (ds.d !== dname) continue;
    for (const other of segs) {
      if (other.d === dname || ds.p === other.p) continue;
      if (segIntersects(ds.x1, ds.y1, ds.x2, ds.y2, other.x1, other.y1, other.x2, other.y2)) n++;
    }
  }
  return n;
}
function overlapsAny(name, x, y, r) {
  for (const [n, b] of bodyByName) {
    if (n === name) continue;
    const hit = b.type === 'party'
      ? separateCircleRect(x, y, r, b.x, b.y, b.w, b.h)
      : separateCircleCircle(x, y, r, b.x, b.y, b.r);
    if (hit) return true;
  }
  return false;
}

// ── coarse global grid across the party bounding box ──────────────────────────
// Local rings + connected-party geometry alone can get stuck in a local
// optimum; a few global candidates give restarts a way to jump further.
const partyPositions = bodies.filter(b => b.type === 'party').map(b => ({ x: b.x, y: b.y }));
const gridMinX = Math.min(...partyPositions.map(p => p.x)) - 150;
const gridMaxX = Math.max(...partyPositions.map(p => p.x)) + 150;
const gridMinY = Math.min(...partyPositions.map(p => p.y)) - 150;
const gridMaxY = Math.max(...partyPositions.map(p => p.y)) + 150;
const GLOBAL_GRID = [];
const GRID_STEPS = 14;
for (let gx = 0; gx <= GRID_STEPS; gx++) {
  for (let gy = 0; gy <= GRID_STEPS; gy++) {
    GLOBAL_GRID.push({
      x: gridMinX + (gridMaxX - gridMinX) * (gx / GRID_STEPS),
      y: gridMinY + (gridMaxY - gridMinY) * (gy / GRID_STEPS),
    });
  }
}

// ── candidate generator: local rings + connected-party geometry + global grid ─
function candidatesFor(dname) {
  const links = donorPartyLinks.get(dname) || [];
  const partyPts = links.map(l => pos[l.partyName]).filter(Boolean);
  const cur = pos[dname];
  const pts = [];
  for (const radius of [30, 60, 100, 150, 220, 320]) {
    for (let a = 0; a < 16; a++) {
      const theta = (2 * Math.PI * a) / 16;
      pts.push({ x: cur.x + radius * Math.cos(theta), y: cur.y + radius * Math.sin(theta) });
    }
  }
  if (partyPts.length) {
    const cx = partyPts.reduce((s, p) => s + p.x, 0) / partyPts.length;
    const cy = partyPts.reduce((s, p) => s + p.y, 0) / partyPts.length;
    pts.push({ x: cx, y: cy });
    for (let i = 0; i < partyPts.length; i++) {
      for (let j = i + 1; j < partyPts.length; j++) {
        for (let t = 0.1; t <= 0.9; t += 0.2) {
          pts.push({ x: partyPts[i].x * (1 - t) + partyPts[j].x * t, y: partyPts[i].y * (1 - t) + partyPts[j].y * t });
        }
      }
    }
  }
  pts.push(...GLOBAL_GRID);
  return pts;
}

// ── greedy pass over all donors ────────────────────────────────────────────────
function greedyPass() {
  let improved = false;
  let segs = buildSegs(pos);
  const order = [...donorNames].sort((a, b) => crossingsInvolving(b, segs) - crossingsInvolving(a, segs));

  for (const dname of order) {
    segs = buildSegs(pos);
    const cur = crossingsInvolving(dname, segs);
    if (cur === 0) continue;
    const body = bodyByName.get(dname);
    const ox = pos[dname].x, oy = pos[dname].y;
    let bestC = cur, bestX = ox, bestY = oy;
    for (const c of candidatesFor(dname)) {
      if (overlapsAny(dname, c.x, c.y, body.r)) continue;
      pos[dname] = { x: c.x, y: c.y };
      const trialSegs = buildSegs(pos);
      const nc = crossingsInvolving(dname, trialSegs);
      if (nc < bestC) { bestC = nc; bestX = c.x; bestY = c.y; improved = true; }
    }
    pos[dname] = { x: bestX, y: bestY };
    body.x = bestX; body.y = bestY;
  }
  return improved;
}

// ── main search loop with random restarts ──────────────────────────────────────
const START = Date.now();
let bestPos = { ...pos };
let bestCrossings = totalCrossings(buildSegs(pos));
console.log(`Starting crossings: ${bestCrossings}`);

let stuck = 0;
while (Date.now() - START < TIME_BUDGET_MS && bestCrossings > 0) {
  const improved = greedyPass();
  const c = totalCrossings(buildSegs(pos));
  if (c < bestCrossings) {
    bestCrossings = c; bestPos = { ...pos }; stuck = 0;
    console.log(`  ${c} crossings (${((Date.now() - START) / 1000).toFixed(0)}s)`);
  } else {
    stuck++;
  }

  if (!improved || stuck >= STUCK_LIMIT) {
    // Reset to best-known, then randomly perturb a chunk of still-crossing donors
    for (const [name, p] of Object.entries(bestPos)) {
      pos[name] = { x: p.x, y: p.y };
      const b = bodyByName.get(name);
      if (b) { b.x = p.x; b.y = p.y; }
    }
    const segs = buildSegs(pos);
    const troubled = donorNames.filter(n => crossingsInvolving(n, segs) > 0);
    const shuffled = troubled.sort(() => Math.random() - 0.5)
      .slice(0, Math.max(1, Math.ceil(troubled.length * RESTART_FRACTION)));
    for (const dname of shuffled) {
      const cands = candidatesFor(dname);
      const body = bodyByName.get(dname);
      for (let tries = 0; tries < 20; tries++) {
        const c = cands[Math.floor(Math.random() * cands.length)];
        if (!overlapsAny(dname, c.x, c.y, body.r)) {
          pos[dname] = { x: c.x, y: c.y };
          body.x = c.x; body.y = c.y;
          break;
        }
      }
    }
    stuck = 0;
  }
}

const elapsed = ((Date.now() - START) / 1000).toFixed(0);
console.log(`\nBest found: ${bestCrossings} crossings after ${elapsed}s`);

const finalBodies = makeBodies(bestPos);
const finalOverlaps = countLayoutOverlaps(finalBodies);
console.log(`Overlaps: ${finalOverlaps}`);

const positions = centerLayoutPositions(bestPos);
writeFileSync(CURATED_PATH, `${JSON.stringify(positions, null, 2)}\n`);
const payload = {
  ...existingLayout,
  description: `Crossing-optimized layout — greedy + random-restart local search from best-known layout (${elapsed}s)`,
  positions,
  nodeNames: graph.nodeNames,
  metrics: { source: 'optimize_from_current', overlaps: finalOverlaps, crossings: bestCrossings, elapsedSeconds: Number(elapsed) },
};
writeFileSync(LAYOUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
console.log('Written to network-layout.json');
