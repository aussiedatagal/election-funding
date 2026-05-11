import { describe, it, expect } from 'vitest';
import { getDonorInfo, getPartyInfo } from '../entityInfo';

describe('getDonorInfo', () => {
  it('returns a description for known donors', () => {
    const info = getDonorInfo('Mineralogy Pty Ltd (Clive Palmer)');
    expect(typeof info).toBe('string');
    expect(info.length).toBeGreaterThan(20);
  });

  it('returns null for unknown donors', () => {
    expect(getDonorInfo('Some Unknown Entity Xyz')).toBeNull();
  });

  it('has descriptions for One Nation donors', () => {
    expect(getDonorInfo('William Henderson')).not.toBeNull();
    expect(getDonorInfo('Angus Aitken')).not.toBeNull();
    expect(getDonorInfo('Westreet Investments')).not.toBeNull();
  });
});

describe('getPartyInfo', () => {
  it('returns a description for major parties', () => {
    expect(typeof getPartyInfo('Australian Labor Party')).toBe('string');
    expect(typeof getPartyInfo('Australian Greens')).toBe('string');
    expect(typeof getPartyInfo('One Nation')).toBe('string');
  });

  it('returns null for unknown parties', () => {
    expect(getPartyInfo('Nonexistent Party')).toBeNull();
  });
});
