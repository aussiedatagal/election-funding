import { partyColor, categoryColor } from './partyConfig.js';
import { truncate } from './formatters.js';

export const EXCLUDED_NODE_NAMES = new Set(['Other / Minor Parties']);

export const DONOR_SIZE_MIN = 4;
export const DONOR_SIZE_MAX = 38;
export const DONOR_SIZE_CURVE = 1.6;

export const PARTY_W_MIN = 88;
export const PARTY_W_MAX = 248;
export const PARTY_H_MIN = 40;
export const PARTY_H_MAX = 108;

export function flowNorm(flow, maxFlow, curve) {
  if (!flow || !maxFlow) return 0;
  const logNorm = Math.log1p(flow) / Math.log1p(maxFlow);
  return Math.pow(logNorm, curve);
}

export function flowScale(flow, maxFlow, min, max, curve) {
  return min + (max - min) * flowNorm(flow, maxFlow, curve);
}

export function donorNodeSize(flow, maxDonorFlow) {
  return flowScale(flow, maxDonorFlow, DONOR_SIZE_MIN, DONOR_SIZE_MAX, DONOR_SIZE_CURVE);
}

/**
 * Party box scale uses linear spread among parties (Palmer capped separately)
 * so Labor, Coalition, and minor parties are visually distinct.
 */
export function partyNodeMetrics(flow, partyFlows) {
  const sorted = [...partyFlows].filter(f => f > 0).sort((a, b) => b - a);
  const megaThreshold = sorted[0] > 80_000_000 ? sorted[0] * 0.45 : Infinity;
  const scaleMax = sorted.find(f => f < megaThreshold) ?? sorted[0];
  const scaleMin = sorted[sorted.length - 1] ?? 0;
  const span = scaleMax - scaleMin || 1;

  let t;
  if (flow >= megaThreshold) {
    t = 1;
  } else {
    t = Math.pow(Math.max(0, flow - scaleMin) / span, 0.82);
    t = Math.min(0.94, t);
  }

  const partyWidth = Math.round(PARTY_W_MIN + (PARTY_W_MAX - PARTY_W_MIN) * t);
  const partyHeight = Math.round(PARTY_H_MIN + (PARTY_H_MAX - PARTY_H_MIN) * t);
  const fontSize = Math.round(13 + 5 * t);
  const maxPerLine = Math.max(10, Math.floor(partyWidth / 8.5));

  return {
    partyWidth,
    partyHeight,
    fontSize,
    textMaxWidth: Math.max(64, partyWidth - 20),
    maxPerLine,
  };
}

export function splitLabelLines(name, maxPerLine) {
  const t = name.trim();
  if (!t.length) return [''];
  if (t.length <= maxPerLine) return [t];
  const slice = t.slice(0, maxPerLine + 1);
  const sp = slice.lastIndexOf(' ');
  const cut = sp > Math.floor(maxPerLine * 0.4) ? sp : maxPerLine;
  const line1 = t.slice(0, cut).trimEnd();
  const rest = t.slice(cut).trim();
  if (!rest.length) return [line1];
  if (rest.length <= maxPerLine) return [line1, rest];
  return [line1, truncate(rest, maxPerLine)];
}

function nodeColor(node) {
  if (node.type === 'party') return partyColor(node.name);
  return categoryColor(node.category);
}

export function nodeLayoutRadius(node) {
  if (node.data('type') === 'party') {
    const w = node.data('partyWidth') || 90;
    const h = node.data('partyHeight') || 44;
    return Math.hypot(w, h) / 2;
  }
  const size = node.data('size') || 18;
  return size / 2 + 10;
}

export function nodeRepulsionForLayout(node) {
  if (node.data('type') === 'party') {
    const w = node.data('partyWidth') || 90;
    const h = node.data('partyHeight') || 44;
    return 70000 + w * h * 1.4;
  }
  const size = node.data('size') || 18;
  const r = size / 2 + 10;
  return 14000 + r * r * 22;
}

export function idealEdgeLengthForLayout(edge) {
  if (edge.data('isSim')) {
    return edge.data('idealLen') || 180;
  }
  return Math.max(110, nodeLayoutRadius(edge.source()) + nodeLayoutRadius(edge.target()) + 60);
}

export function buildFcoseLayoutOptions(layoutNarrow, { randomize = false } = {}) {
  return {
    name: 'fcose',
    quality: 'proof',
    randomize,
    animate: false,
    fit: true,
    padding: layoutNarrow ? 32 : 64,
    nodeDimensionsIncludeLabels: true,
    uniformNodeDimensions: false,
    packComponents: true,
    tile: true,
    tilingPaddingVertical: 90,
    tilingPaddingHorizontal: 90,
    nodeSeparation: layoutNarrow ? 120 : 160,
    samplingType: true,
    idealEdgeLength: idealEdgeLengthForLayout,
    edgeElasticity: edge => (edge.data('isSim') ? 0.55 : 0.32),
    nodeRepulsion: nodeRepulsionForLayout,
    gravity: 0.1,
    gravityRange: 5,
    gravityCompound: 0.85,
    gravityRangeCompound: 1.8,
    numIter: 4500,
  };
}

/** Higher score = less overlap, better spread. */
export function scoreLayout(cy) {
  const nodes = cy.nodes();
  let overlapArea = 0;
  for (let i = 0; i < nodes.length; i++) {
    const bb1 = nodes[i].boundingBox();
    for (let j = i + 1; j < nodes.length; j++) {
      const bb2 = nodes[j].boundingBox();
      const ox = Math.max(0, Math.min(bb1.x2, bb2.x2) - Math.max(bb1.x1, bb2.x1));
      const oy = Math.max(0, Math.min(bb1.y2, bb2.y2) - Math.max(bb1.y1, bb2.y1));
      overlapArea += ox * oy;
    }
  }

  const bb = cy.elements().boundingBox();
  const area = (bb.w || 1) * (bb.h || 1);
  const densityPenalty = nodes.length / area;

  return -overlapArea - densityPenalty * 8000;
}

