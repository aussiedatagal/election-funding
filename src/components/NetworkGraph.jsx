import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  forceSimulation, forceLink, forceManyBody,
  forceCenter, forceCollide, forceX, forceY,
} from 'd3-force';
import { partyColor, categoryColor } from '../lib/partyConfig';
import { formatFull, truncate } from '../lib/formatters';
import { getDonorInfo, getPartyInfo } from '../lib/entityInfo';

const VB_W = 1100;
const VB_H = 700;
const BASE_R = 5;
const MAX_R = 38;

function nodeColor(node) {
  if (node.type === 'party') return partyColor(node.name);
  return categoryColor(node.category);
}

function calcR(nodeId, flowMap, maxFlow) {
  const flow = flowMap.get(nodeId) || 0;
  return BASE_R + (MAX_R - BASE_R) * Math.sqrt(flow / maxFlow);
}

// Convert screen coords → SVG viewBox coords
function toVB(clientX, clientY, rect) {
  return {
    x: (clientX - rect.left) / rect.width * VB_W,
    y: (clientY - rect.top) / rect.height * VB_H,
  };
}

export default function NetworkGraph({ data, showGroups, onTooltip }) {
  const svgRef = useRef(null);
  const simRef = useRef(null);
  const nodesRef = useRef([]);
  const linksRef = useRef([]);
  const dragNodeRef = useRef(null);   // node being dragged
  const panRef = useRef(null);        // { startVBX, startVBY, startTX, startTY }
  const vpRef = useRef({ x: 0, y: 0, k: 1 });   // live transform (no re-render lag)
  const [vp, setVp] = useState({ x: 0, y: 0, k: 1 }); // drives render
  const [, tick] = useState(0);
  const [hoveredId, setHoveredId] = useState(null);

  // Keep live ref in sync
  vpRef.current = vp;

  // ── Build graph data ──────────────────────────────────────────────────────
  const { graphNodes, graphLinks, flowMap, maxFlow, maxLinkVal } = useMemo(() => {
    if (!data?.nodes?.length) {
      return { graphNodes: [], graphLinks: [], flowMap: new Map(), maxFlow: 1, maxLinkVal: 1 };
    }
    const vis = showGroups ? data.nodes : data.nodes.filter(n => n.type !== 'donor_group');
    const visIds = new Set(vis.map(n => n.id));
    const visLinks = data.links.filter(l => visIds.has(l.source) && visIds.has(l.target));

    const flowMap = new Map();
    visLinks.forEach(l => {
      flowMap.set(l.source, (flowMap.get(l.source) || 0) + l.value);
      flowMap.set(l.target, (flowMap.get(l.target) || 0) + l.value);
    });
    const maxFlow = Math.max(...flowMap.values(), 1);
    const maxLinkVal = Math.max(...visLinks.map(l => l.value), 1);
    return { graphNodes: vis, graphLinks: visLinks, flowMap, maxFlow, maxLinkVal };
  }, [data, showGroups]);

  // ── Force simulation ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!graphNodes.length) return;

    // Seed x from sortKey (political lean) so clustering starts meaningful
    const simNodes = graphNodes.map(n => ({
      ...n,
      x: (n.sortKey / 24) * VB_W * 0.7 + VB_W * 0.15 + (Math.random() - 0.5) * 80,
      y: VB_H / 2 + (Math.random() - 0.5) * VB_H * 0.65,
    }));
    const simLinks = graphLinks.map(l => ({ ...l }));

    nodesRef.current = simNodes;
    linksRef.current = simLinks;

    const logMax = Math.log1p(maxLinkVal);

    const sim = forceSimulation(simNodes)
      .force('link', forceLink(simLinks)
        .id(d => d.id)
        .distance(d => {
          const norm = Math.log1p(d.value) / logMax;
          return 160 - 120 * norm;   // 40–160 px
        })
        .strength(d => {
          const norm = Math.log1p(d.value) / logMax;
          return 0.12 + 0.5 * norm;
        })
      )
      .force('charge', forceManyBody()
        .strength(d => -(55 + calcR(d.id, flowMap, maxFlow) * 7))
      )
      .force('center', forceCenter(VB_W / 2, VB_H / 2).strength(0.03))
      .force('x', forceX(VB_W / 2).strength(0.01))
      .force('y', forceY(VB_H / 2).strength(0.01))
      .force('collide', forceCollide()
        .radius(d => {
          const r = calcR(d.id, flowMap, maxFlow);
          // Party nodes are squares (~1.45× r), so give them more collision radius
          return (d.type === 'party' ? r * 1.55 : r) + 4;
        })
        .strength(0.65)
      )
      .alphaDecay(0.013)
      .on('tick', () => tick(n => n + 1));

    simRef.current = sim;
    return () => sim.stop();
  }, [graphNodes, graphLinks, flowMap, maxFlow, maxLinkVal]);

  // ── Non-passive wheel listener for zoom ───────────────────────────────────
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const { x: mx, y: my } = toVB(e.clientX, e.clientY, rect);
      const factor = e.deltaY < 0 ? 1.13 : 1 / 1.13;
      setVp(t => {
        const k = Math.max(0.15, Math.min(8, t.k * factor));
        const s = k / t.k;
        return { k, x: mx - s * (mx - t.x), y: my - s * (my - t.y) };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── Hover highlight ───────────────────────────────────────────────────────
  const { activeNodeIds, activeLinkSet } = useMemo(() => {
    if (hoveredId === null) return { activeNodeIds: null, activeLinkSet: null };
    const nodeIds = new Set([hoveredId]);
    const linkSet = new Set();
    linksRef.current.forEach((l, i) => {
      const s = l.source?.id ?? l.source;
      const t = l.target?.id ?? l.target;
      if (s === hoveredId || t === hoveredId) {
        linkSet.add(i);
        nodeIds.add(s);
        nodeIds.add(t);
      }
    });
    return { activeNodeIds: nodeIds, activeLinkSet: linkSet };
  }, [hoveredId]);

  // ── Node hover ────────────────────────────────────────────────────────────
  const handleNodeEnter = useCallback((e, node) => {
    setHoveredId(node.id);
    const isParty = node.type === 'party';
    const isGroup = node.type === 'donor_group';
    const total = flowMap.get(node.id) || 0;
    const info = isParty ? getPartyInfo(node.name) : getDonorInfo(node.name);

    // Build breakdown: for donors → parties they give to; for parties → donors they receive from
    const breakdown = linksRef.current
      .filter(l => {
        const s = l.source?.id ?? l.source;
        const t = l.target?.id ?? l.target;
        return isParty ? t === node.id : s === node.id;
      })
      .map(l => ({
        name: isParty ? (l.source?.name ?? '?') : (l.target?.name ?? '?'),
        value: l.value,
      }))
      .sort((a, b) => b.value - a.value);

    const shownBreakdown = breakdown.slice(0, 8);
    const rest = breakdown.length - shownBreakdown.length;

    onTooltip({
      x: e.clientX, y: e.clientY,
      content: (
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
                {isParty ? 'From donors:' : 'Donations to:'}
              </div>
              {shownBreakdown.map(item => (
                <div key={item.name} className="tt-member-row">
                  <span className="tt-member-name">{truncate(item.name, 30)}</span>
                  <span className="tt-member-amt">{formatFull(item.value)}</span>
                </div>
              ))}
              {rest > 0 && <div className="tt-members-more">…and {rest} more</div>}
            </div>
          )}
          {info && <div className="tt-info">{info}</div>}
        </div>
      ),
    });
  }, [flowMap, onTooltip]);

  const handleNodeLeave = useCallback(() => {
    setHoveredId(null);
    onTooltip(null);
  }, [onTooltip]);

  // ── Drag / pan handlers ───────────────────────────────────────────────────
  const handleNodeMouseDown = useCallback((e, node) => {
    e.stopPropagation();
    dragNodeRef.current = node;
    node.fx = node.x;
    node.fy = node.y;
    simRef.current?.alphaTarget(0.2).restart();
  }, []);

  const handleBgMouseDown = useCallback((e) => {
    if (dragNodeRef.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const vb = toVB(e.clientX, e.clientY, rect);
    const t = vpRef.current;
    panRef.current = { startX: vb.x, startY: vb.y, origTX: t.x, origTY: t.y };
  }, []);

  const handleSvgMouseMove = useCallback((e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const vb = toVB(e.clientX, e.clientY, rect);

    if (dragNodeRef.current) {
      const { x: tx, y: ty, k } = vpRef.current;
      dragNodeRef.current.fx = (vb.x - tx) / k;
      dragNodeRef.current.fy = (vb.y - ty) / k;
      simRef.current?.alpha(0.1).restart();
      tick(n => n + 1);
    } else if (panRef.current) {
      const dx = vb.x - panRef.current.startX;
      const dy = vb.y - panRef.current.startY;
      setVp(t => ({ ...t, x: panRef.current.origTX + dx, y: panRef.current.origTY + dy }));
    }
  }, []);

  const handleSvgMouseUp = useCallback(() => {
    if (dragNodeRef.current) {
      dragNodeRef.current.fx = null;
      dragNodeRef.current.fy = null;
      simRef.current?.alphaTarget(0);
      dragNodeRef.current = null;
    }
    panRef.current = null;
  }, []);

  if (!graphNodes.length) {
    return <div className="chart-empty">No data for this selection.</div>;
  }

  const nodes = nodesRef.current;
  const links = linksRef.current;
  const { x: tx, y: ty, k } = vp;

  return (
    <div className="network-outer">
      <div className="network-controls">
        <span className="network-hint">
          ■ parties · ● donors — scroll to zoom · drag background to pan · drag nodes to reposition
        </span>
        <button
          className="net-reset-btn"
          onClick={() => setVp({ x: 0, y: 0, k: 1 })}
        >
          Reset view
        </button>
      </div>
      <div className="network-container">
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="network-svg"
          onMouseDown={handleBgMouseDown}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onMouseLeave={handleSvgMouseUp}
        >
          <g transform={`translate(${tx},${ty}) scale(${k})`}>

            {/* Links */}
            {links.map((link, i) => {
              const src = link.source;
              const tgt = link.target;
              if (!src?.x || !tgt?.x) return null;
              const isActive = activeLinkSet === null || activeLinkSet.has(i);
              const alpha = activeLinkSet === null ? 0.25 : isActive ? 0.72 : 0.04;
              const partyNode = tgt.type === 'party' ? tgt : src;
              const w = 0.5 + 5 * (Math.log1p(link.value) / Math.log1p(maxLinkVal));
              return (
                <line
                  key={i}
                  x1={src.x} y1={src.y}
                  x2={tgt.x} y2={tgt.y}
                  stroke={partyColor(partyNode.name)}
                  strokeOpacity={alpha}
                  strokeWidth={w}
                />
              );
            })}

            {/* Nodes — circles for donors, rounded squares for parties */}
            {nodes.map(node => {
              if (node.x == null) return null;
              const r = calcR(node.id, flowMap, maxFlow);
              const color = nodeColor(node);
              const isActive = activeNodeIds === null || activeNodeIds.has(node.id);
              const isHov = hoveredId === node.id;
              const isParty = node.type === 'party';
              const showLabel = isParty || r > 13;
              const maxChars = r > 24 ? 18 : r > 14 ? 12 : 7;
              // Parties: rounded square; donors: circle
              const s = r * 1.45;  // square half-side so area ≈ circle area

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  style={{ opacity: isActive ? 1 : 0.1, transition: 'opacity 0.12s', cursor: 'grab' }}
                  onMouseEnter={e => handleNodeEnter(e, node)}
                  onMouseLeave={handleNodeLeave}
                  onMouseDown={e => handleNodeMouseDown(e, node)}
                >
                  {isParty ? (
                    <rect
                      x={-s} y={-s}
                      width={s * 2} height={s * 2}
                      rx={r * 0.28}
                      fill={color}
                      stroke={isHov ? '#fff' : 'rgba(255,255,255,0.55)'}
                      strokeWidth={isHov ? 2.5 : 2}
                    />
                  ) : (
                    <circle
                      r={r}
                      fill={color}
                      stroke={isHov ? '#fff' : 'rgba(0,0,0,0.18)'}
                      strokeWidth={isHov ? 2 : 0.8}
                    />
                  )}
                  {showLabel && (
                    <text
                      dy="0.35em"
                      textAnchor="middle"
                      className="net-label"
                      fontSize={Math.min(11, Math.max(6.5, r * 0.52))}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {truncate(node.name, maxChars)}
                    </text>
                  )}
                </g>
              );
            })}

          </g>
        </svg>
      </div>
    </div>
  );
}
