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