export function buildGraphFromFundingData(data) {
  const empty = {
    cyElements: [],
    graphLinks: [],
    flowMap: new Map(),
    nodeById: new Map(),
    hasNodes: false,
    nodeNames: [],
  };
  if (!data?.nodes?.length) return empty;

  const vis = data.nodes.filter(n => n.type !== 'donor_group' && !EXCLUDED_NODE_NAMES.has(n.name));
  const visIds = new Set(vis.map(n => n.id));
  const nodeMap = new Map(vis.map(n => [n.id, n]));
  const visLinks = data.links.filter(l => visIds.has(l.source) && visIds.has(l.target));

  const fm = new Map();
  visLinks.forEach(l => {
    fm.set(l.source, (fm.get(l.source) || 0) + l.value);
    fm.set(l.target, (fm.get(l.target) || 0) + l.value);
  });

  const donorNodes = vis.filter(n => n.type === 'donor');
  const partyNodes = vis.filter(n => n.type === 'party');
  const partyFlows = partyNodes.map(n => fm.get(n.id) || 0);
  const maxDonorFlow = Math.max(...donorNodes.map(n => fm.get(n.id) || 0), 1);
  const maxLinkVal = Math.max(...visLinks.map(l => l.value), 1);
  const logMax = Math.log1p(maxLinkVal);

  const donorToParties = new Map();
  visLinks.forEach(l => {
    if (nodeMap.get(l.target)?.type !== 'party') return;
    if (!donorToParties.has(l.source)) donorToParties.set(l.source, []);
    donorToParties.get(l.source).push({ partyId: l.target, value: l.value });
  });

  const pairSim = new Map();
  donorToParties.forEach(entries => {
    if (entries.length < 2) return;
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i].partyId;
        const b = entries[j].partyId;
        const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
        pairSim.set(key, (pairSim.get(key) || 0) + Math.sqrt(entries[i].value * entries[j].value));
      }
    }
  });
  const maxSim = Math.max(...pairSim.values(), 1);

  const cyNodes = vis.map(n => {
    const isParty = n.type === 'party';
    const flow = fm.get(n.id) || 0;
    const partyMetrics = isParty ? partyNodeMetrics(flow, partyFlows) : null;
    const label = isParty
      ? splitLabelLines(n.name, partyMetrics.maxPerLine).join('\n')
      : truncate(n.name, 24);
    const donorNorm = flowNorm(flow, maxDonorFlow, DONOR_SIZE_CURVE);
    const partyNorm = partyMetrics
      ? (partyMetrics.partyWidth - PARTY_W_MIN) / (PARTY_W_MAX - PARTY_W_MIN)
      : 0;

    return {
      group: 'nodes',
      data: {
        id: String(n.id),
        label,
        type: n.type,
        category: n.category ?? '',
        color: nodeColor(n),
        size: isParty ? DONOR_SIZE_MIN : donorNodeSize(flow, maxDonorFlow),
        borderWidth: isParty ? Math.max(2, 2 + 2.5 * partyNorm) : Math.max(1, 1 + 3 * donorNorm),
        ...(partyMetrics
          ? {
              partyWidth: partyMetrics.partyWidth,
              partyHeight: partyMetrics.partyHeight,
              fontSize: partyMetrics.fontSize,
              textMaxWidth: partyMetrics.textMaxWidth,
            }
          : {}),
      },
    };
  });

  const cyEdges = visLinks.map((l, i) => {
    const partyNode = nodeMap.get(l.target)?.type === 'party'
      ? nodeMap.get(l.target)
      : nodeMap.get(l.source);
    const norm = Math.log1p(l.value) / logMax;
    const width = Math.min(7, Math.max(1.2, 1.5 + 5.5 * norm));
    return {
      group: 'edges',
      data: {
        id: `e-${i}`,
        source: String(l.source),
        target: String(l.target),
        value: l.value,
        color: partyColor(partyNode?.name ?? ''),
        width,
        highlightWidth: Math.max(3, width * 1.75),
        isSim: false,
      },
    };
  });

  let simIdx = 0;
  pairSim.forEach((overlap, key) => {
    const norm = overlap / maxSim;
    if (norm > 0.02) {
      const [p1, p2] = key.split('-');
      cyEdges.push({
        group: 'edges',
        data: {
          id: `sim-${simIdx++}`,
          source: p1,
          target: p2,
          isSim: true,
          idealLen: Math.round(100 + 200 * (1 - norm)),
          color: 'transparent',
          width: 0,
          highlightWidth: 0,
        },
      });
    }
  });

  return {
    cyElements: [...cyNodes, ...cyEdges],
    graphLinks: visLinks,
    flowMap: fm,
    nodeById: nodeMap,
    hasNodes: cyNodes.length > 0,
    nodeNames: vis.map(n => n.name).sort(),
  };
}

export function layoutPositionsForGraph(nodeById, savedLayout) {
  if (!savedLayout?.positions) return null;
  const names = [...nodeById.values()].map(n => n.name);
  const positions = {};
  for (const name of names) {
    const p = savedLayout.positions[name];
    if (!p) return null;
    positions[name] = p;
  }
  return positions;
}

export function canUseSavedLayout(nodeNames, savedLayout) {
  if (!savedLayout?.nodeNames?.length || !savedLayout?.positions) return false;
  if (nodeNames.length !== savedLayout.nodeNames.length) return false;
  const set = new Set(nodeNames);
  return savedLayout.nodeNames.every(n => set.has(n));
}
