import { centerLayoutPositions } from './networkGraphBuild.js';
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

function primaryPartyByDonor(graphLinks, nodeById) {
  const map = new Map();
  for (const link of graphLinks) {
    const src = nodeById.get(link.source);
    const tgt = nodeById.get(link.target);
    if (!src || !tgt) continue;
    const donorId = src.type === 'donor' ? link.source : link.target;
    const partyId = src.type === 'party' ? link.source : link.target;
    const prev = map.get(donorId);
    if (!prev || link.value > prev.value) {
      map.set(donorId, { partyId, value: link.value });
    }
  }
  return map;
}

function seedPositions(bodies, graphLinks, nodeById, nodeDataById, seed) {
  const rng = mulberry32(seed);
  const parties = bodies.filter(b => b.type === 'party');
  const donors = bodies.filter(b => b.type === 'donor');
  const partyById = new Map(parties.map(p => [p.id, p]));
  const primary = primaryPartyByDonor(graphLinks, nodeById);

  const ringR = 320 + parties.length * 18;
  parties
    .sort((a, b) => {
      const da = nodeDataById.get(String(a.id));
      const db = nodeDataById.get(String(b.id));
      return partyHalfDiagonal(db) - partyHalfDiagonal(da);
    })
    .forEach((party, i) => {
      const angle = (Math.PI * 2 * i) / parties.length - Math.PI / 2;
      party.x = Math.cos(angle) * ringR + (rng() - 0.5) * 60;
      party.y = Math.sin(angle) * ringR + (rng() - 0.5) * 60;
    });

  resolveBodyOverlaps(parties, 40);

  for (const donor of donors) {
    const anchor = primary.get(donor.id)?.partyId;
    const party = partyById.get(anchor) ?? parties[Math.floor(rng() * parties.length)];
    const data = nodeDataById.get(String(donor.id));
    const pData = nodeDataById.get(String(party.id));
    const angle = rng() * Math.PI * 2;
    const gap = partyHalfDiagonal(pData) + donorRadius(data) + 28 + rng() * 36;
    donor.x = party.x + Math.cos(angle) * gap;
    donor.y = party.y + Math.sin(angle) * gap;
  }

  resolveBodyOverlaps(bodies, 80);
}

function idealLinkLength(a, b, nodeDataById) {
  const da = nodeDataById.get(String(a.id));
  const db = nodeDataById.get(String(b.id));
  if (a.type === 'party' && b.type === 'party') return 220;
  const party = a.type === 'party' ? a : b;
  const donor = a.type === 'donor' ? a : b;
  const pData = nodeDataById.get(String(party.id));
  const dData = nodeDataById.get(String(donor.id));
  return partyHalfDiagonal(pData) + donorRadius(dData) + 26;
}

function linkWeight(value, maxValue) {
  if (!maxValue) return 1;
  return 0.25 + 0.75 * (Math.log1p(value || 0) / Math.log1p(maxValue));
}

function simulate(bodies, graphLinks, nodeById, nodeDataById, {
  steps = 3500,
  springPull = 0.06,
  collisionPasses = 3,
}) {
  const bodyById = new Map(bodies.map(b => [b.id, b]));
  const maxValue = Math.max(...graphLinks.map(l => l.value || 0), 1);
  const links = graphLinks
    .map(l => ({
      a: bodyById.get(l.source),
      b: bodyById.get(l.target),
      weight: linkWeight(l.value, maxValue),
    }))
    .filter(l => l.a && l.b);

  for (let step = 0; step < steps; step++) {
    for (const { a, b, weight } of links) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ideal = idealLinkLength(a, b, nodeDataById);
      const delta = (dist - ideal) * springPull * weight;
      const mx = (dx / dist) * delta * 0.5;
      const my = (dy / dist) * delta * 0.5;
      a.x += mx;
      a.y += my;
      b.x -= mx;
      b.y -= my;
    }

    resolveBodyOverlaps(bodies, collisionPasses);
  }

  for (let i = 0; i < 200; i++) {
    resolveBodyOverlaps(bodies, 3);
    if (countLayoutOverlaps(bodies) === 0) break;
  }
}

function bodiesToPositions(bodies, nodeById) {
  const raw = {};
  for (const body of bodies) {
    const node = nodeById.get(body.id);
    if (node) raw[node.name] = { x: body.x, y: body.y };
  }
  return raw;
}

function cloneBodies(bodies) {
  return bodies.map(b => ({ ...b }));
}

/**
 * Offline force simulation with rectangle/circle collision resolution.
 * Tries multiple seeds and returns the most compact overlap-free layout found.
 */
export function buildPhysicsLayout({
  nodeById,
  graphLinks,
  cyElements,
  seeds = 24,
  maxSteps = 3500,
}) {
  const nodeDataById = new Map(
    cyElements.filter(el => el.group === 'nodes').map(el => [el.data.id, el.data])
  );
  const template = buildBodies(nodeById, nodeDataById);

  let best = null;

  for (let seed = 1; seed <= seeds; seed++) {
    const bodies = cloneBodies(template);
    seedPositions(bodies, graphLinks, nodeById, nodeDataById, seed * 9973);
    simulate(bodies, graphLinks, nodeById, nodeDataById, { steps: maxSteps });

    const overlaps = countLayoutOverlaps(bodies);
    const bounds = layoutBounds(bodies);
    const candidate = { seed, bodies, overlaps, bounds, area: bounds.area };

    if (!best || candidate.overlaps < best.overlaps
      || (candidate.overlaps === best.overlaps && candidate.area < best.area)) {
      best = candidate;
    }
    if (candidate.overlaps === 0 && candidate.area < 4_500_000) break;
  }

  if (best.overlaps > 0) {
    for (let extra = 0; extra < 400; extra++) {
      resolveBodyOverlaps(best.bodies, 3);
      best.overlaps = countLayoutOverlaps(best.bodies);
      if (best.overlaps === 0) break;
    }
    best.bounds = layoutBounds(best.bodies);
    best.area = best.bounds.area;
  }

  const raw = bodiesToPositions(best.bodies, nodeById);
  const positions = centerLayoutPositions(raw);

  return {
    positions,
    seed: best.seed,
    metrics: {
      overlaps: best.overlaps,
      spanX: Math.round(best.bounds.spanX),
      spanY: Math.round(best.bounds.spanY),
      area: Math.round(best.area),
      seedsTried: seeds,
    },
    view: {
      fitTarget: 'all',
      fitPadding: 36,
      zoomBoost: 1.0,
    },
  };
}
