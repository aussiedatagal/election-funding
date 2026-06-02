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
  const bodies = [];
  graph.nodeById.forEach((node, id) => {
    const p = positions[node.name];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return; // skip new/missing nodes
    const data = nodeDataById.get(String(id));
    if (node.type === 'party') {
      const { hw, hh } = partyHalfSize(data);
      bodies.push({ id, type: 'party', x: p.x, y: p.y, w: hw * 2, h: hh * 2 });
    } else {
      const r = donorRadius(data);
      bodies.push({ id, type: 'donor', x: p.x, y: p.y, r, w: r * 2, h: r * 2 });
    }
  });
  return countLayoutOverlaps(bodies);
}

const graph = buildGraphFromFundingData(fundingData.combined);

let positions;
let metrics;

if (existsSync(CURATED_PATH)) {
  positions = JSON.parse(readFileSync(CURATED_PATH, 'utf8'));

  // Validate only the nodes already in the curated file (ignore new nodes)
  const overlaps = validate(positions, graph);
  metrics = { overlaps, source: 'curated' };
  if (overlaps > 0) {
    console.warn(`Curated layout has ${overlaps} overlaps — using it anyway (fix by dragging in ?edit=1)`);
  }

  // Place any nodes added since the curated file was saved at the origin —
  // they'll appear in the centre and can be dragged into position via ?edit=1
  if (positions) {
    const newNodes = [];
    graph.nodeById.forEach((node) => {
      if (!positions[node.name]) {
        positions[node.name] = { x: 0, y: 0 };
        newNodes.push(node.name);
      }
    });
    if (newNodes.length) {
      console.log(`New nodes placed at origin (drag to position in ?edit=1):\n  ${newNodes.join('\n  ')}`);
      metrics.newNodes = newNodes.length;
    }
  }
}

if (!positions) {
  console.error('No valid curated layout found. Edit the layout via ?edit=1 and click Save Layout.');
  process.exit(1);
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
