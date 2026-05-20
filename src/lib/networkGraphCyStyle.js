/** Cytoscape stylesheet for the funding network (shared by app + layout generator). */
export const NETWORK_CY_STYLE = [
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
      'font-size': 'data(fontSize)',
      'font-weight': 600,
      'text-wrap': 'wrap',
      'text-max-width': 'data(textMaxWidth)',
      'width': 'data(partyWidth)',
      'height': 'data(partyHeight)',
      'padding': 10,
      'border-width': 'data(borderWidth)',
      'border-color': 'rgba(255,255,255,0.55)',
      'cursor': 'grab',
    },
  },
  {
    selector: 'node[type = "donor"]',
    style: {
      'shape': 'ellipse',
      'label': '',
      'width': 'data(size)',
      'height': 'data(size)',
      'border-width': 'data(borderWidth)',
      'border-color': 'rgba(15,23,42,0.35)',
      'cursor': 'grab',
    },
  },
  {
    selector: 'edge',
    style: {
      'line-color': 'data(color)',
      'width': 'data(width)',
      'opacity': 0.2,
      'curve-style': 'bezier',
      'line-cap': 'round',
    },
  },
  {
    selector: 'edge[?isSim]',
    style: { 'opacity': 0, 'width': 0, 'events': 'no' },
  },
  { selector: '.faded', style: { 'opacity': 0.07 } },
  {
    selector: 'node.highlighted',
    style: { 'opacity': 1, 'border-color': '#ffffff', 'border-width': 3 },
  },
  {
    selector: 'node[type = "donor"].highlighted',
    style: {
      'label': 'data(label)',
      'text-valign': 'bottom',
      'text-margin-y': 4,
      'font-size': 9,
      'color': '#1a1d27',
      'text-outline-color': '#ffffff',
      'text-outline-width': 2,
      'cursor': 'grab',
    },
  },
  { selector: 'edge.highlighted', style: { 'opacity': 0.92, 'width': 'data(highlightWidth)' } },
];
