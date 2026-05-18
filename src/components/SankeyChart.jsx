import { useMemo, useCallback, useState, useRef, useLayoutEffect } from 'react';
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

function buildLayout(data, width, height, nodeWidth, nodePadding) {
  const filteredNodes = data.nodes.filter(n => n.type !== 'donor_group');

  const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredLinks = data.links.filter(
    l => filteredNodeIds.has(l.source) && filteredNodeIds.has(l.target)
  );

  if (!filteredNodes.length) return { nodes: [], links: [] };

  const layout = d3Sankey()
    .nodeId(d => d.id)
    .nodeAlign(sankeyJustify)
    .nodeWidth(nodeWidth)
    .nodePadding(nodePadding)
    .nodeSort((a, b) => (a.sortKey ?? 999) - (b.sortKey ?? 999))
    .extent([[0, 0], [width, height]]);

  const nodes = filteredNodes.map(n => ({ ...n }));
  const links = filteredLinks.map(l => ({ ...l }));

  return layout({ nodes, links });
}

/** Tight margins so the Sankey river uses almost the full chart width */
function marginsForWidth(w) {
  const x = w || 800;
  const left = Math.round(Math.min(48, Math.max(10, x * 0.028)));
  const right = Math.round(Math.min(56, Math.max(12, x * 0.032)));
  return {
    top: x < 480 ? 22 : 28,
    right,
    bottom: 12,
    left,
  };
}

/** Decode common HTML entities from AEC CSV for on-chart labels */
function decodeSvgLabel(s) {
  if (s == null || s === '') return '';
  let t = String(s);
  for (let i = 0; i < 4; i++) {
    const next = t
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'");
    if (next === t) break;
    t = next;
  }
  return t;
}

/**
 * Full wrap for SVG: word-wrap, then hard-break tokens longer than maxPerLine.
 * No ellipsis — every character is placed on some line (may use many lines).
 */
function wrapSankeyLabelFull(text, maxPerLine) {
  const t = text.trim();
  if (!t.length) return [''];
  const limit = Math.max(4, maxPerLine);
  const words = t.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';

  const flush = () => {
    if (cur) {
      lines.push(cur);
      cur = '';
    }
  };

  const pushHardChunks = (word) => {
    let w = word;
    while (w.length > limit) {
      flush();
      lines.push(w.slice(0, limit));
      w = w.slice(limit);
    }
    return w;
  };

  for (const word of words) {
    const piece = word.length > limit ? pushHardChunks(word) : word;
    if (!piece) continue;
    const next = cur ? `${cur} ${piece}` : piece;
    if (next.length <= limit) cur = next;
    else {
      flush();
      cur = piece;
    }
  }
  flush();
  return lines.length ? lines : [t];
}

/** Fit full name into vertical budget by shrinking font; no ellipsis. */
function fitSankeyNameBlock(name, isLeft, marginPx, narrow, nodeH, targetH) {
  const minFs = narrow ? 5.05 : 5.8;
  const maxFsStart = Math.min(narrow ? 9 : 11, Math.max(6.5, nodeH * 0.52));
  const mplFor = fs => {
    const em = isLeft ? fs * 0.7 : fs * 0.58;
    const raw = Math.floor((marginPx - LABEL_PAD - 6) / Math.max(0.25, em));
    const cap = isLeft ? 80 : 42;
    return Math.max(6, Math.min(cap, raw));
  };
  let curFs = maxFsStart;
  for (let iter = 0; iter < 55; iter++) {
    const lh = curFs * 1.12;
    const lines = wrapSankeyLabelFull(name, mplFor(curFs));
    const blockH = lines.length * lh;
    if (blockH <= targetH + 0.75) return { nameLines: lines, fs: curFs, lineHeight: lh };
    if (curFs <= minFs) {
      return { nameLines: lines, fs: minFs, lineHeight: minFs * 1.12 };
    }
    curFs -= 0.28;
  }
  const fs = minFs;
  const lh = fs * 1.12;
  return { nameLines: wrapSankeyLabelFull(name, mplFor(fs)), fs, lineHeight: lh };
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
          <span className="tt-member-name">{truncate(decodeSvgLabel(m.name), 72)}</span>
          <span className="tt-member-amt">{formatCompact(m.total)}</span>
        </div>
      ))}
      {rest > 0 && <div className="tt-members-more">…and {rest} more</div>}
    </div>
  );
}

