/**
 * Pure, unit-testable metric functions. No I/O, no framework imports.
 * Every formula documented on the "Методология" page maps 1:1 to a function here.
 */
import { SeriesPoint } from '../models/domain.models';

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function average(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Percent change between two values; null when base is not usable. */
export function pctChange(current: number, base: number): number | null {
  if (!isFinite(current) || !isFinite(base) || base === 0) return null;
  return ((current - base) / base) * 100;
}

/** Month-over-month % from an ascending monthly series. */
export function momPct(series: SeriesPoint[]): number | null {
  if (series.length < 2) return null;
  return pctChange(series[series.length - 1].value, series[series.length - 2].value);
}

/** Year-over-year % from an ascending series (monthly: 12 back; yearly: 1 back). */
export function yoyPct(series: SeriesPoint[], granularity: 'month' | 'year'): number | null {
  const lag = granularity === 'month' ? 12 : 1;
  if (series.length <= lag) return null;
  return pctChange(series[series.length - 1].value, series[series.length - 1 - lag].value);
}

/** Aggregate a monthly series into yearly points using the given reducer (default median). */
export function toYearly(
  monthly: SeriesPoint[],
  reduce: (values: number[]) => number = median,
): SeriesPoint[] {
  const byYear = new Map<string, number[]>();
  for (const p of monthly) {
    const year = p.period.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(p.value);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, values]) => ({ period, value: reduce(values) }));
}

/** Rental yield % = (annual rent €/m² ÷ sale price €/m²) × 100. */
export function rentalYieldPct(rentEurPerM2Month: number, saleEurPerM2: number): number | null {
  if (!isFinite(rentEurPerM2Month) || !isFinite(saleEurPerM2) || saleEurPerM2 <= 0) return null;
  return ((rentEurPerM2Month * 12) / saleEurPerM2) * 100;
}

/** Months of supply = active inventory ÷ average monthly removals. */
export function absorptionMonths(activeInventory: number, avgMonthlyRemovals: number): number | null {
  if (avgMonthlyRemovals <= 0) return null;
  return activeInventory / avgMonthlyRemovals;
}

/** Affordability = median property price ÷ median annual income (years of income). */
export function affordabilityYears(medianPriceEur: number, medianAnnualIncomeEur: number): number | null {
  if (medianAnnualIncomeEur <= 0 || !isFinite(medianPriceEur)) return null;
  return medianPriceEur / medianAnnualIncomeEur;
}

/** Days between two ISO dates. */
export function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Overheating gauge 0–100. 50 = balanced. Price growth outrunning income and
 * rent growth pushes the score up; lagging pulls it down.
 */
export function overheatingScore(priceYoY: number, incomeYoY: number, rentYoY: number): number {
  const vsIncome = priceYoY - incomeYoY;
  const vsRent = priceYoY - rentYoY;
  const raw = 50 + 3.5 * vsIncome + 2.5 * vsRent;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Price momentum (2nd derivative): OLS slope of MoM % growth over the trailing
 * window. Positive = growth is accelerating; negative = decelerating.
 * Unit: percentage points of MoM growth per month.
 */
export function momentum(series: SeriesPoint[], window = 6): number {
  if (series.length < window + 2) return 0;
  const growth: number[] = [];
  for (let i = series.length - window; i < series.length; i++) {
    const g = pctChange(series[i].value, series[i - 1].value);
    growth.push(g ?? 0);
  }
  return olsSlope(growth.map((y, x) => [x, y]));
}

/** OLS fit for [x, y] pairs: slope + intercept. slope=0, intercept=mean(y) if n<2 or degenerate. */
export function olsFit(points: [number, number][]): { slope: number; intercept: number } {
  const n = points.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  const mx = average(points.map((p) => p[0]));
  const my = average(points.map((p) => p[1]));
  if (n < 2) return { slope: 0, intercept: my };
  let num = 0;
  let den = 0;
  for (const [x, y] of points) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: my - slope * mx };
}

