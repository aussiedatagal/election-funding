import {
  centerLayoutPositions,
  computePartySimilarity,
} from './networkGraphBuild.js';
import { getLayoutPreset } from './networkGraphLayoutConfig.js';

export { computePartySimilarity };

const COALITION = 'Liberal-National Coalition';

function partySize(id, nodeDataById) {
  const d = nodeDataById.get(String(id));
  return { w: d?.partyWidth || 120, h: d?.partyHeight || 52 };
}

function donorRadius(data) {
  return (data?.size || 18) / 2 + 4;
}

function detectCommunities(partyIds, simEdges, threshold = 0.15) {
  const parent = new Map(partyIds.map(id => [id, id]));
  const find = (x) => {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)));
    return parent.get(x);
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  simEdges.filter(e => e.norm >= threshold).forEach(({ p1, p2 }) => union(p1, p2));

  const groups = new Map();
  partyIds.forEach(id => {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  });
  return [...groups.values()];
}

function columnLayout(ids, x, nodeDataById, gap) {
  const sorted = [...ids].sort(
    (a, b) => partySize(b, nodeDataById).h - partySize(a, nodeDataById).h
  );
  const heights = sorted.map(id => partySize(id, nodeDataById).h);
  const total = heights.reduce((s, h) => s + h, 0) + gap * Math.max(0, sorted.length - 1);
  let cursor = -total / 2;
  const pos = new Map();
  sorted.forEach((id, i) => {
    pos.set(id, { x, y: cursor + heights[i] / 2 });
    cursor += heights[i] + gap;
  });
  return pos;
}

function columnLayoutFrom(ids, x, topY, nodeDataById, gap) {
  let y = topY;
  const pos = new Map();
  for (const id of ids) {
    const h = partySize(id, nodeDataById).h;
    pos.set(id, { x, y: y + h / 2 });
    y += h + gap;
  }
  return pos;
}

function rowLayoutFrom(ids, y, nodeDataById, gap) {
  const sorted = [...ids].sort(
    (a, b) => partySize(b, nodeDataById).w - partySize(a, nodeDataById).w
  );
  const widths = sorted.map(id => partySize(id, nodeDataById).w);
  const total = widths.reduce((s, w) => s + w, 0) + gap * Math.max(0, sorted.length - 1);
  let x = -total / 2;
  const pos = new Map();
  sorted.forEach((id, i) => {
    pos.set(id, { x: x + widths[i] / 2, y });
    x += widths[i] + gap;
  });
  return pos;
}

function findCommunity(communities, nodeById, matcher) {
  return communities.find(grp => grp.some(id => matcher(nodeById.get(id)?.name ?? '')));
}

function layoutMinors(minors, pos, nodeDataById, cfg) {
  if (!minors.length) return;

  let maxBottom = -Infinity;
  pos.forEach((p, id) => {
    maxBottom = Math.max(maxBottom, p.y + partySize(id, nodeDataById).h / 2);
  });

  const sorted = [...minors].sort(
    (a, b) => partySize(b, nodeDataById).h - partySize(a, nodeDataById).h
  );
  const topY = maxBottom + cfg.minorsTopGap;

  if (cfg.minorsMode === 'column-right') {
    columnLayoutFrom(sorted, cfg.minorsX, topY, nodeDataById, cfg.minorsColumnGap)
      .forEach((p, id) => pos.set(id, p));
    return;
  }

  if (cfg.minorsMode === 'columns-below') {
    const split = Math.ceil(sorted.length / 2);
    columnLayoutFrom(sorted.slice(0, split), -220, topY, nodeDataById, cfg.minorsColumnGap)
      .forEach((p, id) => pos.set(id, p));
    columnLayoutFrom(sorted.slice(split), 220, topY, nodeDataById, cfg.minorsColumnGap)
      .forEach((p, id) => pos.set(id, p));
    return;
  }

  if (cfg.minorsMode === 'row-below') {
    const rows = [];
    let row = [];
    let rowW = 0;
    sorted.forEach(id => {
      const w = partySize(id, nodeDataById).w;
      if (row.length && rowW + w + cfg.minorsColumnGap > 1100) {
        rows.push(row);
        row = [];
        rowW = 0;
      }
      row.push(id);
      rowW += w + cfg.minorsColumnGap;
    });
    if (row.length) rows.push(row);

    let y = topY + Math.max(...rows[0].map(id => partySize(id, nodeDataById).h)) / 2;
    rows.forEach((ids) => {
      rowLayoutFrom(ids, y, nodeDataById, cfg.minorsColumnGap).forEach((p, id) => pos.set(id, p));
      y += Math.max(...ids.map(id => partySize(id, nodeDataById).h)) + cfg.minorsColumnGap + 24;
    });
  }
}

