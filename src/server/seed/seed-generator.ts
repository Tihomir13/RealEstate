/**
 * Deterministic seed dataset: cities, neighborhoods, per-listing data with a
 * 24-month snapshot history, plus NSI-style quarterly macro figures.
 *
 * Everything is generated with a seeded RNG (see rng.ts), so the dataset is
 * byte-identical across restarts and machines.
 */
import {
  City,
  ConstructionType,
  Listing,
  ListingSnapshot,
  MacroQuarter,
  Neighborhood,
  PropertyType,
} from '../../app/core/models/domain.models';
import { fitHedonic, HedonicSample } from '../../app/core/stats/metrics';
import { CITY_SEEDS, REGION_SEEDS } from './geography';
import { pickWeighted, randBetween, randInt, randNormal, Rng, rngFor } from './rng';

export const MONTHS_OF_HISTORY = 120; // 10 years: 2016-07 … 2026-06
/** Last full month of the series. Fixed so the dataset stays deterministic. */
export const LAST_MONTH = '2026-06';

/**
 * Historical shape of the Bulgarian market, as a multiplier on each city's
 * baseline monthly growth. Directionally mirrors the real cycle: moderate
 * pre-2018 growth, a 2020 pandemic dip and recovery, the low-rate boom,
 * documented double-digit acceleration in 2024–2025, tapering in 2026.
 */
export function growthShape(year: number, month: number): number {
  if (year <= 2017) return 0.55;
  if (year <= 2019) return 0.85;
  if (year === 2020) return month >= 3 && month <= 6 ? -1.7 : 0.45; // dip + slow recovery
  if (year === 2021) return 1.0;
  if (year === 2022) return 1.15;
  if (year === 2023) return 0.9;
  if (year === 2024) return 1.35;
  if (year === 2025) return 1.2;
  return 0.6; // 2026 taper to single digits
}

/**
 * The neighborhood €/m² anchors in geography.ts describe today's market.
 * The index path ends at this multiple of the anchor, so the start of the
 * series lands wherever the historical shape puts it (≈0.35–0.5× for 2016).
 */
const INDEX_END_LEVEL = 1.18;

export interface SeedDataset {
  cities: City[];
  neighborhoods: Neighborhood[];
  listings: Listing[];
  snapshots: ListingSnapshot[];
  macro: MacroQuarter[];
  months: string[]; // ascending 'YYYY-MM'
}

export function monthRange(lastMonth: string, count: number): string[] {
  const [y, m] = lastMonth.split('-').map(Number);
  const months: string[] = [];
  let year = y;
  let month = m;
  for (let i = 0; i < count; i++) {
    months.unshift(`${year}-${String(month).padStart(2, '0')}`);
    month--;
    if (month === 0) {
      month = 12;
      year--;
    }
  }
  return months;
}

function isoDateIn(month: string, rng: Rng): string {
  return `${month}-${String(randInt(rng, 1, 28)).padStart(2, '0')}`;
}

const TYPE_FACTOR: Record<PropertyType, number> = {
  'studio': 1.12,
  'one-bed': 1.04,
  'two-bed': 1.0,
  'three-plus': 0.96,
  'maisonette': 0.98,
  'house': 0.90,
};

const CONSTRUCTION_FACTOR: Record<ConstructionType, number> = {
  brick: 1.04,
  panel: 0.90,
  epk: 0.96,
  other: 0.97,
};

function areaFor(type: PropertyType, rng: Rng): number {
  const ranges: Record<PropertyType, [number, number]> = {
    'studio': [28, 45],
    'one-bed': [50, 75],
    'two-bed': [75, 105],
    'three-plus': [105, 160],
    'maisonette': [110, 180],
    'house': [120, 260],
  };
  const [min, max] = ranges[type];
  return Math.round(randBetween(rng, min, max));
}

function buildYearFactor(year: number): number {
  if (year >= 2015) return 1.10;
  if (year >= 1995) return 1.02;
  if (year >= 1975) return 0.97;
  return 0.94;
}

function floorFactor(floor: number, maxFloor: number): number {
  if (floor === 1) return 0.94;
  if (floor === maxFloor) return 0.99;
  return 1.02;
}

interface PoolItem {
  listing: Listing;
  personalFactor: number;
  cutFromMonthIdx: number | null;
  cutPct: number;
}

