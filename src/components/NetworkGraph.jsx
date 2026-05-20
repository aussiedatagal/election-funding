import { useRef, useEffect, useMemo, useCallback, useLayoutEffect, useState } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { CATEGORY_COLORS } from '../lib/partyConfig';
import { formatFull, truncate, formatPct } from '../lib/formatters';
import { getDonorInfo, getPartyInfo } from '../lib/entityInfo';
import {
  buildGraphFromFundingData,
  buildFcoseLayoutOptions,
  canUseSavedLayout,
} from '../lib/networkGraphBuild';
import { NETWORK_CY_STYLE } from '../lib/networkGraphCyStyle';
import savedLayout from '../data/network-layout.json';

cytoscape.use(fcose);

function MemberName({ name, entityId, onPickEntity }) {
  const label = truncate(name, 32);
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

function MemberRow({ name, value, pct, entityId, onPickEntity }) {
  return (
    <div className="tt-member-row">
      <div className="tt-member-main">
        <MemberName name={name} entityId={entityId} onPickEntity={onPickEntity} />
        <span className="tt-member-pct">{formatPct(pct)}</span>
      </div>
      <span className="tt-member-amt" title={formatFull(value)}>
        {formatFull(value)}
      </span>
    </div>
  );
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
      <div className="tt-amount tt-amount--hero">
        <span className="tt-amount-label">{isParty ? 'Total received' : 'Total donated'}</span>
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
            <MemberRow
              key={item.name}
              name={item.name}
              value={item.value}
              pct={item.pct}
              entityId={item.entityId}
              onPickEntity={onPickEntity}
            />
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
      <div className="tt-amount tt-amount--hero">
        <span className="tt-amount-label">Total donated</span>
        <strong>{formatFull(total)}</strong>
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
            <MemberRow
              key={item.name}
              name={item.name}
              value={item.value}
              pct={item.pct}
              entityId={item.entityId}
              onPickEntity={onPickEntity}
            />
          ))}
        </div>
      )}
      {topParties.length > 0 && (
        <div className="tt-members">
          <div className="tt-members-heading">Received by parties</div>
          {topParties.map(item => (
            <MemberRow
              key={item.name}
              name={item.name}
              value={item.value}
              pct={item.pct}
              entityId={item.entityId}
              onPickEntity={onPickEntity}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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

  const graph = useMemo(() => buildGraphFromFundingData(data), [data]);
  const {
    cyElements, graphLinks, flowMap, nodeById, hasNodes, nodeNames,
  } = graph;

  const useSavedLayout = useMemo(
    () => canUseSavedLayout(nodeNames, savedLayout),
    [nodeNames]
  );

  useEffect(() => {
    const nameToId = new Map();
    nodeById.forEach((n) => nameToId.set(n.name, n.id));
    dataRef.current = { graphLinks, flowMap, nodeById, nameToId };
  }, [graphLinks, flowMap, nodeById]);

  const resetView = useCallback(() => {
    cyRef.current?.fit(undefined, layoutNarrow ? 28 : 52);
  }, [layoutNarrow]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !hasNodes) return;

    const cy = cytoscape({
      container,
      elements: cyElements,
      style: NETWORK_CY_STYLE,
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
      minZoom: 0.1,
      maxZoom: 4,
    });
    cyRef.current = cy;

    const fitPadding = layoutNarrow ? 36 : 56;
    const afterLayout = () => {
      cy.fit(undefined, fitPadding);
      const z = cy.zoom();
      if (z > 0.12) cy.zoom(z * 0.9);
    };

    if (useSavedLayout && savedLayout.positions) {
      cy.layout({
        name: 'preset',
        positions: node => {
          const name = nodeById.get(parseInt(node.id(), 10))?.name;
          return savedLayout.positions[name];
        },
        fit: true,
        padding: fitPadding,
        stop: afterLayout,
      }).run();
    } else {
      cy.layout({
        ...buildFcoseLayoutOptions(layoutNarrow, { randomize: false }),
        stop: afterLayout,
      }).run();
    }

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
  }, [cyElements, layoutNarrow, hasNodes, useSavedLayout, nodeById]);

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
          <div className="network-legend__heading-row">
            <div className="network-legend__heading">Donor type</div>
            <p className="network-legend__scale-hint">Bigger dots &amp; party boxes = more total · thicker lines = each gift · click for amounts</p>
          </div>
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
