import { useMemo, useCallback, useState } from 'react';
import { sankey as d3Sankey, sankeyJustify } from 'd3-sankey';
import { partyColor, categoryColor } from '../lib/partyConfig';
import { formatCompact, formatFull, truncate } from '../lib/formatters';
import { getDonorInfo, getPartyInfo } from '../lib/entityInfo';

const LABEL_PAD = 6;
const DIM_ALPHA = 0.07;
const ACTIVE_ALPHA = 0.65;
const BASE_ALPHA = 0.38;

function nodeColor(node) {
  if (node.type === 'party') return partyColor(node.name);
  return categoryColor(node.category);
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Tapered ribbon: filled bezier that correctly fills the allocated range at BOTH
// the source bar and the target bar, regardless of column height imbalance.
function taperedLinkPath(link, scale = 1) {
  const sx = link.source.x1;
  const tx = link.target.x0;
  const mx = (sx + tx) / 2;
  const sw = Math.max(0.5, (link.width / 2)) * scale;
  const tw = Math.max(0.5, (link.value * (link.target.y1 - link.target.y0) / (2 * link.target.value))) * scale;
  const sy = link.y0;
  const ty = link.y1;
  return (
    `M${sx},${sy - sw}` +
    `C${mx},${sy - sw} ${mx},${ty - tw} ${tx},${ty - tw}` +
    `L${tx},${ty + tw}` +
    `C${mx},${ty + tw} ${mx},${sy + sw} ${sx},${sy + sw}` +
    `Z`
  );
}

function buildLayout(data, width, height, showGroups) {
  const filteredNodes = showGroups
    ? data.nodes
    : data.nodes.filter(n => n.type !== 'donor_group');

  const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredLinks = data.links.filter(
    l => filteredNodeIds.has(l.source) && filteredNodeIds.has(l.target)
  );

  if (!filteredNodes.length) return { nodes: [], links: [] };

  const layout = d3Sankey()
    .nodeId(d => d.id)
    .nodeAlign(sankeyJustify)
    .nodeWidth(20)
    .nodePadding(10)
    .nodeSort((a, b) => (a.sortKey ?? 999) - (b.sortKey ?? 999))
    .extent([[0, 0], [width, height]]);

  const nodes = filteredNodes.map(n => ({ ...n }));
  const links = filteredLinks.map(l => ({ ...l }));

  return layout({ nodes, links });
}

function InfoDescription({ text }) {
  if (!text) return null;
  return <div className="tt-info">{text}</div>;
}

function GroupMembersList({ members }) {
  if (!members?.length) return null;
  const shown = members.slice(0, 10);
  const rest = members.length - shown.length;
  return (
    <div className="tt-members">
      <div className="tt-members-heading">Donors inside this group:</div>
      {shown.map(m => (
        <div key={m.name} className="tt-member-row">
          <span className="tt-member-name">{truncate(m.name, 34)}</span>
          <span className="tt-member-amt">{formatCompact(m.total)}</span>
        </div>
      ))}
      {rest > 0 && <div className="tt-members-more">…and {rest} more</div>}
    </div>
  );
}

export default function SankeyChart({ data, showGroups, onTooltip }) {
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [hoveredLinkIdx, setHoveredLinkIdx] = useState(null);

  const WIDTH = 1160;
  const MARGIN = { top: 36, right: 185, bottom: 16, left: 185 };
  const innerW = WIDTH - MARGIN.left - MARGIN.right;

  const visibleCount = data?.nodes?.filter(n =>
    showGroups ? true : n.type !== 'donor_group'
  ).length ?? 40;
  const innerH = Math.max(660, visibleCount * 13);
  const HEIGHT = innerH + MARGIN.top + MARGIN.bottom;

  const { nodes, links } = useMemo(() => {
    if (!data?.nodes?.length) return { nodes: [], links: [] };
    return buildLayout(data, innerW, innerH, showGroups);
  }, [data, innerW, innerH, showGroups]);

  // Start with the directly hovered node(s), find all connected links, then
  // expand the active set to include every node those links touch. This ensures
  // that when you hover a donor the destination party labels stay lit, and vice versa.
  const { activeNodeIds, connectedLinkIndices } = useMemo(() => {
    if (hoveredLinkIdx === null && hoveredNodeId === null) {
      return { activeNodeIds: null, connectedLinkIndices: null };
    }

    // Seed: directly hovered node(s)
    let seed;
    if (hoveredLinkIdx !== null && links[hoveredLinkIdx]) {
      const l = links[hoveredLinkIdx];
      seed = new Set([l.source.id ?? l.source, l.target.id ?? l.target]);
    } else {
      seed = new Set([hoveredNodeId]);
    }

    // All links touching the seed nodes
    const connectedLinks = new Set(
      links
        .map((l, i) => ({ l, i }))
        .filter(({ l }) =>
          seed.has(l.source.id ?? l.source) || seed.has(l.target.id ?? l.target)
        )
        .map(({ i }) => i)
    );

    // Expand: include every node at either end of those links
    const allActive = new Set(seed);
    for (const i of connectedLinks) {
      const l = links[i];
      allActive.add(l.source.id ?? l.source);
      allActive.add(l.target.id ?? l.target);
    }

    return { activeNodeIds: allActive, connectedLinkIndices: connectedLinks };
  }, [hoveredNodeId, hoveredLinkIdx, links]);

  const handleLinkEnter = useCallback((e, link, idx) => {
    setHoveredLinkIdx(idx);
    onTooltip({
      x: e.clientX,
      y: e.clientY,
      content: (
        <div className="tt-body">
          <div className="tt-flow">
            <span className="tt-src">{link.source.name}</span>
            <span className="tt-arrow">→</span>
            <span className="tt-tgt" style={{ color: partyColor(link.target.name) }}>
              {link.target.name}
            </span>
          </div>
          <div className="tt-amount">{formatFull(link.value)}</div>
          <div className="tt-hint">Hover source/target nodes to see all their flows</div>
        </div>
      ),
    });
  }, [onTooltip]);

  const handleNodeEnter = useCallback((e, node) => {
    setHoveredNodeId(node.id);
    const isParty = node.type === 'party';
    const isGroup = node.type === 'donor_group';
    const totalIn  = node.targetLinks?.reduce((s, l) => s + l.value, 0) ?? 0;
    const totalOut = node.sourceLinks?.reduce((s, l) => s + l.value, 0) ?? 0;
    const relevant = isParty ? totalIn : totalOut;
    const info = isParty ? getPartyInfo(node.name) : getDonorInfo(node.name);

    onTooltip({
      x: e.clientX,
      y: e.clientY,
      content: (
        <div className="tt-body">
          <div className="tt-name">{node.name}</div>
          <div className="tt-meta">
            {isParty
              ? 'Party / Group'
              : isGroup
                ? `Grouped donors — ${node.category}`
                : `Donor — ${node.category}`}
          </div>
          <div className="tt-amount">
            {isParty ? 'Total received: ' : 'Total donated: '}
            <strong>{formatFull(relevant)}</strong>
          </div>
          {isParty && node.targetLinks?.length > 0 && (
            <div className="tt-from">
              From {node.targetLinks.length} donor source{node.targetLinks.length !== 1 ? 's' : ''}
            </div>
          )}
          <InfoDescription text={info} />
          {isGroup && <GroupMembersList members={node.members} />}
        </div>
      ),
    });
  }, [onTooltip]);

  const handleLeave = useCallback(() => {
    setHoveredNodeId(null);
    setHoveredLinkIdx(null);
    onTooltip(null);
  }, [onTooltip]);

  if (!nodes.length) {
    return <div className="chart-empty">No data for this selection.</div>;
  }

  return (
    <div className="chart-scroll-wrapper">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={WIDTH}
        height={HEIGHT}
        className="sankey-svg"
        aria-label="Sankey flow diagram of Australian political donations"
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>

          <text x={-LABEL_PAD} y={-20} textAnchor="end" className="col-header">Donors</text>
          <text x={innerW + LABEL_PAD} y={-20} textAnchor="start" className="col-header">Parties</text>

          {/* Links */}
          <g>
            {links.map((link, i) => {
              const isConnected = connectedLinkIndices === null
                || connectedLinkIndices.has(i);
              const alpha = connectedLinkIndices === null
                ? BASE_ALPHA
                : isConnected ? ACTIVE_ALPHA : DIM_ALPHA;
              const base = partyColor(link.target.name ?? link.target.category);
              const scale = hoveredLinkIdx === i ? 1.06 : 1;
              return (
                <path
                  key={i}
                  d={taperedLinkPath(link, scale)}
                  fill={hexToRgba(base, alpha)}
                  className="sankey-link"
                  style={{ transition: 'fill 0.1s' }}
                  onMouseEnter={e => handleLinkEnter(e, link, i)}
                  onMouseLeave={handleLeave}
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {nodes.map(node => {
              const isLeft = node.x0 < innerW / 2;
              const color = nodeColor(node);
              const labelX = isLeft ? node.x0 - LABEL_PAD : node.x1 + LABEL_PAD;
              const labelAnchor = isLeft ? 'end' : 'start';
              const nodeH = Math.max(1, node.y1 - node.y0);
              const midY = (node.y0 + node.y1) / 2;
              const showValue = nodeH > 20;
              const isHighlighted = activeNodeIds === null
                || activeNodeIds.has(node.id);

              return (
                <g
                  key={node.id}
                  className="sankey-node"
                  style={{ opacity: activeNodeIds !== null && !isHighlighted ? 0.3 : 1, transition: 'opacity 0.1s' }}
                  onMouseEnter={e => handleNodeEnter(e, node)}
                  onMouseLeave={handleLeave}
                >
                  <rect
                    x={node.x0}
                    y={node.y0}
                    width={node.x1 - node.x0}
                    height={nodeH}
                    fill={color}
                    rx={2}
                  />
                  <text
                    x={labelX}
                    y={midY - (showValue ? 5 : 0)}
                    dy="0.35em"
                    textAnchor={labelAnchor}
                    className="sankey-label"
                    fontSize={Math.min(11, Math.max(8, nodeH * 0.8))}
                  >
                    {truncate(node.name, 36)}
                  </text>
                  {showValue && (
                    <text
                      x={labelX}
                      y={midY + 8}
                      dy="0.35em"
                      textAnchor={labelAnchor}
                      className="sankey-value"
                      fontSize={9}
                    >
                      {formatCompact(
                        node.type === 'party'
                          ? (node.targetLinks?.reduce((s, l) => s + l.value, 0) ?? 0)
                          : (node.sourceLinks?.reduce((s, l) => s + l.value, 0) ?? 0)
                      )}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

        </g>
      </svg>
    </div>
  );
}
