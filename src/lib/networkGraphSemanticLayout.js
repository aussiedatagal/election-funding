import {
  centerLayoutPositions,
  computePartySimilarity,
} from './networkGraphBuild.js';
import {
  countLayoutOverlaps,
  donorRadius,
  layoutBounds,
  partyHalfDiagonal,
  partyHalfSize,
  resolveBodyOverlaps,
} from './networkGraphLayoutUtils.js';

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function buildBodies(nodeById, nodeDataById) {
  const bodies = [];
  nodeById.forEach((node, id) => {
    const data = nodeDataById.get(String(id));
    if (node.type === 'party') {
      const { hw, hh } = partyHalfSize(data);
      bodies.push({
        id,
        name: node.name,
        type: 'party',
        x: 0,
        y: 0,
        hw,
        hh,
        w: hw * 2,
        h: hh * 2,
      });
    } else {
      const r = donorRadius(data);
      bodies.push({
        id,
        name: node.name,
        type: 'donor',
        x: 0,
        y: 0,
        r,
        hw: r,
        hh: r,
        w: r * 2,
        h: r * 2,
      });
    }
  });
  return bodies;
}

function cloneBodies(bodies) {
  return bodies.map(b => ({ ...b }));
}

/** Classical MDS → 2D from a distance matrix. */
function mds2(dist, targetSpan = 720) {
  const n = dist.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: 0, y: 0 }];

  const d2 = dist.map(row => row.map(d => d * d));
  const rowMean = d2.map(row => row.reduce((s, v) => s + v, 0) / n);
  const colMean = Array.from({ length: n }, (_, j) =>
    d2.reduce((s, row) => s + row[j], 0) / n);
  const grand = d2.flat().reduce((s, v) => s + v, 0) / (n * n);

  const b = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      -0.5 * (d2[i][j] - rowMean[i] - colMean[j] + grand)));

  const eigs = topEigenSymmetric(b, 2);
  const coords = Array.from({ length: n }, () => ({ x: 0, y: 0 }));
  for (let k = 0; k < eigs.length; k++) {
    const scale = Math.sqrt(Math.max(0, eigs[k].value));
    for (let i = 0; i < n; i++) {
      if (k === 0) coords[i].x = eigs[k].vec[i] * scale;
      else coords[i].y = eigs[k].vec[i] * scale;
    }
  }

  const xs = coords.map(p => p.x);
  const ys = coords.map(p => p.y);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
  const s = targetSpan / span;
  return coords.map(p => ({ x: p.x * s, y: p.y * s }));
}

function topEigenSymmetric(matrix, k) {
  const n = matrix.length;
  const results = [];
  let work = matrix.map(row => [...row]);

  for (let comp = 0; comp < k; comp++) {
    let vec = Array.from({ length: n }, () => Math.random() - 0.5);
    vec = normalize(vec);

    for (let iter = 0; iter < 80; iter++) {
      const next = multiplySym(work, vec);
      vec = normalize(next);
    }

    const Av = multiplySym(work, vec);
    const value = dot(vec, Av);
    results.push({ value, vec: [...vec] });

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        work[i][j] -= value * vec[i] * vec[j];
      }
    }
  }

  return results.sort((a, b) => b.value - a.value);
}

function multiplySym(m, v) {
  const n = m.length;
  const out = Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) out[i] += m[i][j] * v[j];
  }
  return out;
}

function dot(a, b) {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

function normalize(v) {
  const len = Math.hypot(...v) || 1;
  return v.map(x => x / len);
}

function partyDistanceMatrix(partyIds, simEdges) {
  const n = partyIds.length;
  const index = new Map(partyIds.map((id, i) => [id, i]));
  const sim = Array.from({ length: n }, () => Array(n).fill(0));

  for (const { p1, p2, norm } of simEdges) {
    const i = index.get(p1);
    const j = index.get(p2);
    if (i == null || j == null) continue;
    sim[i][j] = norm;
    sim[j][i] = norm;
  }

  const dist = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = sim[i][j];
      const d = s > 0 ? 120 + 380 * (1 - s) : 520;
      dist[i][j] = d;
      dist[j][i] = d;
    }
  }
  return dist;
}