export default function SankeyChart({ data, onTooltip }) {
  const wrapRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [hoveredLinkIdx, setHoveredLinkIdx] = useState(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => {
      const w = el.getBoundingClientRect().width;
      setChartWidth(Math.floor(Math.max(260, w || el.clientWidth || 800)));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const MARGIN = useMemo(() => marginsForWidth(chartWidth || 800), [chartWidth]);
  const innerW = Math.max(120, chartWidth - MARGIN.left - MARGIN.right);
  const narrow = chartWidth > 0 && chartWidth < 520;
  const nodeWidth = narrow ? 14 : 18;
  const nodePadding = narrow ? 20 : 26;

  const visibleCount = data?.nodes?.filter(n => n.type !== 'donor_group').length ?? 40;
  // Generous vertical budget + padding so wrapped labels have room and don’t stack on neighbours
  const pxPerNode = narrow ? 26 : 34;
  const innerH = Math.max(720, Math.min(4800, visibleCount * pxPerNode));

  const { nodes, links } = useMemo(() => {
    if (!data?.nodes?.length || innerW < 120) return { nodes: [], links: [] };
    return buildLayout(data, innerW, innerH, nodeWidth, nodePadding);
  }, [data, innerW, innerH, nodeWidth, nodePadding]);

  const WIDTH = chartWidth || innerW + MARGIN.left + MARGIN.right;
  const HEIGHT = innerH + MARGIN.top + MARGIN.bottom;

  const { activeNodeIds, connectedLinkIndices } = useMemo(() => {
    if (hoveredLinkIdx === null && hoveredNodeId === null) {
      return { activeNodeIds: null, connectedLinkIndices: null };
    }

    let seed;
    if (hoveredLinkIdx !== null && links[hoveredLinkIdx]) {
      const l = links[hoveredLinkIdx];
      seed = new Set([l.source.id ?? l.source, l.target.id ?? l.target]);
    } else {
      seed = new Set([hoveredNodeId]);
    }

    const connectedLinks = new Set(
      links
        .map((l, i) => ({ l, i }))
        .filter(({ l }) =>
          seed.has(l.source.id ?? l.source) || seed.has(l.target.id ?? l.target)
        )
        .map(({ i }) => i)
    );

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
      pinned: false,
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
        </div>
      ),
    });
  }, [onTooltip]);

  const handleNodeEnter = useCallback((e, node) => {
    setHoveredNodeId(node.id);
    const isParty = node.type === 'party';
    const isGroup = node.type === 'donor_group';
    const totalIn = node.targetLinks?.reduce((s, l) => s + l.value, 0) ?? 0;
    const totalOut = node.sourceLinks?.reduce((s, l) => s + l.value, 0) ?? 0;
    const relevant = isParty ? totalIn : totalOut;
    const info = isParty ? getPartyInfo(node.name) : getDonorInfo(node.name);

    onTooltip({
      x: e.clientX,
      y: e.clientY,
      pinned: false,
      content: (
        <div className="tt-body">
          <div className="tt-name">{decodeSvgLabel(node.name)}</div>
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

  if (!chartWidth) {
    return (
      <div ref={wrapRef} className="sankey-chart-wrap" aria-hidden>
        <div className="chart-empty sankey-chart-wrap__loading">Loading chart…</div>
      </div>
    );
  }

  if (!nodes.length) {
    return (
      <div ref={wrapRef} className="sankey-chart-wrap">
        <div className="chart-empty">No data for this selection.</div>
      </div>
    );
  }

  const headerFont = narrow ? 9 : 11;

  return (
    <div ref={wrapRef} className="sankey-chart-wrap">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height="auto"
        preserveAspectRatio="xMidYMin meet"
        className="sankey-svg"
        aria-label="Sankey flow diagram of Australian political donations"
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>

          <text
            x={-LABEL_PAD}
            y={-14}
            textAnchor="end"
            className="col-header"
            style={{ fontSize: `${headerFont}px` }}
          >
            Donors
          </text>
          <text
            x={innerW + LABEL_PAD}
            y={-14}
            textAnchor="start"
            className="col-header"
            style={{ fontSize: `${headerFont}px` }}
          >
            Parties
          </text>

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
                  onPointerEnter={e => {
                    if (e.pointerType === 'touch') return;
                    handleLinkEnter(e, link, i);
                  }}
                  onMouseEnter={e => handleLinkEnter(e, link, i)}
                  onMouseLeave={handleLeave}
                />
              );
            })}
          </g>

          <g>
            {nodes.map(node => {
              const isLeft = node.x0 < innerW / 2;
              const color = nodeColor(node);
              const labelX = isLeft ? node.x0 - LABEL_PAD : node.x1 + LABEL_PAD;
              const labelAnchor = isLeft ? 'end' : 'start';
              const nodeH = Math.max(1, node.y1 - node.y0);
              const isHighlighted = activeNodeIds === null
                || activeNodeIds.has(node.id);

              // Top-align within [node.y0, node.y1]; prefer multi-line wrap (narrow maxPerLine) so text stays on-screen
              const vPad = 3;
              const availH = Math.max(8, nodeH - vPad * 2);
              const wantValue = nodeH > (narrow ? 20 : 24);
              const gapNameValue = wantValue ? 2 : 0;
              const valueLineH = wantValue ? (narrow ? 8.5 : 10.5) : 0;
              const reservedValue = wantValue ? gapNameValue + valueLineH : 0;

              const nameAvailH = Math.max(
                Math.min(narrow ? 9 : 11, Math.max(6.5, nodeH * 0.52)) * 1.12,
                availH - reservedValue
              );
              const marginPx = isLeft
                ? Math.max(28, MARGIN.left + node.x0 - LABEL_PAD - 4)
                : MARGIN.right;

              const labelText = decodeSvgLabel(node.name);
              let { nameLines, fs: fsUse, lineHeight } = fitSankeyNameBlock(
                labelText,
                isLeft,
                marginPx,
                narrow,
                nodeH,
                nameAvailH
              );
              let nameBlockH = nameLines.length * lineHeight;

              const nameY0 = node.y0 + vPad;
              let valueY = nameY0 + nameBlockH + gapNameValue;
              let showValue = wantValue && valueY + valueLineH <= node.y1 - vPad;

              if (wantValue && !showValue) {
                const refit = fitSankeyNameBlock(
                  labelText,
                  isLeft,
                  marginPx,
                  narrow,
                  nodeH,
                  availH
                );
                nameLines = refit.nameLines;
                fsUse = refit.fs;
                lineHeight = refit.lineHeight;
                nameBlockH = nameLines.length * lineHeight;
                valueY = nameY0 + nameBlockH + gapNameValue;
                showValue = wantValue && valueY + valueLineH <= node.y1 - vPad;
              }

              return (
                <g
                  key={node.id}
                  className="sankey-node"
                  style={{ opacity: activeNodeIds !== null && !isHighlighted ? 0.3 : 1, transition: 'opacity 0.1s' }}
                  onPointerEnter={e => {
                    if (e.pointerType === 'touch') return;
                    handleNodeEnter(e, node);
                  }}
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
                    y={nameY0}
                    textAnchor={labelAnchor}
                    className="sankey-label"
                    fontSize={fsUse}
                    dominantBaseline="hanging"
                  >
                    {nameLines.map((ln, li) => (
                      <tspan key={`${node.id}-ln-${li}`} x={labelX} dy={li === 0 ? 0 : lineHeight}>
                        {ln}
                      </tspan>
                    ))}
                  </text>
                  {showValue && (
                    <text
                      x={labelX}
                      y={valueY}
                      dominantBaseline="hanging"
                      textAnchor={labelAnchor}
                      className="sankey-value"
                      fontSize={narrow ? 7.5 : 9}
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
