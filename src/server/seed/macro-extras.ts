/**
 * Synthetic macro layers that don't need per-listing persistence: BNB-style
 * mortgage rates, mortgage-financed transaction share, investment-buyer share
 * and the new-construction pipeline. All deterministic (seeded RNG), all
 * derived from the same seed config — no schema / PropertyRepository changes.
 */
import { SeriesPoint } from '../../app/core/models/domain.models';
import { CitySeed } from './geography';
import { randNormal, rngFor } from './rng';

/** Piecewise-linear anchors for the national mortgage rate (%, effective). */
const RATE_ANCHORS: [string, number][] = [
  ['2016-07', 5.1], // post-crisis normalization
  ['2018-01', 3.9],
  ['2019-06', 3.3],
  ['2021-01', 2.75], // low-rate boom floor
  ['2022-06', 2.55],
  ['2023-06', 2.9], // tightening cycle reaches BG late
  ['2024-06', 3.7], // peak
  ['2025-06', 3.45],
  ['2026-06', 3.2], // easing
];

function monthToIndex(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return y * 12 + (m - 1);
}

/** National mortgage-rate series for the given months (deterministic). */
export function mortgageRateSeries(months: string[]): SeriesPoint[] {
  const rng = rngFor('macro:mortgage-rate');
  const anchors = RATE_ANCHORS.map(([m, v]) => [monthToIndex(m), v] as const);
  return months.map((month) => {
    const x = monthToIndex(month);
    let value = anchors[anchors.length - 1][1];
    if (x <= anchors[0][0]) value = anchors[0][1];
    else {
      for (let i = 1; i < anchors.length; i++) {
        if (x <= anchors[i][0]) {
          const [x0, v0] = anchors[i - 1];
          const [x1, v1] = anchors[i];
          value = v0 + ((v1 - v0) * (x - x0)) / (x1 - x0);
          break;
        }
      }
    }
    value += randNormal(rng) * 0.03;
    return { period: month, value: +value.toFixed(2) };
  });
}

/**
 * Share of transactions financed by mortgage, per city per month (%).
 * Bigger markets lean more on credit; cheaper credit pushes the share up.
 */
export function mortgageFinancedSeries(
  city: CitySeed,
  months: string[],
  rate: SeriesPoint[],
): SeriesPoint[] {
  const rng = rngFor(`fin:${city.slug}`);
  const base = 38 + city.listingsScale * 22; // Sofia ≈ 60, small cities ≈ 41
  return months.map((month, i) => {
    const r = rate[i]?.value ?? 3.3;
    const value = base + (3.3 - r) * 4.5 + randNormal(rng) * 1.2;
    return { period: month, value: +Math.min(78, Math.max(25, value)).toFixed(1) };
  });
}

/**
 * Investment-intent buyer share, per city per month (%). Peaks in the
 * 2021–22 low-rate boom, then declines — a market-maturity signal.
 */
export function investmentShareSeries(city: CitySeed, months: string[]): SeriesPoint[] {
  const rng = rngFor(`inv:${city.slug}`);
  const peak = city.investmentPeakPct;
  return months.map((month) => {
    const [y, m] = month.split('-').map(Number);
    const t = y + (m - 1) / 12;
    let value: number;
    if (t < 2019) value = peak - 9 + (t - 2016.5) * 1.2;
    else if (t < 2020.2) value = peak - 6 + (t - 2019) * 2.5;
    else if (t < 2021) value = peak - 8; // pandemic pause
    else if (t < 2022.7) value = peak - 8 + (t - 2021) * (8 / 1.7); // boom → peak
    else value = peak - (t - 2022.7) * 2.6; // structural decline into 2026
    value += randNormal(rng) * 0.8;
    return { period: month, value: +Math.max(8, value).toFixed(1) };
  });
}

/**
 * Units under construction per city per QUARTER. Rises through 2017–2019,
 * dips in 2020, booms 2021–2024, plateaus after.
 */
export function constructionSeries(city: CitySeed, months: string[]): SeriesPoint[] {
  const rng = rngFor(`constr:${city.slug}`);
  const quarters: string[] = [];
  for (const month of months) {
    const [y, m] = month.split('-').map(Number);
    const q = `${y}-Q${Math.ceil(m / 3)}`;
    if (quarters[quarters.length - 1] !== q) quarters.push(q);
  }
  const base = Math.round(900 * city.listingsScale + city.population / 900);
  return quarters.map((quarter) => {
    const [y, qn] = quarter.split('-Q').map(Number);
    const t = y + (qn - 1) / 4;
    let factor: number;
    if (t < 2019) factor = 0.55 + (t - 2016.5) * 0.1;
    else if (t < 2020) factor = 0.8;
    else if (t < 2021) factor = 0.68; // pandemic freeze
    else if (t < 2024.5) factor = 0.72 + (t - 2021) * 0.16; // boom
    else factor = 1.28 - (t - 2024.5) * 0.05; // plateau
    const value = base * factor * (1 + randNormal(rng) * 0.05);
    return { period: quarter, value: Math.round(value) };
  });
}