function donorLinksByParty(graphLinks, nodeById) {
  const map = new Map();
  for (const link of graphLinks) {
    const src = nodeById.get(link.source);
    const tgt = nodeById.get(link.target);
    if (src?.type !== 'donor' || tgt?.type !== 'party') continue;
    if (!map.has(link.source)) map.set(link.source, []);
    map.get(link.source).push({ partyId: link.target, weight: Math.log1p(link.value) });
  }
  return map;
}

function seedFromSimilarity(bodies, partyIds, simEdges, graphLinks, nodeById, nodeDataById, seed) {
  const rng = mulberry32(seed);
  const parties = bodies.filter(b => b.type === 'party');
  const donors = bodies.filter(b => b.type === 'donor');
  const partyById = new Map(parties.map(p => [p.id, p]));

  const dist = partyDistanceMatrix(partyIds, simEdges);
  const mds = mds2(dist, 760);

  const angle = rng() * Math.PI * 2;
  const flip = rng() > 0.5 ? 1 : -1;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  partyIds.forEach((id, i) => {
    const body = partyById.get(id);
    if (!body) return;
    const x = mds[i].x;
    const y = mds[i].y * flip;
    body.x = x * cos - y * sin;
    body.y = x * sin + y * cos;
  });

  resolveBodyOverlaps(parties, 60);

  const linksByDonor = donorLinksByParty(graphLinks, nodeById);
  let cx = 0;
  let cy = 0;
  parties.forEach(p => { cx += p.x; cy += p.y; });
  cx /= parties.length || 1;
  cy /= parties.length || 1;

  donors.forEach((donor, idx) => {
    const links = linksByDonor.get(donor.id) || [];
    const data = nodeDataById.get(String(donor.id));
    let wx = 0;
    let wy = 0;
    let wsum = 0;
    for (const { partyId, weight } of links) {
      const party = partyById.get(partyId);
      if (!party) continue;
      wx += party.x * weight;
      wy += party.y * weight;
      wsum += weight;
    }

    if (!wsum) {
      donor.x = cx + (rng() - 0.5) * 400;
      donor.y = cy + (rng() - 0.5) * 400;
      return;
    }

    wx /= wsum;
    wy /= wsum;
    let dx = wx - cx;
    let dy = wy - cy;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;

    const primary = links.reduce((best, l) => (l.weight > best.weight ? l : best), links[0]);
    const anchor = partyById.get(primary.partyId);
    const pData = nodeDataById.get(String(primary.partyId));
    const orbit = partyHalfDiagonal(pData) + donorRadius(data) + 22;
    const spread = (idx % 7 - 3) * 0.22;
    const px = -dy;
    const py = dx;

    donor.x = wx + dx * orbit + px * orbit * spread;
    donor.y = wy + dy * orbit + py * orbit * spread;
  });

  resolveBodyOverlaps(bodies, 100);
}