export function generateSeedDataset(): SeedDataset {
  const months = monthRange(LAST_MONTH, MONTHS_OF_HISTORY);
  const cities: City[] = [];
  const neighborhoods: Neighborhood[] = [];
  const listings: Listing[] = [];
  const snapshots: ListingSnapshot[] = [];

  let cityId = 0;
  let nbhdId = 0;
  let listingId = 0;

  for (const seed of CITY_SEEDS) {
    cityId++;
    const city: City = {
      id: cityId,
      slug: seed.slug,
      name: seed.name,
      region: seed.region,
      population: seed.population,
    };
    cities.push(city);

    // Monthly city price index: baseline growth modulated by the historical
    // market shape (pandemic dip, 2024–25 boom), plus noise and rare dips.
    const rngIdx = rngFor(`idx:${seed.slug}`);
    const monthlyGrowth = Math.pow(1 + seed.annualGrowthPct / 100, 1 / 12) - 1;
    const index: number[] = [1];
    for (let m = 1; m < months.length; m++) {
      const [y, mo] = months[m].split('-').map(Number);
      let g = monthlyGrowth * growthShape(y, mo) + randNormal(rngIdx) * 0.004;
      if (rngIdx() < 0.05) g -= 0.011; // occasional dip
      index.push(index[m - 1] * (1 + g));
    }
    // Rescale so the series ENDS at the intended present-day level.
    const endScale = INDEX_END_LEVEL / index[index.length - 1];
    for (let m = 0; m < index.length; m++) index[m] *= endScale;

    for (const n of seed.neighborhoods) {
      nbhdId++;
      const nb: Neighborhood = {
        id: nbhdId,
        cityId: city.id,
        name: n.name,
        priceMultiplier: +(n.base / seed.neighborhoods[0].base).toFixed(3),
        distanceFromCenterKm: n.distanceKm,
      };
      neighborhoods.push(nb);

      const rng = rngFor(`pool:${seed.slug}:${n.name}`);
      const isPanelHeavy = n.distanceKm > 4 && n.base < 1600;

      const makeListing = (listingType: 'sale' | 'rent', bornIdx: number): PoolItem => {
        listingId++;
        const propertyType = pickWeighted<PropertyType>(rng, [
          ['studio', listingType === 'rent' ? 20 : 12],
          ['one-bed', 32],
          ['two-bed', 28],
          ['three-plus', 10],
          ['maisonette', 6],
          ['house', n.distanceKm > 3 ? 12 : 3],
        ]);
        const construction = pickWeighted<ConstructionType>(rng, [
          ['brick', isPanelHeavy ? 35 : 58],
          ['panel', isPanelHeavy ? 45 : 20],
          ['epk', 12],
          ['other', 8],
        ]);
        const buildYear =
          construction === 'panel'
            ? randInt(rng, 1965, 1992)
            : rng() < 0.45
              ? randInt(rng, 2005, 2026)
              : randInt(rng, 1955, 2004);
        const maxFloor = propertyType === 'house' ? 2 : construction === 'panel' ? 8 : 6;
        const floor = randInt(rng, 1, maxFloor);
        const areaM2 = areaFor(propertyType, rng);
        const personalFactor = Math.exp(randNormal(rng) * 0.11);
        const isNew = buildYear >= 2024;

        const unitBase =
          n.base *
          index[Math.max(bornIdx, 0)] *
          TYPE_FACTOR[propertyType] *
          CONSTRUCTION_FACTOR[construction] *
          buildYearFactor(buildYear) *
          floorFactor(floor, maxFloor) *
          personalFactor *
          (isNew ? 1.06 : 1);

        const ppm2 =
          listingType === 'sale'
            ? unitBase
            : unitBase * seed.yield * Math.exp(randNormal(rng) * 0.08);

        const rawPrice = ppm2 * areaM2;
        const priceEur =
          listingType === 'sale'
            ? Math.round(rawPrice / 500) * 500
            : Math.round(rawPrice / 10) * 10;

        const firstMonth = months[Math.max(bornIdx, 0)];
        const listing: Listing = {
          id: listingId,
          cityId: city.id,
          neighborhoodId: nb.id,
          propertyType,
          construction,
          buildYear,
          floor,
          areaM2,
          priceEur,
          priceEurPerM2: +(priceEur / areaM2).toFixed(1),
          listingType,
          isNew,
          firstSeenDate: isoDateIn(firstMonth, rng),
          lastSeenDate: isoDateIn(months[months.length - 1], rng),
          currentStatus: 'active',
          originalPriceEur: priceEur,
          predictedEurPerM2: null,
        };

        listings.push(listing);

        // Some listings get a price cut after >= 2 months on market.
        const overpriced = personalFactor > 1.06;
        const willCut = overpriced ? rng() < 0.55 : rng() < 0.14;
        return {
          listing,
          personalFactor,
          cutFromMonthIdx: willCut ? Math.max(bornIdx, 0) + randInt(rng, 2, 5) : null,
          cutPct: willCut ? randBetween(rng, 4, 12) : 0,
        };
      };

      const runPool = (listingType: 'sale' | 'rent') => {
        const target = Math.max(
          10,
          Math.round(28 * seed.listingsScale * (listingType === 'sale' ? 1 : 0.42)),
        );
        const domMonths =
          (listingType === 'sale' ? 2.4 : 1.6) + (seed.annualGrowthPct > 11 ? -0.4 : 0.6);
        let pool: PoolItem[] = [];
        for (let i = 0; i < target; i++) pool.push(makeListing(listingType, -randInt(rng, 0, 2)));

        for (let m = 0; m < months.length; m++) {
          // 1. Snapshots for the active pool.
          for (const item of pool) {
            let price = item.listing.originalPriceEur;
            if (item.cutFromMonthIdx !== null && m >= item.cutFromMonthIdx) {
              price = Math.round((price * (1 - item.cutPct / 100)) / 10) * 10;
              if (item.listing.currentStatus === 'active') item.listing.currentStatus = 'reduced';
              item.listing.priceEur = price;
              item.listing.priceEurPerM2 = +(price / item.listing.areaM2).toFixed(1);
            }
            snapshots.push({
              listingId: item.listing.id,
              month: months[m],
              priceEur: price,
              priceEurPerM2: +(price / item.listing.areaM2).toFixed(1),
            });
          }

          // 2. Removals (sales / withdrawn) — drives DOM, absorption and the
          // transactions metric. Runs for the final month too.
          const removalProb = 1 / domMonths;
          const stay: PoolItem[] = [];
          const currentMonth = months[m];
          for (const item of pool) {
            const bornThisMonth = item.listing.firstSeenDate.slice(0, 7) >= currentMonth;
            if (!bornThisMonth && rng() < removalProb) {
              item.listing.lastSeenDate = isoDateIn(months[m], rng);
              item.listing.currentStatus = 'removed';
            } else {
              stay.push(item);
            }
          }
          pool = stay;

          if (m === months.length - 1) break; // no refill after the final month

          // 3. New arrivals: keep the pool near a slowly growing target.
          const nextTarget = Math.round(target * (1 + 0.0015 * (m + 1)));
          while (pool.length < nextTarget) pool.push(makeListing(listingType, m + 1));
        }

        // Whatever is still in the pool remains active through the last month.
        for (const item of pool) {
          item.listing.lastSeenDate = isoDateIn(months[months.length - 1], rng);
        }
      };

      runPool('sale');
      runPool('rent');
    }
  }

  return finalize(cities, neighborhoods, listings, snapshots, months);
}

