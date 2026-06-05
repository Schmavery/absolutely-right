/** Format an absolute number compactly (1.2K / 3.45M / 67.8B / 1.23T). */
export function fmt(n: number): string {
  if (n < 0) return '−' + fmt(-n);
  if (n < 1000) return Math.floor(n).toString();
  if (n < 1e6) return (n / 1000).toFixed(1) + 'K';
  if (n < 1e9) return (n / 1e6).toFixed(2) + 'M';
  if (n < 1e12) return (n / 1e9).toFixed(2) + 'B';
  return (n / 1e12).toFixed(2) + 'T';
}

/** Format a non-zero per-second rate (call only when `rate !== 0`). */
export function fmtRate(n: number): string {
  const abs = Math.abs(n);
  if (abs < 0.1) return n.toFixed(3) + '/s';
  if (abs < 10) return n.toFixed(1) + '/s';
  return Math.round(n) + '/s';
}