/** OLS slope for [x, y] pairs. */
export function olsSlope(points: [number, number][]): number {
  return points.length < 2 ? 0 : olsFit(points).slope;
}

/**
 * Center-distance gradient: fit ln(price) ~ distanceKm; slope×100 ≈ % price
 * change per km from the center (expected negative).
 */
export function centerDistanceGradient(
  points: { distanceKm: number; medianEurPerM2: number }[],
): number {
  const usable = points.filter((p) => p.medianEurPerM2 > 0);
  if (usable.length < 3) return 0;
  const slope = olsSlope(usable.map((p) => [p.distanceKm, Math.log(p.medianEurPerM2)]));
  return slope * 100;
}

/* ---------- Hedonic regression (ridge OLS via normal equations) ---------- */

export interface HedonicSample {
  y: number; // €/m²
  categorical: string[]; // e.g. [neighborhood, propertyType, construction]
  numeric: number[]; // e.g. [buildYear, floor]
}

export interface HedonicModel {
  predict(sample: Omit<HedonicSample, 'y'>): number;
}

/**
 * Fits ln(€/m²) ~ one-hot(categoricals) + standardized numerics + intercept,
 * with a small ridge penalty for stability. Returns a predictor of €/m².
 */
export function fitHedonic(samples: HedonicSample[], lambda = 1e-3): HedonicModel | null {
  if (samples.length < 20) return null;

  const catLevels: Map<string, number>[] = [];
  const catCount = samples[0].categorical.length;
  for (let c = 0; c < catCount; c++) {
    const levels = new Map<string, number>();
    for (const s of samples) {
      if (!levels.has(s.categorical[c])) levels.set(s.categorical[c], levels.size);
    }
    catLevels.push(levels);
  }
  const numCount = samples[0].numeric.length;
  const numMean: number[] = [];
  const numStd: number[] = [];
  for (let j = 0; j < numCount; j++) {
    const col = samples.map((s) => s.numeric[j]);
    const m = average(col);
    const sd = Math.sqrt(average(col.map((v) => (v - m) ** 2))) || 1;
    numMean.push(m);
    numStd.push(sd);
  }

  const dim = 1 + catLevels.reduce((a, l) => a + Math.max(l.size - 1, 0), 0) + numCount;
  const encode = (s: Omit<HedonicSample, 'y'>): number[] => {
    const x = new Array<number>(dim).fill(0);
    x[0] = 1; // intercept
    let offset = 1;
    for (let c = 0; c < catCount; c++) {
      const levels = catLevels[c];
      const idx = levels.get(s.categorical[c]);
      // dummy coding, first level is the reference
      if (idx !== undefined && idx > 0) x[offset + idx - 1] = 1;
      offset += Math.max(levels.size - 1, 0);
    }
    for (let j = 0; j < numCount; j++) x[offset + j] = (s.numeric[j] - numMean[j]) / numStd[j];
    return x;
  };

  // Normal equations: (XᵀX + λI) β = Xᵀy   (y in log space)
  const xtx = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
  const xty = new Array<number>(dim).fill(0);
  for (const s of samples) {
    const x = encode(s);
    const y = Math.log(s.y);
    for (let i = 0; i < dim; i++) {
      xty[i] += x[i] * y;
      for (let j = i; j < dim; j++) xtx[i][j] += x[i] * x[j];
    }
  }
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < i; j++) xtx[i][j] = xtx[j][i];
    xtx[i][i] += lambda * samples.length;
  }

  const beta = solveLinearSystem(xtx, xty);
  if (!beta) return null;

  return {
    predict(sample) {
      const x = encode(sample);
      let logY = 0;
      for (let i = 0; i < dim; i++) logY += beta[i] * x[i];
      return Math.exp(logY);
    },
  };
}

/** Gaussian elimination with partial pivoting. Returns null if singular. */
export function solveLinearSystem(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = col + 1; r < n; r++) {
      const f = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = m[r][n];
    for (let c = r + 1; c < n; c++) sum -= m[r][c] * x[c];
    x[r] = sum / m[r][r];
  }
  return x;
}

