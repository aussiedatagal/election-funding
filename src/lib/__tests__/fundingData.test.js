import { describe, it, expect } from 'vitest';
import fundingData from '../../data/funding.json';

describe('funding.json structure', () => {
  it('has required top-level fields', () => {
    expect(fundingData).toHaveProperty('years');
    expect(fundingData).toHaveProperty('byYear');
    expect(fundingData).toHaveProperty('combined');
    expect(Array.isArray(fundingData.years)).toBe(true);
    expect(fundingData.years.length).toBeGreaterThan(0);
  });

  it('has data for all declared years', () => {
    for (const year of fundingData.years) {
      expect(fundingData.byYear).toHaveProperty(year);
    }
  });

  it('combined data has nodes and links', () => {
    expect(Array.isArray(fundingData.combined.nodes)).toBe(true);
    expect(Array.isArray(fundingData.combined.links)).toBe(true);
    expect(fundingData.combined.nodes.length).toBeGreaterThan(10);
    expect(fundingData.combined.links.length).toBeGreaterThan(10);
  });

  it('all node IDs are unique within combined', () => {
    const ids = fundingData.combined.nodes.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all links reference valid node IDs', () => {
    const ids = new Set(fundingData.combined.nodes.map(n => n.id));
    for (const link of fundingData.combined.links) {
      expect(ids.has(link.source)).toBe(true);
      expect(ids.has(link.target)).toBe(true);
    }
  });

  it('party nodes have correct type', () => {
    const partyNodes = fundingData.combined.nodes.filter(n => n.type === 'party');
    expect(partyNodes.length).toBeGreaterThan(3);
    for (const n of partyNodes) {
      expect(n).toHaveProperty('name');
      expect(n).toHaveProperty('primaryParty');
    }
  });

  it('One Nation has named donor connections in combined', () => {
    const nodes = fundingData.combined.nodes;
    const oneNation = nodes.find(n => n.name === 'One Nation');
    expect(oneNation).toBeDefined();

    const nodeIds = new Set(nodes.map(n => n.id));
    const onId = oneNation.id;

    const namedDonorLinks = fundingData.combined.links.filter(l => {
      if (l.target !== onId) return false;
      const src = nodes.find(n => n.id === l.source);
      return src && src.type === 'donor';
    });
    expect(namedDonorLinks.length).toBeGreaterThan(0);
  });

  it('link values are positive', () => {
    for (const link of fundingData.combined.links) {
      expect(link.value).toBeGreaterThan(0);
    }
  });
});
