/**
 * Try several fcose layouts, score by overlap, save the best positions for the combined graph.
 * Run: npm run generate-layout
 */
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import fundingData from '../src/data/funding.json' with { type: 'json' };
import {
  buildGraphFromFundingData,
  buildFcoseLayoutOptions,
  scoreLayout,
} from '../src/lib/networkGraphBuild.js';
import { NETWORK_CY_STYLE } from '../src/lib/networkGraphCyStyle.js';

cytoscape.use(fcose);

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '../src/data/network-layout.json');

const CANDIDATES = 10;

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const { cyElements, nodeById, nodeNames } = buildGraphFromFundingData(fundingData.combined);
const nameById = new Map([...nodeById].map(([id, n]) => [String(id), n.name]));

console.log(`Graph: ${nodeNames.length} nodes, trying ${CANDIDATES} layouts…`);

let best = null;

for (let seed = 0; seed < CANDIDATES; seed++) {
  const nativeRandom = Math.random;
  Math.random = seededRandom(1000 + seed * 7919);

  const cy = cytoscape({
    headless: true,
    elements: cyElements,
    style: NETWORK_CY_STYLE,
  });

  cy.layout({
    ...buildFcoseLayoutOptions(false, { randomize: true }),
    fit: false,
  }).run();

  const score = scoreLayout(cy);
  console.log(`  seed ${seed}: score ${score.toFixed(0)}`);

  if (!best || score > best.score) {
    const positions = {};
    cy.nodes().forEach(n => {
      const name = nameById.get(n.id());
      if (name) positions[name] = { x: n.position('x'), y: n.position('y') };
    });
    best = { seed, score, positions };
  }

  cy.destroy();
  Math.random = nativeRandom;
}

const payload = {
  version: 1,
  description: 'Preset node positions for the combined (all-years) network graph',
  winningSeed: best.seed,
  score: best.score,
  nodeNames,
  positions: best.positions,
};

writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${OUT_PATH} (seed ${best.seed}, score ${best.score.toFixed(0)})`);
