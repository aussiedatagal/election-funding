import { centerLayoutPositions } from './networkGraphBuild.js';
import {
  countLayoutOverlaps,
  donorRadius,
  layoutBounds,
  partyHalfDiagonal,
  partyHalfSize,
  resolveBodyOverlaps,
} from './networkGraphLayoutUtils.js';
import {
  HAND_DONOR_POSITIONS,
  HAND_NODE_NUDGES,
  MANUAL_PARTY_POSITIONS,
} from './networkGraphManualLayout.js';

function buildBodies(nodeById, nodeDataById) {
  const bodies = [];
  nodeById.forEach((node, id) => {
    const data = nodeDataById.get(String(id));
    if (node.type === 'party') {
      const { hw, hh } = partyHalfSize(data);
      bodies.push({
        id, name: node.name, type: 'party', x: 0, y: 0,
        hw, hh, w: hw * 2, h: hh * 2,
      });
    } else {
      const r = donorRadius(data);
      bodies.push({
        id, name: node.name, type: 'donor', x: 0, y: 0,
        r, hw: r, hh: r, w: r * 2, h: r * 2,
      });
    }
  });
  return bodies;
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

function pinParties(bodies, nodeById) {
  const missing = [];
  for (const body of bodies) {
    if (body.type !== 'party') continue;
    const node = nodeById.get(body.id);
    const pos = MANUAL_PARTY_POSITIONS[node.name];
    if (!pos) { missing.push(node.name); continue; }
    body.x = pos.x;
    body.y = pos.y;
  }
  if (missing.length) throw new Error(`Missing manual positions: ${missing.join(', ')}`);
}

/** Even arc of donors around each party — avoids clumped halos. */
function placeDonorsOnArcs(bodies, graphLinks, nodeById, nodeDataById) {
  const parties = bodies.filter(b => b.type === 'party');
  const partyById = new Map(parties.map(p => [p.id, p]));
  const linksByDonor = donorLinksByParty(graphLinks, nodeById);

  const donorsByPrimary = new Map();
  for (const body of bodies.filter(b => b.type === 'donor')) {
    const links = linksByDonor.get(body.id) || [];
    if (!links.length) continue;
    const primary = links.reduce((a, b) => (a.weight > b.weight ? a : b)).partyId;
    if (!donorsByPrimary.has(primary)) donorsByPrimary.set(primary, []);
    donorsByPrimary.get(primary).push({ body, links });
  }

  for (const [partyId, donors] of donorsByPrimary) {
    const party = partyById.get(partyId);
    if (!party) continue;
    const pData = nodeDataById.get(String(partyId));
    const baseR = partyHalfDiagonal(pData) + 50;
    const n = donors.length;

    donors.sort((a, b) => a.body.name.localeCompare(b.body.name));

    donors.forEach(({ body, links }, i) => {
      const dData = nodeDataById.get(String(body.id));
      const r = donorRadius(dData);
      const multi = links.length > 1;

      let angle;
      if (multi) {
        let wx = 0; let wy = 0; let wsum = 0;
        for (const { partyId: pid, weight } of links) {
          const p = partyById.get(pid);
          if (!p) continue;
          wx += p.x * weight; wy += p.y * weight; wsum += weight;
        }
        wx /= wsum; wy /= wsum;
        const dx = wx - party.x;
        const dy = wy - party.y;
        angle = Math.atan2(dy, dx);
        const dist = partyHalfDiagonal(pData) + r + 58;
        body.x = party.x + Math.cos(angle) * dist;
        body.y = party.y + Math.sin(angle) * dist;
        return;
      }

      const arc = Math.min(Math.PI * 1.35, 0.45 + n * 0.11);
      const start = -Math.PI / 2 - arc / 2;
      angle = n === 1 ? -Math.PI / 2 : start + (i / (n - 1)) * arc;

      const ring = baseR + r + Math.floor(i / 8) * 30;
      body.x = party.x + Math.cos(angle) * ring;
      body.y = party.y + Math.sin(angle) * ring;
    });
  }

  let orphan = 0;
  for (const body of bodies.filter(b => b.type === 'donor')) {
    if (body.x !== 0 || body.y !== 0) continue;
    body.x = -500 + (orphan % 6) * 45;
    body.y = 520 + Math.floor(orphan / 6) * 40;
    orphan++;
  }
}

function applyNudges(bodies) {
  for (const body of bodies) {
    const n = HAND_NODE_NUDGES[body.name];
    if (n) { body.x += n.x; body.y += n.y; }
  }
}

function applyDonorOverrides(bodies) {
  for (const body of bodies) {
    if (body.type !== 'donor') continue;
    const pos = HAND_DONOR_POSITIONS[body.name];
    if (pos) {
      body.x = pos.x;
      body.y = pos.y;
    }
  }
}

function relaxDonors(bodies, graphLinks, nodeById, nodeDataById) {
  const parties = bodies.filter(b => b.type === 'party');
  const pinned = new Map(parties.map(p => [p.id, { x: p.x, y: p.y }]));
  const partyById = new Map(parties.map(p => [p.id, p]));
  const linksByDonor = donorLinksByParty(graphLinks, nodeById);
  const maxVal = Math.max(...graphLinks.map(l => l.value || 0), 1);

  for (let step = 0; step < 3500; step++) {
    for (const donor of bodies.filter(b => b.type === 'donor')) {
      for (const { partyId, weight } of linksByDonor.get(donor.id) || []) {
        const party = partyById.get(partyId);
        if (!party) continue;
        const dx = party.x - donor.x;
        const dy = party.y - donor.y;
        const dist = Math.hypot(dx, dy) || 1;
        const pData = nodeDataById.get(String(party.id));
        const dData = nodeDataById.get(String(donor.id));
        const ideal = partyHalfDiagonal(pData) + donorRadius(dData) + 38;
        const pull = (dist - ideal) * 0.035 * (weight / Math.log1p(maxVal));
        donor.x += (dx / dist) * pull;
        donor.y += (dy / dist) * pull;
      }
    }
    resolveBodyOverlaps(bodies, 3);
    for (const party of parties) {
      party.x = pinned.get(party.id).x;
      party.y = pinned.get(party.id).y;
    }
  }

  for (let i = 0; i < 500; i++) {
    resolveBodyOverlaps(bodies, 3);
    for (const party of parties) {
      party.x = pinned.get(party.id).x;
      party.y = pinned.get(party.id).y;
    }
    if (countLayoutOverlaps(bodies) === 0) break;
  }
}

export function buildManualLayout({ nodeById, graphLinks, cyElements }) {
  const nodeDataById = new Map(
    cyElements.filter(el => el.group === 'nodes').map(el => [el.data.id, el.data])
  );
  const bodies = buildBodies(nodeById, nodeDataById);

  pinParties(bodies, nodeById);
  resolveBodyOverlaps(bodies.filter(b => b.type === 'party'), 100);
  if (countLayoutOverlaps(bodies.filter(b => b.type === 'party')) > 0) {
    throw new Error('Manual party positions overlap — adjust MANUAL_PARTY_POSITIONS');
  }

  placeDonorsOnArcs(bodies, graphLinks, nodeById, nodeDataById);
  applyNudges(bodies);
  relaxDonors(bodies, graphLinks, nodeById, nodeDataById);
  applyDonorOverrides(bodies);

  const immovable = new Set([
    ...bodies.filter(b => b.type === 'party').map(b => b.id),
    ...bodies.filter(b => HAND_DONOR_POSITIONS[b.name]).map(b => b.id),
  ]);

  for (let i = 0; i < 800; i++) {
    resolveBodyOverlaps(bodies, 3, immovable);
    for (const body of bodies.filter(b => b.type === 'party')) {
      const pos = MANUAL_PARTY_POSITIONS[body.name];
      body.x = pos.x;
      body.y = pos.y;
    }
    for (const body of bodies.filter(b => HAND_DONOR_POSITIONS[b.name])) {
      const pos = HAND_DONOR_POSITIONS[body.name];
      body.x = pos.x;
      body.y = pos.y;
    }
    if (countLayoutOverlaps(bodies) === 0) break;
  }

  const overlaps = countLayoutOverlaps(bodies);
  const bounds = layoutBounds(bodies);
  const raw = Object.fromEntries(bodies.map(b => [b.name, { x: b.x, y: b.y }]));

  return {
    positions: centerLayoutPositions(raw),
    metrics: { overlaps, spanX: Math.round(bounds.spanX), spanY: Math.round(bounds.spanY) },
    view: { fitTarget: 'all', fitPadding: 40, zoomBoost: 1.0 },
  };
}

export { MANUAL_PARTY_POSITIONS };
