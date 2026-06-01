/**
 * Bake the hand-curated layout into network-layout.json.
 * Party anchors live in networkGraphManualLayout.js; donor positions are
 * computed then frozen in network-layout-curated.json for reproducibility.
 * Run: npm run generate-layout
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fundingData from '../src/data/funding.json' with { type: 'json' };
import { buildGraphFromFundingData } from '../src/lib/networkGraphBuild.js';
import { buildManualLayout } from '../src/lib/networkGraphManualLayoutBuild.js';
import { countLayoutOverlaps, donorRadius, partyHalfSize } from '../src/lib/networkGraphLayoutUtils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '../src/data/network-layout.json');
const CURATED_PATH = join(__dirname, '../src/data/network-layout-curated.json');

function validate(positions, graph) {
  const nodeDataById = new Map(
    graph.cyElements.filter(el => el.group === 'nodes').map(el => [el.data.id, el.data])
  );
  const bodies = [...graph.nodeById.entries()].map(([id, node]) => {
    const p = positions[node.name];
    const data = nodeDataById.get(String(id));
    if (node.type === 'party') {
      const { hw, hh } = partyHalfSize(data);
      return { id, type: 'party', x: p.x, y: p.y, w: hw * 2, h: hh * 2 };
    }
    const r = donorRadius(data);
    return { id, type: 'donor', x: p.x, y: p.y, r, w: r * 2, h: r * 2 };
  });
  return countLayoutOverlaps(bodies);
}

const graph = buildGraphFromFundingData(fundingData.combined);

let positions;
let metrics;

if (existsSync(CURATED_PATH)) {
  positions = JSON.parse(readFileSync(CURATED_PATH, 'utf8'));
  const overlaps = validate(positions, graph);
  metrics = { overlaps, source: 'curated' };
  if (overlaps > 0) {
    console.warn(`Curated layout has ${overlaps} overlaps — regenerating from build…`);
    positions = null;
  }
}

if (!positions) {
  const layout = buildManualLayout({
    nodeById: graph.nodeById,
    graphLinks: graph.graphLinks,
    cyElements: graph.cyElements,
  });
  positions = layout.positions;
  metrics = layout.metrics;
  writeFileSync(CURATED_PATH, `${JSON.stringify(positions, null, 2)}\n`);
}

const payload = {
  version: 6,
  description: 'Hand-curated layout v4 — parties + bridge donors + coalition arc placed manually',
  layout: 'manual',
  view: { fitTarget: 'all', fitPadding: 40, zoomBoost: 1.0 },
  metrics,
  nodeNames: graph.nodeNames,
  positions,
};

writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${OUT_PATH} (${Object.keys(positions).length} nodes, overlaps ${metrics.overlaps ?? 0})`);
