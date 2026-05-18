const AUD_COMPACT = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const AUD_FULL = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 0,
});

export function formatCompact(value) {
  return AUD_COMPACT.format(value);
}

export function formatFull(value) {
  return AUD_FULL.format(value);
}

export function truncate(str, maxLen = 32) {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/** Format a share in [0, 100] as a percentage string (one decimal when under 10). */
export function formatPct(percent) {
  if (!Number.isFinite(percent) || percent <= 0) return '0%';
  const rounded = percent >= 10 ? Math.round(percent) : Math.round(percent * 10) / 10;
  return `${rounded}%`;
}
