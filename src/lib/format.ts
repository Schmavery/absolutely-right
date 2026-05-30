/** Format an absolute number compactly (1.2K / 3.45M / 67.8B / 1.23T). */
export function fmt(n: number): string {
  if (n < 0) return '−' + fmt(-n);
  if (n < 1000) return Math.floor(n).toString();
  if (n < 1e6) return (n / 1000).toFixed(1) + 'K';
  if (n < 1e9) return (n / 1e6).toFixed(2) + 'M';
  if (n < 1e12) return (n / 1e9).toFixed(2) + 'B';
  return (n / 1e12).toFixed(2) + 'T';
}

/** Format a per-second rate with enough precision to be useful at small values. */
export function fmtRate(n: number): string {
  if (n === 0) return '0/s';
  if (n < 0.01) return n.toFixed(3) + '/s';
  if (n < 10) return n.toFixed(1) + '/s';
  return Math.round(n) + '/s';
}
