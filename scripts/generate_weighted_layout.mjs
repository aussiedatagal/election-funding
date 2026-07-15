/**
 * Weighted-distance layout: a donor's distance to each party it funds is
 * approximately proportional to how *little* of its total giving went there
 * — the party that got the biggest share sits closest. E.g. a donor that
 * split 40/60 between Party A and Party B ends up nearer Party B. The ratio
 * is a soft target, not exact — crossing reduction is allowed to flex it.
 *
 * Per donor→party link with value v, and donor total T = Σv:
 *   frac        = v / T                                            (0, 1]
 *   minGap      = partyHalfDiagonal + donorRadius + GAP_BUFFER
 *   idealLength = minGap + LEN_SPREAD * (1 - frac)
 * frac = 1   (single-party donor)      → minGap (closest, but always a real
 *             visible gap from the party's edge — never flush against it,
 *             scaled to that specific party/donor's actual shape size)
 * frac = 0.5 (even split of 2 parties) → minGap + half of LEN_SPREAD
 * frac → 0   (small share of a big donor's total) → minGap + LEN_SPREAD (farthest)
 *
 * Forces (unchanged in kind from generate_equal_spacing_layout.mjs, just
 * rebalanced so the crossing-penalty force can win local arguments against
 * the spring rather than holding donors to an exact ratio):
 *   1. Tangential angular force: purely perpendicular to each edge, corrects
 *      the angle without changing the edge length (never fights the
 *      per-edge distance target above).
 *   2. Weighted edge spring: pulls each edge toward its own idealLength —
 *      loosened (lower K_SPRING) relative to the old equal-spacing script
 *      so it's a soft preference, not a hard constraint.
 *   3. Crossing-penalty force: signed-area gradient of the quadrilateral
 *      formed by any two crossing edges — strengthened (higher K_CROSS) so
 *      it can pull a donor off its exact ratio distance when that resolves
 *      a crossing.
 *   4. Repulsion between all pairs.
 *   5. Centering gravity.
 *
 * After the simulation settles and node-overlaps are resolved, a bounded
 * local greedy pass nudges multi-party ("core") donors within a limited
 * radius of their settled position — never a global search — to mop up any
 * remaining crossings, rejecting any move that would create a node overlap.
 * This is the "flex it a bit to reduce edge crossover" step: donors stay
 * close to their donation-share target but aren't pinned to it exactly.
 *
 * Seeds from src/data/network-layout-draft.json (the latest browser-saved
 * layout) when present, else from network-layout.json.
 *
 * Run: npm run weighted-layout
 */
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fundingData from '../src/data/funding.json' with { type: 'json' };
import { buildGraphFromFundingData, centerLayoutPositions } from '../src/lib/networkGraphBuild.js';
import {
  countLayoutOverlaps, donorRadius, partyHalfSize, partyHalfDiagonal,
  resolveBodyOverlaps, separateCircleCircle, separateCircleRect,
} from '../src/lib/networkGraphLayoutUtils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LAYOUT_PATH  = join(__dirname, '../src/data/network-layout.json');
const CURATED_PATH = join(__dirname, '../src/data/network-layout-curated.json');
const DRAFT_PATH   = join(__dirname, '../src/data/network-layout-draft.json');

// ── parameters ────────────────────────────────────────────────────────────────
const GAP_BUFFER = 34;     // px — minimum visible clearance beyond the shapes at frac=1
const LEN_SPREAD = 200;    // px — extra distance added on top of minGap as share shrinks toward 0
const K_ANGLE   = 0.04;    // tangential angular force (perpendicular to edge)
const K_SPRING  = 0.007;   // radial spring force toward each edge's idealLength (soft — see K_CROSS)
const K_CROSS   = 0.14;    // crossing-penalty force (normalised per crossing) — wins local fights vs spring
const K_REPULSE = 12000;   // repulsion constant between all pairs
const K_CENTER  = 0.003;   // gravity toward origin
const DAMPING   = 0.82;    // velocity damping per step
const N_ITER    = 4000;    // more iterations — crossing force needs time
const REFINE_PASSES = 6;   // local greedy crossing clean-up passes after the sim settles
const REFINE_RADII  = [40, 80, 130, 190]; // px — candidate offsets tried per donor, per pass
const REFINE_ANGLES = 16;  // candidate directions per radius
const NODE_CLEARANCE = 20; // px — added to every donor's radius for overlap-resolution/refinement
                            // purposes only, so donors never end up flush against a party's edge
                            // (or another donor) — real render radius is untouched.

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
  const partyData = nodeDataById.get(String(link.target));
  const donorData = nodeDataById.get(String(link.source));
  if (!src || !tgt || src.type !== 'donor' || tgt.type !== 'party' || !partyData || !donorData) {
    idealLength.set(link, 200);
    continue;
  }
  const total = donorTotals.get(link.source) || link.value;
  const frac = total > 0 ? link.value / total : 1;
  const minGap = partyHalfDiagonal(partyData) + donorRadius(donorData) + GAP_BUFFER;
  idealLength.set(link, minGap + LEN_SPREAD * (1 - frac));
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
let initPos = existingLayout.positions; // name → {x, y}
if (existsSync(DRAFT_PATH)) {
  initPos = JSON.parse(readFileSync(DRAFT_PATH, 'utf8'));
  console.log('Seeding from latest saved draft (network-layout-draft.json)');
} else {
  console.log('Seeding from network-layout.json (no draft found)');
}

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
  //     (donation-share proportional), not one shared rest length. Loosened
  //     (K_SPRING) so the crossing-penalty force can override it locally.
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
      const r = donorRadius(data) + NODE_CLEARANCE;
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
for (const b of bodies) allPos[b.name] = { x: b.x, y: b.y };
console.log(`Node overlaps after resolution: ${countLayoutOverlaps(bodies)}`);

