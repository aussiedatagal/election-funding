import { describe, it, expect } from 'vitest';
import { formatCompact, formatFull, truncate, formatPct } from '../formatters';

describe('truncate', () => {
  it('returns short strings unchanged', () => {
    expect(truncate('Hello', 32)).toBe('Hello');
  });

  it('truncates and appends ellipsis', () => {
    const long = 'A'.repeat(40);
    const result = truncate(long, 32);
    expect(result.length).toBe(32);
    expect(result.endsWith('…')).toBe(true);
  });

  it('leaves string exactly at maxLen unchanged', () => {
    const str = 'A'.repeat(32);
    expect(truncate(str, 32)).toBe(str);
  });
});

describe('formatCompact', () => {
  it('formats millions with M suffix', () => {
    expect(formatCompact(1_000_000)).toMatch(/1M|1\.0M/);
  });

  it('formats thousands with K suffix', () => {
    expect(formatCompact(50_000)).toMatch(/50K|50\.0K/);
  });

  it('includes currency symbol', () => {
    expect(formatCompact(1000)).toContain('$');
  });
});

describe('formatPct', () => {
  it('rounds large shares as whole percents', () => {
    expect(formatPct(90.4)).toBe('90%');
  });

  it('keeps one decimal for small shares', () => {
    expect(formatPct(8.33)).toBe('8.3%');
  });

  it('handles zero', () => {
    expect(formatPct(0)).toBe('0%');
  });
});

describe('formatFull', () => {
  it('formats with dollar sign and no decimal', () => {
    const result = formatFull(1234567);
    expect(result).toContain('$');
    expect(result).toContain('1,234,567');
  });

  it('handles zero', () => {
    expect(formatFull(0)).toContain('$0');
  });
});