function finalize(
  cities: City[],
  neighborhoods: Neighborhood[],
  listings: Listing[],
  snapshots: ListingSnapshot[],
  months: string[],
): SeedDataset {
  const macro = generateMacro(months);
  return { cities, neighborhoods, listings, snapshots, macro, months };
}

/** NSI-style quarterly macro layer covering the snapshot window + 1 prior year. */
export function generateMacro(months: string[]): MacroQuarter[] {
  const macro: MacroQuarter[] = [];
  const firstYear = Number(months[0].slice(0, 4)) - 1;
  const lastYear = Number(months[months.length - 1].slice(0, 4));
  for (const [region, cfg] of Object.entries(REGION_SEEDS)) {
    const rng = rngFor(`macro:${region}`);
    let hpi = 118; // 2020 = 100, a few years of growth already in
    let rent = 112;
    for (let year = firstYear; year <= lastYear; year++) {
      for (let q = 1; q <= 4; q++) {
        const income =
          cfg.income2024 * Math.pow(1 + cfg.incomeGrowthPct / 100, year - 2024 + (q - 1) / 4);
        macro.push({
          region,
          quarter: `${year}-Q${q}`,
          housePriceIndex: +hpi.toFixed(1),
          medianAnnualIncomeEur: Math.round(income),
          rentIndex: +rent.toFixed(1),
        });
        hpi *= 1 + (cfg.incomeGrowthPct + 2.5) / 400 + randNormal(rng) * 0.004;
        rent *= 1 + (cfg.incomeGrowthPct + 0.5) / 400 + randNormal(rng) * 0.003;
      }
    }
  }
  return macro;
}

/**
 * Fits one hedonic model per city on the latest-month active sale listings and
 * writes `predictedEurPerM2` back onto every sale listing of that city.
 */
export function applyHedonicPredictions(ds: SeedDataset): void {
  const nbhdName = new Map(ds.neighborhoods.map((n) => [n.id, n.name]));
  for (const city of ds.cities) {
    const sale = ds.listings.filter((l) => l.cityId === city.id && l.listingType === 'sale');
    const train = sale.filter((l) => l.currentStatus !== 'removed');
    const samples: HedonicSample[] = train.map((l) => ({
      y: l.priceEurPerM2,
      categorical: [nbhdName.get(l.neighborhoodId)!, l.propertyType, l.construction],
      numeric: [l.buildYear, l.floor],
    }));
    const model = fitHedonic(samples);
    if (!model) continue;
    for (const l of sale) {
      l.predictedEurPerM2 = +model
        .predict({
          categorical: [nbhdName.get(l.neighborhoodId)!, l.propertyType, l.construction],
          numeric: [l.buildYear, l.floor],
        })
        .toFixed(1);
    }
  }
}
