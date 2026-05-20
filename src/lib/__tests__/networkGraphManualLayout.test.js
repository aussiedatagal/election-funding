import { describe, it, expect } from 'vitest';
import fundingData from '../../data/funding.json';
import { buildGraphFromFundingData } from '../networkGraphBuild.js';
import { buildManualLayout } from '../networkGraphManualLayoutBuild.js';
import { MANUAL_PARTY_POSITIONS } from '../networkGraphManualLayout.js';

describe('buildManualLayout', () => {
  it('covers every party with hand-placed coordinates', () => {
    const graph = buildGraphFromFundingData(fundingData.combined);
    const parties = [...graph.nodeById.values()].filter(n => n.type === 'party').map(n => n.name);
    for (const name of parties) {
      expect(MANUAL_PARTY_POSITIONS[name], name).toBeTruthy();
    }
  });

  it('produces an overlap-free layout', () => {
    const graph = buildGraphFromFundingData(fundingData.combined);
    const { metrics } = buildManualLayout({
      nodeById: graph.nodeById,
      graphLinks: graph.graphLinks,
      cyElements: graph.cyElements,
    });
    expect(metrics.overlaps).toBe(0);
  }, 15_000);
});
