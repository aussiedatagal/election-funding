import { describe, it, expect } from 'vitest';
import fundingData from '../../data/funding.json';
import { buildGraphFromFundingData } from '../networkGraphBuild.js';
import { buildClusterLayout, computePartySimilarity } from '../networkGraphClusterLayout.js';
import { getLayoutPreset, DEFAULT_LAYOUT_PRESET } from '../networkGraphLayoutConfig.js';

function partyOverlap(positions, graph, cyElements) {
  const nodeData = new Map(
    cyElements.filter(el => el.group === 'nodes' && el.data.type === 'party').map(el => [el.data.id, el.data])
  );
  const parties = [...graph.nodeById.values()].filter(n => n.type === 'party');
  let overlap = 0;
  for (let i = 0; i < parties.length; i++) {
    for (let j = i + 1; j < parties.length; j++) {
      const a = positions[parties[i].name];
      const b = positions[parties[j].name];
      const da = nodeData.get(String(parties[i].id));
      const db = nodeData.get(String(parties[j].id));
      const ox = Math.max(0, Math.min(a.x + da.partyWidth / 2, b.x + db.partyWidth / 2) - Math.max(a.x - da.partyWidth / 2, b.x - db.partyWidth / 2));
      const oy = Math.max(0, Math.min(a.y + da.partyHeight / 2, b.y + db.partyHeight / 2) - Math.max(a.y - da.partyHeight / 2, b.y - db.partyHeight / 2));
      if (ox > 0 && oy > 0) overlap++;
    }
  }
  return overlap;
}

describe('buildClusterLayout', () => {
  it('lays out party communities in separate regions without overlap', () => {
    const graph = buildGraphFromFundingData(fundingData.combined);
    const simEdges = computePartySimilarity(graph.graphLinks, graph.nodeById);
    expect(simEdges.length).toBeGreaterThan(5);

    const { positions, metrics } = buildClusterLayout({
      nodeById: graph.nodeById,
      graphLinks: graph.graphLinks,
      cyElements: graph.cyElements,
      preset: getLayoutPreset(DEFAULT_LAYOUT_PRESET),
    });

    expect(Object.keys(positions).length).toBe(graph.nodeNames.length);
    expect(metrics.partyOverlap).toBe(0);
    expect(partyOverlap(positions, graph, graph.cyElements)).toBe(0);

    const labor = positions['Australian Labor Party'];
    const coalition = positions['Liberal-National Coalition'];
    const greens = positions['Australian Greens'];
    const palmer = positions['Clive Palmer / UAP'];

    expect(labor.x).toBeLessThan(coalition.x);
    expect(greens.x).toBeLessThan(coalition.x);
    expect(palmer.x).toBeGreaterThan(coalition.x);
  });
});