function layoutParties(communities, nodeById, nodeDataById, cfg) {
  const coalitionId = [...nodeById.entries()].find(([, n]) => n.name === COALITION)?.[0];
  const laborBloc = findCommunity(communities, nodeById, name => /Labor|Green|Teal|Centre Alliance|Reason|Rex Patrick|Jacqui Lambie|Sustainable Australia/i.test(name));
  const populistBloc = findCommunity(communities, nodeById, name => /Palmer|One Nation|Libertarian/i.test(name));

  const placed = new Set();
  const pos = new Map();

  if (laborBloc) {
    columnLayout(laborBloc, cfg.laborX, nodeDataById, cfg.columnGap)
      .forEach((p, id) => { pos.set(id, p); placed.add(id); });
  }
  if (coalitionId) {
    pos.set(coalitionId, { ...cfg.coalition });
    placed.add(coalitionId);
  }
  if (populistBloc) {
    columnLayout(populistBloc, cfg.populistX, nodeDataById, cfg.columnGap)
      .forEach((p, id) => { pos.set(id, p); placed.add(id); });
  }

  const minors = [];
  communities.forEach(grp => {
    grp.forEach(id => {
      if (!placed.has(id)) minors.push(id);
    });
  });

  layoutMinors(minors, pos, nodeDataById, cfg);
  return pos;
}

function placeDonorHalos(donorIds, graphLinks, nodeById, partyPos, nodeDataById, cfg) {
  const linksByDonor = new Map();
  for (const link of graphLinks) {
    if (nodeById.get(link.source)?.type !== 'donor') continue;
    if (nodeById.get(link.target)?.type !== 'party') continue;
    if (!linksByDonor.has(link.source)) linksByDonor.set(link.source, []);
    linksByDonor.get(link.source).push(link);
  }

  const donorsByParty = new Map();
  donorIds.forEach(donorId => {
    const links = linksByDonor.get(donorId) || [];
    if (!links.length) return;
    const primary = links.reduce((best, l) => (l.value > best.value ? l : best), links[0]).target;
    if (!donorsByParty.has(primary)) donorsByParty.set(primary, []);
    donorsByParty.get(primary).push(donorId);
  });

  const pos = new Map();
  let cx = 0;
  let cy = 0;
  partyPos.forEach(p => { cx += p.x; cy += p.y; });
  cx /= partyPos.size || 1;
  cy /= partyPos.size || 1;

  donorsByParty.forEach((donors, partyId) => {
    const anchor = partyPos.get(partyId);
    if (!anchor) return;
    const { w, h } = partySize(partyId, nodeDataById);
    const partyR = Math.hypot(w, h) / 2;
    let dx = anchor.x - cx;
    let dy = anchor.y - cy;
    const dlen = Math.max(Math.hypot(dx, dy), 1);
    dx /= dlen;
    dy /= dlen;
    const px = -dy;
    const py = dx;

    donors.forEach((donorId, i) => {
      const n = donors.length;
      const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * 1.35;
      const r = partyR + cfg.donorBaseR + Math.floor(i / 7) * cfg.donorRingStep;
      pos.set(donorId, {
        x: anchor.x + dx * r + px * t * cfg.donorSpread,
        y: anchor.y + dy * r + py * t * cfg.donorSpread,
      });
    });
  });

  return pos;
}

function nudgeDonorsOffParties(posById, nodeById, nodeDataById) {
  const partyIds = [...posById.keys()].filter(id => nodeById.get(id)?.type === 'party');
  const donorIds = [...posById.keys()].filter(id => nodeById.get(id)?.type === 'donor');

  for (let iter = 0; iter < 60; iter++) {
    for (const donorId of donorIds) {
      const d = posById.get(donorId);
      const dr = donorRadius(nodeDataById.get(String(donorId)));
      for (const partyId of partyIds) {
        const p = posById.get(partyId);
        const { w, h } = partySize(partyId, nodeDataById);
        const pr = Math.hypot(w, h) / 2 + 10;
        let dx = d.x - p.x;
        let dy = d.y - p.y;
        const dist = Math.max(Math.hypot(dx, dy), 0.01);
        const minDist = dr + pr + 8;
        if (dist >= minDist) continue;
        const push = (minDist - dist) / dist;
        d.x += dx * push;
        d.y += dy * push;
      }
    }
  }
}

