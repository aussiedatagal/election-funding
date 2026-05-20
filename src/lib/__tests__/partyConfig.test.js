import { describe, it, expect } from 'vitest';
import { partyColor, categoryColor, PARTY_ORDER, PARTY_COLORS } from '../partyConfig';

describe('partyColor', () => {
  it('returns a hex colour for known parties', () => {
    const color = partyColor('Australian Labor Party');
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(color).toBe('#E4002B');
  });

  it('returns fallback colour for unknown party', () => {
    expect(partyColor('Nonexistent Party')).toBe('#78909C');
  });
});

describe('categoryColor', () => {
  it('returns a hex colour for known categories', () => {
    const color = categoryColor('Unions');
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('returns fallback for unknown category', () => {
    expect(categoryColor('Unknown Category')).toBe('#607D8B');
  });
});

describe('PARTY_ORDER', () => {
  it('contains all parties defined in PARTY_COLORS', () => {
    const colorKeys = Object.keys(PARTY_COLORS);
    for (const party of colorKeys) {
      expect(PARTY_ORDER).toContain(party);
    }
  });

  it('places ALP before Coalition', () => {
    const alpIdx = PARTY_ORDER.indexOf('Australian Labor Party');
    const coalitionIdx = PARTY_ORDER.indexOf('Liberal-National Coalition');
    expect(alpIdx).toBeLessThan(coalitionIdx);
  });

  it('places Greens near the left', () => {
    const greensIdx = PARTY_ORDER.indexOf('Australian Greens');
    expect(greensIdx).toBeLessThan(5);
  });
});
