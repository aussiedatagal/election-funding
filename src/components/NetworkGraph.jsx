import { useRef, useEffect, useMemo, useCallback, useLayoutEffect, useState } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { partyColor, categoryColor, CATEGORY_COLORS } from '../lib/partyConfig';
import { formatFull, truncate, formatPct } from '../lib/formatters';
import { getDonorInfo, getPartyInfo } from '../lib/entityInfo';

cytoscape.use(fcose);

const BASE_SIZE = 8;
const MAX_SIZE = 34;

function nodeColor(node) {
  if (node.type === 'party') return partyColor(node.name);
  return categoryColor(node.category);
}

function splitLabelLines(name, maxPerLine) {
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

function MemberName({ name, entityId, onPickEntity }) {
  const label = truncate(name, 28);
  if (entityId != null && onPickEntity) {
    return (
      <button
        type="button"
        className="tt-member-link"
        onClick={() => onPickEntity(entityId)}
      >
        {label}
      </button>
    );
  }
  return <span className="tt-member-name">{label}</span>;
}

function buildNodeTooltipBody(node, flowMap, linksArr, nodeById, nameToId, onPickEntity) {
  const isParty = node.type === 'party';
  const isGroup = node.type === 'donor_group';
  const total = flowMap.get(node.id) || 0;
  const info = isParty ? getPartyInfo(node.name) : getDonorInfo(node.name);
  const nameFor = id => {
    const sid = id?.id ?? id;
    return nodeById.get(sid)?.name;
  };

  const breakdown = linksArr
    .filter(l => {
      const s = l.source?.id ?? l.source;
      const t = l.target?.id ?? l.target;
      return isParty ? t === node.id : s === node.id;
    })
    .map(l => {
      const otherId = isParty ? (l.source?.id ?? l.source) : (l.target?.id ?? l.target);
      const name = isParty ? (nameFor(l.source) ?? '?') : (nameFor(l.target) ?? '?');
      return {
        name,
        entityId: nameToId?.get(name) ?? otherId,
        value: l.value,
        pct: total > 0 ? (100 * l.value) / total : 0,
      };
    })
    .sort((a, b) => b.value - a.value);

  const shownBreakdown = breakdown.slice(0, 10);
  const rest = breakdown.length - shownBreakdown.length;

  return (
    <div className="tt-body">
      <div className="tt-name">{node.name}</div>
      <div className="tt-meta">
        {isParty ? '■ Party / Group' : isGroup
          ? `● Grouped donors — ${node.category}`
          : `● Donor — ${node.category}`}
      </div>
      <div className="tt-amount">
        {isParty ? 'Total received: ' : 'Total donated: '}
        <strong>{formatFull(total)}</strong>
      </div>
      {shownBreakdown.length > 0 && (
        <div className="tt-members">
          <div className="tt-members-heading">
            {isParty ? 'From donors' : 'Donations to parties'}
            {onPickEntity && (
              <span className="tt-members-sub"> · tap a name to explore</span>
            )}
          </div>
          {shownBreakdown.map(item => (
            <div key={item.name} className="tt-member-row">
              <MemberName
                name={item.name}
                entityId={item.entityId}
                onPickEntity={onPickEntity}
              />
              <span className="tt-member-pct">{formatPct(item.pct)}</span>
              <span className="tt-member-amt">{formatFull(item.value)}</span>
            </div>
          ))}
          {rest > 0 && <div className="tt-members-more">…and {rest} more</div>}
        </div>
      )}
      {info && <div className="tt-info">{info}</div>}
    </div>
  );
}

function buildCategoryTooltipBody(category, graphLinks, flowMap, nodeById, nameToId, onPickEntity) {
  const donorIds = new Set(
    [...nodeById.values()]
      .filter(n => n.type === 'donor' && n.category === category)
      .map(n => n.id)
  );

  let total = 0;
  const donorTotals = new Map();
  const partyTotals = new Map();

  graphLinks.forEach(l => {
    if (!donorIds.has(l.source)) return;
    total += l.value;
    donorTotals.set(l.source, (donorTotals.get(l.source) || 0) + l.value);
    const party = nodeById.get(l.target);
    if (party) {
      partyTotals.set(party.name, (partyTotals.get(party.name) || 0) + l.value);
    }
  });

  const topDonors = [...donorTotals.entries()]
    .map(([id, value]) => ({
      name: nodeById.get(id)?.name ?? '?',
      entityId: id,
      value,
      pct: total > 0 ? (100 * value) / total : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const topParties = [...partyTotals.entries()]
    .map(([name, value]) => ({
      name,
      entityId: nameToId?.get(name),
      value,
      pct: total > 0 ? (100 * value) / total : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return (
    <div className="tt-body">
      <div className="tt-name">{category}</div>
      <div className="tt-meta">Donor category · {donorIds.size} donor{donorIds.size === 1 ? '' : 's'} shown</div>
      <div className="tt-amount">
        Total donated: <strong>{formatFull(total)}</strong>
      </div>
      {topDonors.length > 0 && (
        <div className="tt-members">
          <div className="tt-members-heading">
            Top donors
            {onPickEntity && (
              <span className="tt-members-sub"> · tap a name to explore</span>
            )}
          </div>
          {topDonors.map(item => (
            <div key={item.name} className="tt-member-row">
              <MemberName
                name={item.name}
                entityId={item.entityId}
                onPickEntity={onPickEntity}
              />
              <span className="tt-member-pct">{formatPct(item.pct)}</span>
              <span className="tt-member-amt">{formatFull(item.value)}</span>
            </div>
          ))}
        </div>
      )}
      {topParties.length > 0 && (
        <div className="tt-members">
          <div className="tt-members-heading">Received by parties</div>
          {topParties.map(item => (
            <div key={item.name} className="tt-member-row">
              <MemberName
                name={item.name}
                entityId={item.entityId}
                onPickEntity={onPickEntity}
              />
              <span className="tt-member-pct">{formatPct(item.pct)}</span>
              <span className="tt-member-amt">{formatFull(item.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Cytoscape stylesheet — defined once outside the component so it's never recreated.
const CY_STYLE = [
  {
    selector: 'node',
    style: {
      'background-color': 'data(color)',
      'font-family': "system-ui, -apple-system, 'Segoe UI', sans-serif",
    },
  },
  {
    selector: 'node[type = "party"]',
    style: {
      'shape': 'roundrectangle',
      'label': 'data(label)',
      'text-valign': 'center',
      'text-halign': 'center',
      'color': '#f8fafc',
      'text-outline-color': 'data(color)',
      'text-outline-width': 1,
      'font-size': 11,
      'font-weight': 600,
      'text-wrap': 'wrap',
      'text-max-width': 110,
      'width': 'label',
      'height': 'label',
      'padding': 8,
      'border-width': 2,
      'border-color': 'rgba(255,255,255,0.55)',
      'cursor': 'pointer',
    },
  },
  {
    selector: 'node[type = "donor"]',
    style: {
      'shape': 'ellipse',
      'label': '',
      'width': 'data(size)',
      'height': 'data(size)',
      'border-width': 1,
      'border-color': 'rgba(15,23,42,0.3)',
      'cursor': 'pointer',
    },
  },
  {
    selector: 'edge',
    style: {
      'line-color': 'data(color)',
      'width': 'data(width)',
      'opacity': 0.35,
      'curve-style': 'bezier',
    },
  },
  // Invisible similarity edges — participate in layout but never rendered
  {
    selector: 'edge[?isSim]',
    style: { 'opacity': 0, 'width': 0, 'events': 'no' },
  },
  // Everything fades when a node is selected
  { selector: '.faded', style: { 'opacity': 0.07 } },
  // Selected node and its neighbours/edges come forward
  {
    selector: 'node.highlighted',
    style: { 'opacity': 1, 'border-color': '#ffffff', 'border-width': 3 },
  },
  {
    // Reveal donor label when it is part of a selection
    selector: 'node[type = "donor"].highlighted',
    style: {
      'label': 'data(label)',
      'text-valign': 'bottom',
      'text-margin-y': 3,
      'font-size': 9,
      'color': '#1a1d27',
      'text-outline-color': '#ffffff',
      'text-outline-width': 2,
    },
  },
  { selector: 'edge.highlighted', style: { 'opacity': 0.9, 'width': 'data(highlightWidth)' } },
];

export default function NetworkGraph({ data, onTooltip, tooltipPinned, pinnedLegendCategory }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const onTooltipRef = useRef(onTooltip);
  const tooltipPinnedRef = useRef(tooltipPinned);
  const highlightApiRef = useRef({ clear: () => {}, applyCategory: () => {}, applyNode: () => {} });
  // Holds the latest raw graph data so event handlers don't go stale between rebuilds
  const dataRef = useRef({ graphLinks: [], flowMap: new Map(), nodeById: new Map(), nameToId: new Map() });

  const [layoutNarrow, setLayoutNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 640
  );
  const [hoverLegendCategory, setHoverLegendCategory] = useState(null);
  const hoverLegendCategoryRef = useRef(null);

  useEffect(() => { onTooltipRef.current = onTooltip; }, [onTooltip]);
  useEffect(() => { tooltipPinnedRef.current = tooltipPinned; }, [tooltipPinned]);
  useEffect(() => { hoverLegendCategoryRef.current = hoverLegendCategory; }, [hoverLegendCategory]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const read = () => {
      const w = el.getBoundingClientRect().width;
      setLayoutNarrow(w > 0 && w < 560);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { cyElements, graphLinks, flowMap, nodeById, hasNodes } = useMemo(() => {
    const empty = {
      cyElements: [], graphLinks: [], flowMap: new Map(), nodeById: new Map(), hasNodes: false,
    };
    if (!data?.nodes?.length) return empty;

    // Exclude grouped buckets and the catch-all "Other / Minor Parties" node —
    // it has no meaningful shared-donor connections and adds noise.
    const EXCLUDE = new Set(['Other / Minor Parties']);
    const vis = data.nodes.filter(n => n.type !== 'donor_group' && !EXCLUDE.has(n.name));
    const visIds = new Set(vis.map(n => n.id));
    const nodeMap = new Map(vis.map(n => [n.id, n]));
    const visLinks = data.links.filter(l => visIds.has(l.source) && visIds.has(l.target));

    const fm = new Map();
    visLinks.forEach(l => {
      fm.set(l.source, (fm.get(l.source) || 0) + l.value);
      fm.set(l.target, (fm.get(l.target) || 0) + l.value);
    });
    const maxFlow = Math.max(...fm.values(), 1);
    const maxLinkVal = Math.max(...visLinks.map(l => l.value), 1);
    const logMax = Math.log1p(maxLinkVal);

    // ── Pairwise party similarity from shared donors ──────────────────────────
    // Used to create invisible layout-only edges that pull similar parties together.
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
          const a = entries[i].partyId, b = entries[j].partyId;
          const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
          pairSim.set(key, (pairSim.get(key) || 0) + Math.sqrt(entries[i].value * entries[j].value));
        }
      }
    });
    const maxSim = Math.max(...pairSim.values(), 1);

    // ── Build cytoscape elements ──────────────────────────────────────────────
    const cyNodes = vis.map(n => {
      const isParty = n.type === 'party';
      const flow = fm.get(n.id) || 0;
      const rawSize = BASE_SIZE + (MAX_SIZE - BASE_SIZE) * Math.sqrt(flow / maxFlow);
      const size = Math.max(BASE_SIZE, Math.min(MAX_SIZE, rawSize));
      const label = isParty ? splitLabelLines(n.name, 18).join('\n') : n.name;
      return {
        group: 'nodes',
        data: {
          id: String(n.id),
          label,
          type: n.type,
          category: n.category ?? '',
          color: nodeColor(n),
          size,
        },
      };
    });

    const cyEdges = visLinks.map((l, i) => {
      const partyNode = nodeMap.get(l.target)?.type === 'party'
        ? nodeMap.get(l.target) : nodeMap.get(l.source);
      const norm = Math.log1p(l.value) / logMax;
      const width = Math.max(1, 1.2 + 5 * norm);
      return {
        group: 'edges',
        data: {
          id: `e-${i}`,
          source: String(l.source),
          target: String(l.target),
          value: l.value,
          color: partyColor(partyNode?.name ?? ''),
          width,
          highlightWidth: Math.max(2, width * 1.6),
          isSim: false,
        },
      };
    });

    // Invisible similarity edges: shorter ideal length = pulled closer together
    let simIdx = 0;
    pairSim.forEach((overlap, key) => {
      const norm = overlap / maxSim;
      if (norm > 0.02) {
        const [p1, p2] = key.split('-');
        cyEdges.push({
          group: 'edges',
          data: {
            id: `sim-${simIdx++}`,
            source: p1, target: p2,
            isSim: true,
            idealLen: Math.round(40 + 140 * (1 - norm)),
            color: 'transparent', width: 0, highlightWidth: 0,
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
    };
  }, [data]);

  useEffect(() => {
    const nameToId = new Map();
    nodeById.forEach((n) => nameToId.set(n.name, n.id));
    dataRef.current = { graphLinks, flowMap, nodeById, nameToId };
  }, [graphLinks, flowMap, nodeById]);

  const resetView = useCallback(() => {
    cyRef.current?.fit(undefined, layoutNarrow ? 16 : 36);
  }, [layoutNarrow]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !hasNodes) return;

    const cy = cytoscape({
      container,
      elements: cyElements,
      style: CY_STYLE,
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
      minZoom: 0.1,
      maxZoom: 4,
    });
    cyRef.current = cy;

    cy.layout({
      name: 'fcose',
      quality: 'default',
      randomize: true,
      animate: false,
      fit: true,
      padding: layoutNarrow ? 16 : 40,
      nodeDimensionsIncludeLabels: true,
      uniformNodeDimensions: false,
      packComponents: true,
      tile: true,
      tilingPaddingVertical: 50,
      tilingPaddingHorizontal: 50,
      idealEdgeLength: edge => edge.data('isSim') ? (edge.data('idealLen') || 120) : 60,
      edgeElasticity: edge => edge.data('isSim') ? 0.7 : 0.45,
      nodeRepulsion: node => node.data('type') === 'party' ? 18000 : 4500,
      gravity: 0.25,
      gravityRangeThreshold: 1.5,
      gravityCompound: 1.0,
      gravityRangeThresholdCompound: 1.5,
      numIter: 3000,
    }).run();

    // ── Selection / highlight ─────────────────────────────────────────────────
    const clearHighlight = () => cy.elements().removeClass('highlighted faded');

    const applyHighlight = cyNode => {
      const edges = cyNode.connectedEdges().filter(e => !e.data('isSim'));
      const neighbours = edges.connectedNodes();
      cy.elements().addClass('faded');
      cyNode.removeClass('faded').addClass('highlighted');
      edges.removeClass('faded').addClass('highlighted');
      neighbours.removeClass('faded');
    };

    const applyCategoryHighlight = category => {
      const donors = cy.nodes('[type = "donor"]').filter(n => n.data('category') === category);
      const edges = donors.connectedEdges().filter(e => !e.data('isSim'));
      const parties = edges.connectedNodes().filter(n => n.data('type') === 'party');
      cy.elements().addClass('faded');
      donors.removeClass('faded').addClass('highlighted');
      edges.removeClass('faded').addClass('highlighted');
      parties.removeClass('faded');
    };

    const showNodeDetail = (nodeId) => {
      const { graphLinks: gl, flowMap: fm2, nodeById: nb, nameToId: nt } = dataRef.current;
      const rawNode = nb.get(nodeId);
      const cyNode = cy.getElementById(String(nodeId));
      if (!rawNode || !cyNode.length) return;
      applyHighlight(cyNode);
      const focus = cyNode.closedNeighborhood();
      cy.animate({
        fit: { eles: focus.nonempty() ? focus : cyNode, padding: layoutNarrow ? 28 : 48 },
      }, { duration: 280 });
      const pickEntity = (id) => showNodeDetail(id);
      onTooltipRef.current({
        pinned: true,
        panel: true,
        nodeId,
        legendCategory: null,
        content: buildNodeTooltipBody(rawNode, fm2, gl, nb, nt, pickEntity),
      });
    };

    highlightApiRef.current = {
      clear: clearHighlight,
      applyCategory: applyCategoryHighlight,
      applyNode: applyHighlight,
      showNode: showNodeDetail,
    };

    // Click node → highlight + detail panel below chart (click only, no hover popup)
    cy.on('tap', 'node', evt => {
      const rawNode = dataRef.current.nodeById.get(parseInt(evt.target.id(), 10));
      if (!rawNode) return;
      showNodeDetail(rawNode.id);
    });

    // Click background → clear everything
    cy.on('tap', evt => {
      if (evt.target !== cy) return;
      clearHighlight();
      onTooltipRef.current(null);
    });

    return () => {
      cy.destroy();
      if (cyRef.current === cy) cyRef.current = null;
    };
  }, [cyElements, layoutNarrow, hasNodes]);

  useEffect(() => {
    if (!tooltipPinned && !pinnedLegendCategory) {
      highlightApiRef.current.clear?.();
      setHoverLegendCategory(null);
      return;
    }
    if (pinnedLegendCategory) {
      highlightApiRef.current.applyCategory?.(pinnedLegendCategory);
    }
  }, [tooltipPinned, pinnedLegendCategory, cyElements]);

  const handleLegendEnter = useCallback((category) => {
    if (tooltipPinnedRef.current) return;
    setHoverLegendCategory(category);
    highlightApiRef.current.applyCategory?.(category);
  }, []);

  const handleLegendLeave = useCallback(() => {
    if (tooltipPinnedRef.current) return;
    setHoverLegendCategory(null);
    highlightApiRef.current.clear?.();
  }, []);

  const handleLegendClick = useCallback((category) => {
    const { graphLinks: gl, flowMap: fm2, nodeById: nb, nameToId: nt } = dataRef.current;
    if (pinnedLegendCategory === category) {
      onTooltipRef.current(null);
      highlightApiRef.current.clear?.();
      return;
    }
    highlightApiRef.current.applyCategory?.(category);
    const pickEntity = (id) => highlightApiRef.current.showNode?.(id);
    onTooltipRef.current({
      pinned: true,
      panel: true,
      nodeId: null,
      legendCategory: category,
      content: buildCategoryTooltipBody(category, gl, fm2, nb, nt, pickEntity),
    });
  }, [pinnedLegendCategory]);

  if (!hasNodes) {
    return <div className="chart-empty">No data for this selection.</div>;
  }

  return (
    <div className="network-outer">
      <div className="network-container">
        {layoutNarrow && (
          <div className="network-mobile-bar" role="region" aria-label="Chart controls">
            <span className="network-mobile-bar__hint">Drag to pan · pinch to zoom</span>
            <button type="button" className="network-mobile-bar__btn" onClick={resetView}>
              Fit view
            </button>
          </div>
        )}
        <div className="network-legend" aria-label="Donor category legend">
          <div className="network-legend__heading">Donor type</div>
          <div className="network-legend__grid">
            {Object.entries(CATEGORY_COLORS).map(([name, color]) => {
              const isPinned = pinnedLegendCategory === name;
              const isHover = hoverLegendCategory === name && !isPinned;
              return (
                <button
                  key={name}
                  type="button"
                  className={`network-legend__item${isPinned ? ' network-legend__item--pinned' : ''}${isHover ? ' network-legend__item--hover' : ''}`}
                  onMouseEnter={() => handleLegendEnter(name)}
                  onMouseLeave={handleLegendLeave}
                  onFocus={() => handleLegendEnter(name)}
                  onBlur={handleLegendLeave}
                  onClick={() => handleLegendClick(name)}
                  aria-pressed={isPinned}
                >
                  <span className="network-legend__dot" style={{ background: color }} aria-hidden />
                  <span className="network-legend__label">{name}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div
          ref={containerRef}
          className={`network-vis-host${layoutNarrow ? ' network-vis-host--with-bar' : ''}`}
        />
      </div>
    </div>
  );
}