/* ---------- Macro-level additions (PIR, P/R, correlation, supply) ---------- */

/** Price-to-rent ratio: years to pay off the property via gross rent. */
export function priceToRentYears(saleEurPerM2: number, rentEurPerM2Month: number): number | null {
  if (!isFinite(saleEurPerM2) || !isFinite(rentEurPerM2Month) || rentEurPerM2Month <= 0) return null;
  return saleEurPerM2 / (rentEurPerM2Month * 12);
}

/** Pearson correlation coefficient of two equally sized samples. */
export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const ma = average(a.slice(0, n));
  const mb = average(b.slice(0, n));
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? null : num / den;
}

/**
 * Trailing correlation between the deltas (first differences) of two series
 * over the last `window` observations. Used as the mortgage-rate ⇄ volume
 * co-movement indicator (directional, not statistically rigorous).
 */
export function deltaCorrelation(
  a: SeriesPoint[],
  b: SeriesPoint[],
  window = 12,
): number | null {
  const n = Math.min(a.length, b.length);
  if (n < window + 1) return null;
  const da: number[] = [];
  const db: number[] = [];
  for (let i = n - window; i < n; i++) {
    da.push(a[i].value - a[i - 1].value);
    db.push(b[i].value - b[i - 1].value);
  }
  return pearson(da, db);
}

export function correlationDirection(coef: number | null): 'negative' | 'positive' | 'neutral' {
  if (coef === null || Math.abs(coef) < 0.2) return 'neutral';
  return coef < 0 ? 'negative' : 'positive';
}

/**
 * Supply pressure: new-construction supply growth YoY minus price growth YoY.
 * Positive values = supply is expanding faster than prices (pressure builds).
 */
export function supplyPressure(supplyYoYPct: number | null, priceYoYPct: number | null): number | null {
  if (supplyYoYPct === null || priceYoYPct === null) return null;
  return supplyYoYPct - priceYoYPct;
}

/** Take the trailing `n` points of a series (n<=0 → whole series). */
export function lastN(series: SeriesPoint[], n: number): SeriesPoint[] {
  return n > 0 && series.length > n ? series.slice(series.length - n) : series;
}

/** Adds n months to a 'YYYY-MM' period (only month granularity is forecastable). */
export function addMonths(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/**
 * Naive linear-trend price forecast: OLS fit of the trailing `window` months,
 * extrapolated `horizon` months forward. This is a transparent continuation of
 * the recent trend, NOT a predictive model — it ignores seasonality, shocks,
 * and trend reversals. Returns [] when there isn't enough history, or when the
 * trailing window doesn't fit a line well (R² below `minR2`), consistent with
 * other guard-clause conventions in this file (momentum→0, momPct→null).
 * The first point of the result is the last actual month (anchor, so a chart
 * can draw a gap-free dashed continuation); the rest are future months.
 */
export function forecastLinear(
  series: SeriesPoint[],
  horizon = 6,
  window = 12,
  minR2 = 0.25,
): SeriesPoint[] {
  if (series.length < window) return [];
  const trailing = series.slice(series.length - window);
  const points: [number, number][] = trailing.map((p, i) => [i, p.value]);
  const { slope, intercept } = olsFit(points);

  const yMean = average(points.map((p) => p[1]));
  let ssRes = 0;
  let ssTot = 0;
  for (const [x, y] of points) {
    const pred = intercept + slope * x;
    ssRes += (y - pred) ** 2;
    ssTot += (y - yMean) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  if (r2 < minR2) return [];

  const last = series[series.length - 1];
  const lastX = trailing.length - 1;
  const out: SeriesPoint[] = [{ period: last.period, value: last.value }];
  for (let h = 1; h <= horizon; h++) {
    out.push({
      period: addMonths(last.period, h),
      value: Math.max(0, intercept + slope * (lastX + h)),
    });
  }
  return out;
}
