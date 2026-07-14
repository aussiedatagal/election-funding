/**
 * Weighted-distance layout: a donor's distance to each party it funds is
 * proportional to how *little* of its total giving went there — the party
 * that got the biggest share sits closest. E.g. a donor that split 40/60
 * between Party A and Party B ends up nearer Party B.
 *
 * Per donor→party link with value v, and donor total T = Σv:
 *   frac        = v / T                          (0, 1]
 *   idealLength = LEN_MIN + (LEN_MAX - LEN_MIN) * (1 - frac)
 * frac = 1   (single-party donor)      → LEN_MIN (closest)
 * frac = 0.5 (even split of 2 parties) → midpoint, same as the old constant
 *             REST_LENGTH used by the equal-spacing layout
 * frac → 0   (small share of a big donor's total) → LEN_MAX (farthest)
 *
 * This ideal length replaces the constant REST_LENGTH spring target from
 * generate_equal_spacing_layout.mjs; every other force is unchanged and
 * still fights for zero crossings:
 *   1. Tangential angular force: purely perpendicular to each edge, corrects
 *      the angle without changing the edge length (so it doesn't fight the
 *      per-edge distance targets above).
 *   2. Weighted edge spring: pulls each edge toward its own idealLength
 *      rather than one shared rest length.
 *   3. Crossing-penalty force: signed-area gradient of the quadrilateral
 *      formed by any two crossing edges. Normalised so magnitude = K_CROSS
 *      per crossing.
 *   4. Repulsion between all pairs.
 *   5. Centering gravity.
 *
 * Run: npm run weighted-layout
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

// ── parameters ────────────────────────────────────────────────────────────────
const LEN_MIN   = 90;      // px — ideal length for a donor's largest-share party
const LEN_MAX   = 310;     // px — ideal length for a donor's smallest-share party
const K_ANGLE   = 0.04;    // tangential angular force (perpendicular to edge)
const K_SPRING  = 0.012;   // radial spring force toward each edge's idealLength
const K_CROSS   = 0.10;    // crossing-penalty force (normalised per crossing)
const K_REPULSE = 12000;   // repulsion constant between all pairs
const K_CENTER  = 0.003;   // gravity toward origin
const DAMPING   = 0.82;    // velocity damping per step
const N_ITER    = 4000;    // more iterations — crossing force needs time

// ── graph ─────────────────────────────────────────────────────────────────────
const graph = buildGraphFromFundingData(fundingData.combined);
const { graphLinks, nodeById } = graph;
const nodeDataById = new Map(
  graph.cyElements.filter(el => el.group === 'nodes').map(el => [el.data.id, el.data])
);

// ── per-link ideal length from donation share ─────────────────────────────────
const donorTotals = new Map(); // donor id → total donated across all parties
for (const link of graphLinks) {
  const src = nodeById.get(link.source), tgt = nodeById.get(link.target);
  if (!src || !tgt || src.type !== 'donor' || tgt.type !== 'party') continue;
  donorTotals.set(link.source, (donorTotals.get(link.source) || 0) + link.value);
}

const idealLength = new Map(); // link → px
for (const link of graphLinks) {
  const src = nodeById.get(link.source), tgt = nodeById.get(link.target);
  if (!src || !tgt || src.type !== 'donor' || tgt.type !== 'party') { idealLength.set(link, LEN_MIN); continue; }
  const total = donorTotals.get(link.source) || link.value;
  const frac = total > 0 ? link.value / total : 1;
  idealLength.set(link, LEN_MIN + (LEN_MAX - LEN_MIN) * (1 - frac));
}

console.log('Donation-share examples (multi-party donors):');
const multiDonorIds = [...donorTotals.keys()].filter(id =>
  graphLinks.filter(l => l.source === id && nodeById.get(l.target)?.type === 'party').length > 1
);
for (const id of multiDonorIds.slice(0, 8)) {
  const name = nodeById.get(id)?.name;
  const links = graphLinks.filter(l => l.source === id);
  const parts = links.map(l => {
    const frac = l.value / donorTotals.get(id);
    return `${nodeById.get(l.target)?.name} ${(frac * 100).toFixed(0)}% → ${idealLength.get(l).toFixed(0)}px`;
  });
  console.log(`  ${name}: ${parts.join(', ')}`);
}

// ── node list and adjacency ───────────────────────────────────────────────────
const nodes = [];
nodeById.forEach((node, id) => nodes.push({ id, name: node.name, type: node.type }));
console.log(`\nNodes: ${nodes.length}`);

const adjacency = new Map(); // id → Set<id>
nodes.forEach(n => adjacency.set(n.id, new Set()));
for (const link of graphLinks) {
  adjacency.get(link.source)?.add(link.target);
  adjacency.get(link.target)?.add(link.source);
}

// ── load initial positions ────────────────────────────────────────────────────
const existingLayout = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'));
const initPos = existingLayout.positions; // name → {x, y}

// ── initialise state ──────────────────────────────────────────────────────────
const pos = new Map(); // id → {x, y}
const vel = new Map(); // id → {vx, vy}
nodes.forEach(n => {
  const p = initPos[n.name];
  pos.set(n.id, p ? { x: p.x, y: p.y } : { x: (Math.random() - 0.5) * 800, y: (Math.random() - 0.5) * 600 });
  vel.set(n.id, { vx: 0, vy: 0 });
});

// ── helpers ───────────────────────────────────────────────────────────────────
function circularMean(angles) {
  const sx = angles.reduce((s, a) => s + Math.cos(a), 0);
  const sy = angles.reduce((s, a) => s + Math.sin(a), 0);
  return Math.atan2(sy, sx);
}

// Signed angle difference wrapped to (−π, π]
function angleDiff(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function cross2dInline(ox, oy, ax, ay, bx, by) {
  return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
}

// True if segment AB and segment CD properly intersect (no shared endpoints).
function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = cross2dInline(cx, cy, dx, dy, ax, ay);
  const d2 = cross2dInline(cx, cy, dx, dy, bx, by);
  const d3 = cross2dInline(ax, ay, bx, by, cx, cy);
  const d4 = cross2dInline(ax, ay, bx, by, dx, dy);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// Build donor→party segments only (matches the final crossing count metric).
function buildSegments() {
  const segs = [];
  for (const link of graphLinks) {
    const src = nodeById.get(link.source), tgt = nodeById.get(link.target);
    if (!src || !tgt || src.type !== 'donor' || tgt.type !== 'party') continue;
    const pa = pos.get(link.source), pb = pos.get(link.target);
    if (!pa || !pb) continue;
    segs.push({ aid: link.source, bid: link.target,
                ax: pa.x, ay: pa.y, bx: pb.x, by: pb.y });
  }
  return segs;
}

// ── simulation ────────────────────────────────────────────────────────────────
for (let iter = 0; iter < N_ITER; iter++) {
  const forces = new Map();
  nodes.forEach(n => forces.set(n.id, { fx: 0, fy: 0 }));

  // 1a. Weighted edge spring — pulls each edge toward its own idealLength
  //     (donation-share proportional), not one shared rest length.
  for (const link of graphLinks) {
    const pa = pos.get(link.source), pb = pos.get(link.target);
    if (!pa || !pb) continue;
    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const sf = K_SPRING * (d - idealLength.get(link));
    const ux = dx / d, uy = dy / d;
    forces.get(link.source).fx += sf * ux;  forces.get(link.source).fy += sf * uy;
    forces.get(link.target).fx -= sf * ux;  forces.get(link.target).fy -= sf * uy;
  }

  // 1b. Tangential angular force (purely perpendicular to edge — no radial component)
  //     For each hub u with k ≥ 2 neighbours: correct each neighbour's angle to
  //     achieve equal spacing, without pushing radially (so it never fights the
  //     weighted distance target above).
  for (const u of nodes) {
    const pu = pos.get(u.id);
    const nbrs = [...(adjacency.get(u.id) || [])]
      .map(vid => { const pv = pos.get(vid); return pv ? { id: vid, x: pv.x, y: pv.y } : null; })
      .filter(Boolean);
    const k = nbrs.length;
    if (k < 2) continue;

    const sorted = nbrs
      .map(v => ({ id: v.id, x: v.x, y: v.y, angle: Math.atan2(v.y - pu.y, v.x - pu.x) }))
      .sort((a, b) => a.angle - b.angle);

    const spacing = (2 * Math.PI) / k;
    const alpha   = circularMean(sorted.map((v, i) => v.angle - i * spacing));

    sorted.forEach((v, i) => {
      const idealAngle = alpha + i * spacing;
      const dx = v.x - pu.x, dy = v.y - pu.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const err  = angleDiff(idealAngle, Math.atan2(dy, dx));
      // Tangential direction = 90° CCW from the current edge direction
      const perpX = -dy / dist, perpY = dx / dist;
      const f = K_ANGLE * dist * Math.sin(err);
      forces.get(v.id).fx += f * perpX;  forces.get(v.id).fy += f * perpY;
      forces.get(u.id).fx -= f * perpX;  forces.get(u.id).fy -= f * perpY;
    });
  }

  // 1c. Crossing-penalty force (signed-area gradient, normalised)
  //     For crossing donor→party edges A→B and C→D, maximising the signed area
  //     of quad ABDC unwinds the crossing. Normalising by gradient magnitude
  //     gives a bounded force = K_CROSS per crossing regardless of edge length.
  {
    const segs = buildSegments();
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const s1 = segs[i], s2 = segs[j];
        if (s1.aid === s2.aid || s1.aid === s2.bid ||
            s1.bid === s2.aid || s1.bid === s2.bid) continue;
        if (!segmentsCross(s1.ax, s1.ay, s1.bx, s1.by,
                           s2.ax, s2.ay, s2.bx, s2.by)) continue;
        const rawAx = s1.by - s2.ay, rawAy = s2.ax - s1.bx; // ∂Area/∂A
        const rawBx = s2.by - s1.ay, rawBy = s1.ax - s2.bx; // ∂Area/∂B
        const mag = Math.sqrt(rawAx**2 + rawAy**2 + rawBx**2 + rawBy**2) || 1;
        const fAx = K_CROSS * rawAx / mag, fAy = K_CROSS * rawAy / mag;
        const fBx = K_CROSS * rawBx / mag, fBy = K_CROSS * rawBy / mag;
        forces.get(s1.aid).fx += fAx;  forces.get(s1.aid).fy += fAy;
        forces.get(s1.bid).fx += fBx;  forces.get(s1.bid).fy += fBy;
        forces.get(s2.aid).fx -= fBx;  forces.get(s2.aid).fy -= fBy; // C = −∂/∂B
        forces.get(s2.bid).fx -= fAx;  forces.get(s2.bid).fy -= fAy; // D = −∂/∂A
      }
    }
  }

  // 2. Repulsion between all pairs
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const pi = pos.get(nodes[i].id);
      const pj = pos.get(nodes[j].id);
      const dx = pi.x - pj.x, dy = pi.y - pj.y;
      const d2 = Math.max(dx * dx + dy * dy, 1);
      const d  = Math.sqrt(d2);
      const f  = K_REPULSE / d2;
      forces.get(nodes[i].id).fx += f * dx / d;
      forces.get(nodes[i].id).fy += f * dy / d;
      forces.get(nodes[j].id).fx -= f * dx / d;
      forces.get(nodes[j].id).fy -= f * dy / d;
    }
  }

  // 4. Centering gravity
  nodes.forEach(n => {
    const p = pos.get(n.id);
    forces.get(n.id).fx -= K_CENTER * p.x;
    forces.get(n.id).fy -= K_CENTER * p.y;
  });

  // 5. Update velocities and positions
  nodes.forEach(n => {
    const v = vel.get(n.id);
    const f = forces.get(n.id);
    v.vx = (v.vx + f.fx) * DAMPING;
    v.vy = (v.vy + f.fy) * DAMPING;
    const p = pos.get(n.id);
    p.x += v.vx;
    p.y += v.vy;
  });

  if (iter % 500 === 0) {
    let totalErr = 0, edgeCount = 0;
    for (const link of graphLinks) {
      const p1 = pos.get(link.source), p2 = pos.get(link.target);
      if (!p1 || !p2) continue;
      const d = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
      totalErr += Math.abs(d - idealLength.get(link));
      edgeCount++;
    }
    const segsNow = buildSegments();
    let cx = 0;
    for (let i = 0; i < segsNow.length; i++)
      for (let j = i + 1; j < segsNow.length; j++) {
        const a = segsNow[i], b = segsNow[j];
        if (a.aid === b.aid || a.aid === b.bid || a.bid === b.aid || a.bid === b.bid) continue;
        if (segmentsCross(a.ax, a.ay, a.bx, a.by, b.ax, b.ay, b.bx, b.by)) cx++;
      }
    console.log(`Iter ${iter}: avg length error ${(totalErr / edgeCount).toFixed(0)}px  crossings ${cx}`);
  }
}

// ── convert to name-keyed positions ──────────────────────────────────────────
const allPos = {};
nodes.forEach(n => {
  const p = pos.get(n.id);
  allPos[n.name] = { x: p.x, y: p.y };
});

// ── resolve body overlaps ─────────────────────────────────────────────────────
function makeBodies(posMap) {
  const bodies = [];
  nodeById.forEach((node, id) => {
    const p = posMap[node.name]; if (!p) return;
    const data = nodeDataById.get(String(id));
    if (node.type === 'party') {
      const { hw, hh } = partyHalfSize(data);
      bodies.push({ id, name: node.name, type: 'party', x: p.x, y: p.y, hw, hh, w: hw * 2, h: hh * 2 });
    } else {
      const r = donorRadius(data);
      bodies.push({ id, name: node.name, type: 'donor', x: p.x, y: p.y, r, hw: r, hh: r, w: r * 2, h: r * 2 });
    }
  });
  return bodies;
}

const bodies = makeBodies(allPos);
const partyIds = new Set(bodies.filter(b => b.type === 'party').map(b => b.id));

console.log('\nResolving overlaps...');
for (let i = 0; i < 600; i++) {
  resolveBodyOverlaps(bodies, 4, partyIds);
  for (const b of bodies) if (b.type === 'party') { const p = allPos[b.name]; b.x = p.x; b.y = p.y; }
  if (countLayoutOverlaps(bodies) === 0) break;
}
for (let i = 0; i < 200; i++) {
  resolveBodyOverlaps(bodies, 4);
  if (countLayoutOverlaps(bodies) === 0) break;
}

const finalOverlaps = countLayoutOverlaps(bodies);
console.log(`Node overlaps: ${finalOverlaps}`);
for (const b of bodies) allPos[b.name] = { x: b.x, y: b.y };

// ── write output ──────────────────────────────────────────────────────────────
const positions = centerLayoutPositions(allPos);

// Count final edge crossings using the segmentsCross helper defined above
const finalSegs = [];
for (const l of graphLinks) {
  const src = nodeById.get(l.source), tgt = nodeById.get(l.target);
  if (!src || !tgt || src.type !== 'donor' || tgt.type !== 'party') continue;
  const p1 = positions[src.name], p2 = positions[tgt.name];
  if (!p1 || !p2) continue;
  finalSegs.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, d: src.name, p: tgt.name });
}
let crossings = 0;
for (let i = 0; i < finalSegs.length; i++) {
  for (let j = i + 1; j < finalSegs.length; j++) {
    const a = finalSegs[i], b = finalSegs[j];
    if (a.d === b.d || a.p === b.p) continue;
    if (segmentsCross(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2)) crossings++;
  }
}
console.log(`\nEdge crossings: ${crossings}`);

writeFileSync(CURATED_PATH, `${JSON.stringify(positions, null, 2)}\n`);

const payload = {
  ...existingLayout,
  description: 'Weighted-distance layout — donor↔party distance proportional to donation share, with crossing minimisation',
  positions,
  nodeNames: graph.nodeNames,
  metrics: { source: 'weighted_proportional', overlaps: finalOverlaps, crossings },
};
writeFileSync(LAYOUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Written: ${Object.keys(positions).length} nodes`);
