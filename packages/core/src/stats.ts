export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v: number): number => clamp(v, 0, 1);

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}
export const mean = (v: number[]): number => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
export function stdev(v: number[]): number {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}

/** Standard normal PDF / CDF (Abramowitz-Stegun 7.1.26 erf approximation). */
export const normPdf = (x: number): number => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
export function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}
/** Least-squares slope of y over index (per step). */
export function slope(y: number[]): number {
  const n = y.length;
  if (n < 2) return 0;
  const xm = (n - 1) / 2;
  const ym = mean(y);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (i - xm) * ((y[i] as number) - ym); den += (i - xm) ** 2; }
  return den === 0 ? 0 : num / den;
}
/** fraction of values <= x */
export const percentileRank = (values: number[], x: number): number =>
  values.length ? values.filter((v) => v <= x).length / values.length : 0.5;