function relax(bodies, partyIds, simEdges, graphLinks, nodeById, nodeDataById, steps = 2500) {
  const parties = bodies.filter(b => b.type === 'party');
  const partyById = new Map(parties.map(p => [p.id, p]));
  const bodyById = new Map(bodies.map(b => [b.id, b]));
  const linksByDonor = donorLinksByParty(graphLinks, nodeById);

  const simSprings = simEdges.map(({ p1, p2, norm }) => ({
    a: partyById.get(p1),
    b: partyById.get(p2),
    ideal: 90 + 170 * (1 - norm),
    weight: norm,
  })).filter(s => s.a && s.b);

  const maxVal = Math.max(...graphLinks.map(l => l.value || 0), 1);

  for (let step = 0; step < steps; step++) {
    for (const { a, b, ideal, weight } of simSprings) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const pull = (dist - ideal) * 0.035 * weight;
      const mx = (dx / dist) * pull * 0.5;
      const my = (dy / dist) * pull * 0.5;
      a.x += mx;
      a.y += my;
      b.x -= mx;
      b.y -= my;
    }

    for (const donor of bodies.filter(b => b.type === 'donor')) {
      const links = linksByDonor.get(donor.id) || [];
      for (const { partyId, weight } of links) {
        const party = partyById.get(partyId);
        if (!party) continue;
        const dx = party.x - donor.x;
        const dy = party.y - donor.y;
        const dist = Math.hypot(dx, dy) || 1;
        const pData = nodeDataById.get(String(party.id));
        const dData = nodeDataById.get(String(donor.id));
        const ideal = partyHalfDiagonal(pData) + donorRadius(dData) + 30;
        const w = 0.03 * (weight / Math.log1p(maxVal));
        const pull = (dist - ideal) * w;
        donor.x += (dx / dist) * pull;
        donor.y += (dy / dist) * pull;
      }
    }

    resolveBodyOverlaps(bodies, 3);
  }

  for (let i = 0; i < 300; i++) {
    resolveBodyOverlaps(bodies, 3);
    if (countLayoutOverlaps(bodies) === 0) break;
  }
}

function similarityStress(parties, partyIds, simEdges) {
  const byId = new Map(parties.map(p => [p.id, p]));
  let stress = 0;
  for (const { p1, p2, norm } of simEdges) {
    const a = byId.get(p1);
    const b = byId.get(p2);
    if (!a || !b) continue;
    const ideal = 90 + 170 * (1 - norm);
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    stress += norm * (d - ideal) ** 2;
  }
  return stress;
}

/**
 * Layout driven by shared-donor similarity (MDS) + collision resolution.
 * Similar parties end up near each other; donors orbit the parties they fund.
 */
export function buildSemanticLayout({
  nodeById,
  graphLinks,
  cyElements,
  seeds = 24,
}) {
  const nodeDataById = new Map(
    cyElements.filter(el => el.group === 'nodes').map(el => [el.data.id, el.data])
  );
  const template = buildBodies(nodeById, nodeDataById);
  const partyIds = [];
  nodeById.forEach((node, id) => { if (node.type === 'party') partyIds.push(id); });

  const simEdges = computePartySimilarity(graphLinks, nodeById);
  let best = null;

  for (let seed = 1; seed <= seeds; seed++) {
    const bodies = cloneBodies(template);
    seedFromSimilarity(bodies, partyIds, simEdges, graphLinks, nodeById, nodeDataById, seed * 7919);
    relax(bodies, partyIds, simEdges, graphLinks, nodeById, nodeDataById);

    const overlaps = countLayoutOverlaps(bodies);
    const stress = similarityStress(bodies.filter(b => b.type === 'party'), partyIds, simEdges);
    const bounds = layoutBounds(bodies);
    const score = overlaps * 1e6 + stress + bounds.area * 0.0001;
    const candidate = { seed, bodies, overlaps, stress, bounds, score };

    if (!best || candidate.score < best.score) best = candidate;
    if (overlaps === 0 && stress < (best.stress ?? Infinity) * 0.95) break;
  }

  const raw = {};
  for (const body of best.bodies) {
    raw[body.name] = { x: body.x, y: body.y };
  }

  return {
    positions: centerLayoutPositions(raw),
    seed: best.seed,
    metrics: {
      overlaps: best.overlaps,
      similarityStress: Math.round(best.stress),
      spanX: Math.round(best.bounds.spanX),
      spanY: Math.round(best.bounds.spanY),
      simEdges: simEdges.length,
    },
    view: { fitTarget: 'all', fitPadding: 36, zoomBoost: 1.0 },
  };
}