export function scoreLayoutQuality(positions, nodeById, cyElements, cfg) {
  const nodeData = new Map(
    cyElements.filter(el => el.group === 'nodes').map(el => [el.data.id, el.data])
  );
  const parties = [...nodeById.values()].filter(n => n.type === 'party');

  let partyOverlap = 0;
  for (let i = 0; i < parties.length; i++) {
    for (let j = i + 1; j < parties.length; j++) {
      const a = positions[parties[i].name];
      const b = positions[parties[j].name];
      const da = nodeData.get(String(parties[i].id));
      const db = nodeData.get(String(parties[j].id));
      const ox = Math.max(0, Math.min(a.x + da.partyWidth / 2, b.x + db.partyWidth / 2) - Math.max(a.x - da.partyWidth / 2, b.x - db.partyWidth / 2));
      const oy = Math.max(0, Math.min(a.y + da.partyHeight / 2, b.y + db.partyHeight / 2) - Math.max(a.y - da.partyHeight / 2, b.y - db.partyHeight / 2));
      if (ox > 0 && oy > 0) partyOverlap++;
    }
  }

  const pts = Object.values(positions);
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const spanX = Math.max(...xs) - Math.min(...xs) || 1;
  const spanY = Math.max(...ys) - Math.min(...ys) || 1;
  const aspect = spanX / spanY;

  const viewW = 1200;
  const viewH = 520;
  const pad = cfg.fitPadding;

  const fitParties = cfg.fitTarget !== 'all';
  const fitPts = fitParties
    ? parties.map(p => positions[p.name])
    : pts;
  const fitXs = fitPts.map(p => p.x);
  const fitYs = fitPts.map(p => p.y);
  const fitSpanX = Math.max(...fitXs) - Math.min(...fitXs) || 1;
  const fitSpanY = Math.max(...fitYs) - Math.min(...fitYs) || 1;
  const zoom = Math.min((viewW - 2 * pad) / fitSpanX, (viewH - 2 * pad) / fitSpanY) * cfg.zoomBoost;
  const readability = Math.min(28, 22 * zoom);

  let offScreen = 0;
  if (fitParties && fitPts.length) {
    const cx = (Math.min(...fitXs) + Math.max(...fitXs)) / 2;
    const cy = (Math.min(...fitYs) + Math.max(...fitYs)) / 2;
    const visW = viewW / zoom;
    const visH = viewH / zoom;
    const visMinX = cx - visW / 2;
    const visMaxX = cx + visW / 2;
    const visMinY = cy - visH / 2;
    const visMaxY = cy + visH / 2;
    for (const party of parties) {
      const pt = positions[party.name];
      if (pt.x < visMinX || pt.x > visMaxX || pt.y < visMinY || pt.y > visMaxY) offScreen++;
    }
  }

  const labor = positions['Australian Labor Party'];
  const coalition = positions['Liberal-National Coalition'];
  const palmer = positions['Clive Palmer / UAP'];
  let clusterScore = 0;
  if (labor && coalition && palmer) {
    if (labor.x < coalition.x && coalition.x < palmer.x) clusterScore += 2;
    const spread = palmer.x - labor.x;
    if (spread > 800 && spread < 1400) clusterScore += 1;
  }

  const score =
    (partyOverlap === 0 ? 10 : -partyOverlap * 20) +
    clusterScore * 4 +
    Math.min(readability, 18) * 0.8 +
    (aspect > 0.55 && aspect < 1.4 ? 4 : 0) +
    (spanY < 2200 ? 3 : -5) -
    offScreen * 1.5;

  return {
    score,
    partyOverlap,
    aspect: +aspect.toFixed(2),
    readability: +readability.toFixed(1),
    spanX: Math.round(spanX),
    spanY: Math.round(spanY),
    clusterScore,
    offScreen,
  };
}

export function buildClusterLayout({
  nodeById,
  graphLinks,
  cyElements,
  preset,
}) {
  const cfg = preset ?? getLayoutPreset();
  const nodeDataById = new Map(
    cyElements.filter(el => el.group === 'nodes').map(el => [el.data.id, el.data])
  );

  const partyIds = [];
  const donorIds = [];
  nodeById.forEach((node, id) => {
    if (node.type === 'party') partyIds.push(id);
    else if (node.type === 'donor') donorIds.push(id);
  });

  const simEdges = computePartySimilarity(graphLinks, nodeById);
  const communities = detectCommunities(partyIds, simEdges);
  const partyPos = layoutParties(communities, nodeById, nodeDataById, cfg);
  const donorPos = placeDonorHalos(donorIds, graphLinks, nodeById, partyPos, nodeDataById, cfg);
  const posById = new Map([...partyPos, ...donorPos]);
  nudgeDonorsOffParties(posById, nodeById, nodeDataById);

  const raw = {};
  nodeById.forEach((node, id) => {
    const p = posById.get(id);
    if (p) raw[node.name] = { x: p.x, y: p.y };
  });

  const positions = centerLayoutPositions(raw);
  const metrics = scoreLayoutQuality(positions, nodeById, cyElements, cfg);

  return {
    positions,
    simEdges: simEdges.length,
    presetId: cfg.id,
    metrics,
    view: {
      fitTarget: cfg.fitTarget,
      fitPadding: cfg.fitPadding,
      zoomBoost: cfg.zoomBoost,
    },
  };
}
