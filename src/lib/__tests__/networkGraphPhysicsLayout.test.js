import { describe, it, expect } from 'vitest';
import fundingData from '../../data/funding.json';
import { buildGraphFromFundingData } from '../networkGraphBuild.js';
import { buildPhysicsLayout } from '../networkGraphPhysicsLayout.js';
import { countLayoutOverlaps } from '../networkGraphLayoutUtils.js';

describe('buildPhysicsLayout', () => {
  it('produces an overlap-free layout for the combined graph', () => {
    const graph = buildGraphFromFundingData(fundingData.combined);

    const { positions, metrics } = buildPhysicsLayout({
      nodeById: graph.nodeById,
      graphLinks: graph.graphLinks,
      cyElements: graph.cyElements,
      seeds: 12,
      maxSteps: 5000,
    });

    expect(Object.keys(positions).length).toBe(graph.nodeNames.length);
    expect(metrics.overlaps).toBe(0);

    const bodies = [...graph.nodeById.entries()].map(([id, node]) => {
      const data = graph.cyElements.find(el => el.group === 'nodes' && el.data.id === String(id))?.data;
      const base = {
        id,
        name: node.name,
        type: node.type,
        x: positions[node.name].x,
        y: positions[node.name].y,
      };
      if (node.type === 'party') {
        const hw = ((data?.partyWidth ?? 120) + 8) / 2;
        const hh = ((data?.partyHeight ?? 52) + 8) / 2;
        return { ...base, hw, hh, w: hw * 2, h: hh * 2 };
      }
      const r = ((data?.size ?? 18) / 2) + 5;
      return { ...base, r, hw: r, hh: r, w: r * 2, h: r * 2 };
    });

    expect(countLayoutOverlaps(bodies)).toBe(0);
  }, 60_000);
});
