import { describe, it, expect } from 'vitest';
import { partyNodeMetrics } from '../networkGraphBuild.js';

describe('partyNodeMetrics', () => {
  const flows = [
    187_730_658,
    38_845_061,
    24_941_760,
    4_934_164,
    200_000,
    50_000,
  ];

  it('spreads major and minor parties apart visually', () => {
    const palmer = partyNodeMetrics(flows[0], flows);
    const coalition = partyNodeMetrics(flows[1], flows);
    const labor = partyNodeMetrics(flows[2], flows);
    const small = partyNodeMetrics(flows[5], flows);

    expect(palmer.partyWidth).toBeGreaterThan(coalition.partyWidth);
    expect(coalition.partyWidth).toBeGreaterThan(labor.partyWidth * 0.95);
    expect(labor.partyWidth).toBeGreaterThan(small.partyWidth * 1.4);
    expect(small.fontSize).toBeLessThan(palmer.fontSize);
  });
});
