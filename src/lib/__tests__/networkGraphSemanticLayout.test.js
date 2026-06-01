import { describe, it, expect } from 'vitest';
import fundingData from '../../data/funding.json';
import { buildGraphFromFundingData } from '../networkGraphBuild.js';
import { buildSemanticLayout } from '../networkGraphSemanticLayout.js';
import { countLayoutOverlaps } from '../networkGraphLayoutUtils.js';
import { partyHalfSize, donorRadius } from '../networkGraphLayoutUtils.js';

describe('buildSemanticLayout', () => {
  it('places similar parties nearby with no overlaps', () => {
    const graph = buildGraphFromFundingData(fundingData.combined);
    const nodeDataById = new Map(
      graph.cyElements.filter(el => el.group === 'nodes').map(el => [el.data.id, el.data])
    );

    const { positions, metrics } = buildSemanticLayout({
      nodeById: graph.nodeById,
      graphLinks: graph.graphLinks,
      cyElements: graph.cyElements,
      seeds: 8,
    });

    expect(Object.keys(positions).length).toBe(graph.nodeNames.length);
    expect(metrics.overlaps).toBe(0);

    const labor = positions['Australian Labor Party'];
    const greens = positions['Australian Greens'];
    const coalition = positions['Liberal-National Coalition'];
    expect(Math.hypot(greens.x - labor.x, greens.y - labor.y))
      .toBeLessThan(Math.hypot(coalition.x - labor.x, coalition.y - labor.y));

    const bodies = [...graph.nodeById.entries()].map(([id, node]) => {
      const data = nodeDataById.get(String(id));
      const base = {
        id,
        type: node.type,
        x: positions[node.name].x,
        y: positions[node.name].y,
      };
      if (node.type === 'party') {
        const { hw, hh } = partyHalfSize(data);
        return { ...base, w: hw * 2, h: hh * 2 };
      }
      const r = donorRadius(data);
      return { ...base, r, w: r * 2, h: r * 2 };
    });
    expect(countLayoutOverlaps(bodies)).toBe(0);
  }, 30_000);
});
