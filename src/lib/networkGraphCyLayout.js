/** Built-in Cytoscape layout presets for the funding network. */

/**
 * `cose` tuning — adjust these to change spacing/feel.
 * Higher repulsion/overlap/idealEdgeLength → more spread out.
 */
export const COSE_CONFIG = {
  /** Target gap between connected nodes (spring rest length). */
  idealEdgeLength: 120,
  /** Extra padding around each node to prevent overlap (px). */
  nodeOverlap: 20,
  /** Push unrelated nodes apart — main "spacing" control. Default in cytoscape is 2048. */
  nodeRepulsion: 2048,
  /** How stiff donor→party links are. Lower = looser clusters. Default 32. */
  edgeElasticity: 32,
  /** Pull everything toward centre. Lower = more spread. Default 1. */
  gravity: 1,
  /** Layout iterations — more can help settle crowded graphs. Default 1000. */
  numIter: 1000,
  /** Gap between disconnected sub-graphs (minor parties floating alone). */
  componentSpacing: 120,
  /** Random starting positions — set false for a reproducible layout. */
  randomize: true,
  /** Include party label size when calculating collisions. Keep true. */
  nodeDimensionsIncludeLabels: true,
};

export const CY_LAYOUT_NAMES = [
  'semantic',
  'cose',
  'cose-tuned',
  'concentric',
  'breadthfirst',
  'circle',
  'grid',
  'random',
];

export function layoutFromSearchParams(search = '') {
  const id = new URLSearchParams(search).get('layout') || 'semantic';
  return CY_LAYOUT_NAMES.includes(id) ? id : 'semantic';
}

export function buildCyLayoutOptions(name, { fitPadding = 40, rootNodeId } = {}) {
  const fit = () => fitPadding;

  const base = {
    animate: false,
    fit: true,
    padding: fitPadding,
    stop: null,
  };

  switch (name) {
    case 'cose-tuned':
      return {
        ...base,
        name: 'cose',
        nodeDimensionsIncludeLabels: true,
        idealEdgeLength: 130,
        nodeRepulsion: 4200,
        nodeOverlap: 24,
        edgeElasticity: 0.5,
        gravity: 0.55,
        numIter: 1200,
        randomize: true,
        componentSpacing: 120,
      };

    case 'cose':
      return {
        ...base,
        name: 'cose',
        ...COSE_CONFIG,
      };

    case 'concentric':
      return {
        ...base,
        name: 'concentric',
        nodeDimensionsIncludeLabels: true,
        minNodeSpacing: 20,
        concentric: (node) => (node.data('type') === 'party' ? 2 : 1),
        levelWidth: () => 2,
        spacingFactor: 0.85,
      };

    case 'breadthfirst':
      return {
        ...base,
        name: 'breadthfirst',
        nodeDimensionsIncludeLabels: true,
        directed: false,
        spacingFactor: 1.4,
        roots: rootNodeId ? `#${rootNodeId}` : undefined,
      };

    case 'circle':
      return {
        ...base,
        name: 'circle',
        nodeDimensionsIncludeLabels: true,
        spacingFactor: 0.9,
        avoidOverlap: true,
      };

    case 'grid':
      return {
        ...base,
        name: 'grid',
        nodeDimensionsIncludeLabels: true,
        avoidOverlap: true,
        condense: false,
        spacingFactor: 1.4,
      };

    case 'random':
      return {
        ...base,
        name: 'random',
      };

    default:
      return buildCyLayoutOptions('cose', { fitPadding, rootNodeId });
  }
}
