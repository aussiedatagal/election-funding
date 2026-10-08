import { describe, it, expect } from 'vitest';
import { DONOR_INFO, PARTY_INFO, getDonorInfo, getPartyInfo } from '../entityInfo';

describe('getDonorInfo', () => {
  it('returns a description for known donors', () => {
    const info = getDonorInfo('Mineralogy Pty Ltd (Clive Palmer)');
    expect(typeof info).toBe('string');
    expect(info.length).toBeGreaterThan(10);
  });

  it('returns null for unknown donors', () => {
    expect(getDonorInfo('Some Unknown Entity Xyz')).toBeNull();
  });

  it('has no descriptions for private individuals', () => {
    expect(getDonorInfo('Pam Wall')).toBeNull();
    expect(getDonorInfo('Duncan Turpie')).toBeNull();
    expect(getDonorInfo('William Henderson')).toBeNull();
  });
});

describe('getPartyInfo', () => {
  it('returns a description for major parties', () => {
    expect(typeof getPartyInfo('Australian Labor Party')).toBe('string');
    expect(typeof getPartyInfo('One Nation')).toBe('string');
    expect(typeof getPartyInfo('Independents')).toBe('string');
  });

  it('returns null for unknown parties', () => {
    expect(getPartyInfo('Nonexistent Party')).toBeNull();
  });
});

describe('descriptions', () => {
  // Amounts belong in the data panel, where they come from the AEC returns.
  it('do not state donation amounts', () => {
    const texts = [...Object.values(DONOR_INFO), ...Object.values(PARTY_INFO)];
    const withAmounts = texts.filter(t => /\$\d/.test(t) && !t.startsWith('Registered parties'));
    expect(withAmounts).toEqual([]);
  });
});