// ── local greedy crossing refinement (bounded "flex") ─────────────────────────
// Nudges core (multi-party) donors within a limited radius of their settled
// position to mop up crossings the force sim didn't fully resolve. Parties
// and single-party donors stay fixed; a move is only accepted if it (a)
// introduces zero node overlaps and (b) strictly reduces that donor's
// crossing count. This deliberately does NOT search the whole canvas — it
// stays local, so positions keep tracking their donation-share target
// approximately while still chasing fewer crossings.
function buildDonorPartySegs(posMap) {
  const segs = [];
  for (const link of graphLinks) {
    const src = nodeById.get(link.source), tgt = nodeById.get(link.target);
    if (!src || !tgt || src.type !== 'donor' || tgt.type !== 'party') continue;
    const p1 = posMap[src.name], p2 = posMap[tgt.name];
    if (!p1 || !p2) continue;
    segs.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, d: src.name, p: tgt.name });
  }
  return segs;
}

function crossingsInvolving(dname, allSegs) {
  let n = 0;
  for (const ds of allSegs) {
    if (ds.d !== dname) continue;
    for (const other of allSegs) {
      if (other.d === dname || ds.p === other.p) continue;
      if (segmentsCross(ds.x1, ds.y1, ds.x2, ds.y2, other.x1, other.y1, other.x2, other.y2)) n++;
    }
  }
  return n;
}

function overlapsAnyBody(name, x, y, r, bodyByName) {
  // r already includes NODE_CLEARANCE (candidates come from body.r, built by
  // makeBodies), so this naturally keeps the same minimum gap as the main
  // overlap-resolution pass — no flush placements against a party's edge.
  for (const [otherName, b] of bodyByName) {
    if (otherName === name) continue;
    const hit = b.type === 'party'
      ? separateCircleRect(x, y, r, b.x, b.y, b.w, b.h)
      : separateCircleCircle(x, y, r, b.x, b.y, b.r);
    if (hit) return true;
  }
  return false;
}

const bodyByName = new Map(bodies.map(b => [b.name, b]));
const coreDonorNames = multiDonorIds.map(id => nodeById.get(id)?.name).filter(Boolean);

console.log(`\nLocal greedy refinement over ${coreDonorNames.length} multi-party donors...`);
for (let pass = 0; pass < REFINE_PASSES; pass++) {
  let improved = false;
  for (const dname of coreDonorNames) {
    const body = bodyByName.get(dname);
    if (!body) continue;
    let best = crossingsInvolving(dname, buildDonorPartySegs(allPos));
    if (best === 0) continue;
    const ox = allPos[dname].x, oy = allPos[dname].y;
    let bestX = ox, bestY = oy;
    for (const radius of REFINE_RADII) {
      for (let a = 0; a < REFINE_ANGLES; a++) {
        const theta = (2 * Math.PI * a) / REFINE_ANGLES;
        const cx = ox + radius * Math.cos(theta);
        const cy = oy + radius * Math.sin(theta);
        if (overlapsAnyBody(dname, cx, cy, body.r, bodyByName)) continue;
        allPos[dname] = { x: cx, y: cy };
        const c = crossingsInvolving(dname, buildDonorPartySegs(allPos));
        if (c < best) { best = c; bestX = cx; bestY = cy; improved = true; }
      }
    }
    allPos[dname] = { x: bestX, y: bestY };
    body.x = bestX; body.y = bestY;
  }
  if (!improved) break;
}
console.log(`Node overlaps after refinement: ${countLayoutOverlaps(bodies)}`);

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

const finalOverlaps = countLayoutOverlaps(makeBodies(positions));
writeFileSync(CURATED_PATH, `${JSON.stringify(positions, null, 2)}\n`);

const payload = {
  ...existingLayout,
  description: 'Weighted-distance layout — donor↔party distance approx. proportional to donation share, with crossing minimisation',
  positions,
  nodeNames: graph.nodeNames,
  metrics: { source: 'weighted_proportional', overlaps: finalOverlaps, crossings },
};
writeFileSync(LAYOUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Written: ${Object.keys(positions).length} nodes`);
