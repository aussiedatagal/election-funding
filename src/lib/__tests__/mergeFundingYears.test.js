import { describe, it, expect } from 'vitest';
import fundingData from '../../data/funding.json';
import { mergeYearDatasets, getFundingForYears } from '../mergeFundingYears.js';

describe('mergeYearDatasets', () => {
  it('returns empty graph for no datasets', () => {
    expect(mergeYearDatasets([])).toEqual({ nodes: [], links: [] });
  });

  it('returns single dataset unchanged', () => {
    const one = fundingData.byYear['2019-20'];
    expect(mergeYearDatasets([one])).toBe(one);
  });

  it('merges two years with shared donor names into one node', () => {
    const merged = mergeYearDatasets([
      fundingData.byYear['2019-20'],
      fundingData.byYear['2020-21'],
    ]);
    const names = merged.nodes.map((n) => n.name);
    expect(new Set(names).size).toBe(names.length);
    expect(merged.links.length).toBeGreaterThan(0);
    for (const link of merged.links) {
      expect(link.value).toBeGreaterThan(0);
    }
  });
});

describe('getFundingForYears', () => {
  it('uses combined when all years selected', () => {
    const data = getFundingForYears(fundingData, [...fundingData.years]);
    expect(data).toBe(fundingData.combined);
  });

  it('uses single year dataset for one selection', () => {
    const year = fundingData.years[0];
    const data = getFundingForYears(fundingData, [year]);
    expect(data).toBe(fundingData.byYear[year]);
  });

  it('returns empty for no selection', () => {
    expect(getFundingForYears(fundingData, [])).toEqual({ nodes: [], links: [] });
  });
});
