/**
 * Analytics engine. Loads the dataset once through the PropertyRepository,
 * builds in-memory indices and answers all API queries. Every formula lives in
 * `app/core/stats/metrics.ts` as a pure function; this class only wires data.
 */
import {
  BreakdownRow,
  CenterGradient,
  City,
  CityDetail,
  CitySummary,
  Granularity,
  Listing,
  ListingRow,
  ListingsFilter,
  ListingSnapshot,
  ListingsPage,
  MacroQuarter,
  MetaInfo,
  MetricSeries,
  NationalOverview,
  Neighborhood,
  NeighborhoodStats,
  OverheatingGauge,
  RateVolumeCorrelation,
  SeriesPoint,
} from '../../app/core/models/domain.models';
import { CITY_SEEDS, CitySeed } from '../seed/geography';
import {
  constructionSeries,
  investmentShareSeries,
  mortgageFinancedSeries,
  mortgageRateSeries,
} from '../seed/macro-extras';
import { hashSeed } from '../seed/rng';
import {
  absorptionMonths,
  affordabilityYears,
  average,
  centerDistanceGradient,
  correlationDirection,
  daysBetween,
  deltaCorrelation,
  median,
  momentum,
  momPct,
  overheatingScore,
  pctChange,
  priceToRentYears,
  rentalYieldPct,
  supplyPressure,
  toYearly,
  yoyPct,
} from '../../app/core/stats/metrics';
import { PropertyRepository } from '../db/repository';

interface Snap extends ListingSnapshot {
  listing: Listing;
}

type Predicate = (l: Listing) => boolean;

const BUILD_BANDS: [string, (y: number) => boolean][] = [
  ['before-1975', (y) => y < 1975],
  ['1975-1994', (y) => y >= 1975 && y <= 1994],
  ['1995-2014', (y) => y >= 1995 && y <= 2014],
  ['2015-plus', (y) => y >= 2015],
];

export class AnalyticsEngine {
  private cities: City[] = [];
  private neighborhoods: Neighborhood[] = [];
  private listings: Listing[] = [];
  private macro: MacroQuarter[] = [];
  private months: string[] = [];
  private snapsByMonth = new Map<string, Snap[]>();
  private removalsByMonth = new Map<string, Map<number, number>>(); // month → cityId → count (sale)
  private soldByMonth = new Map<string, Map<number, number>>(); // month → cityId → closed transactions
  private citySeedBySlug = new Map(CITY_SEEDS.map((c) => [c.slug, c]));
  private mortgageRate: SeriesPoint[] = [];
  private nbhdById = new Map<number, Neighborhood>();
  private cityById = new Map<number, City>();
  private cityBySlug = new Map<string, City>();
  private cache = new Map<string, unknown>();

  constructor(private readonly repo: PropertyRepository) {}

  async init(): Promise<void> {
    await this.repo.init();
    const [cities, neighborhoods, listings, snapshots, macro] = await Promise.all([
      this.repo.loadCities(),
      this.repo.loadNeighborhoods(),
      this.repo.loadListings(),
      this.repo.loadSnapshots(),
      this.repo.loadMacro(),
    ]);
    this.cities = cities;
    this.neighborhoods = neighborhoods;
    this.listings = listings;
    this.macro = macro;
    this.cityById = new Map(cities.map((c) => [c.id, c]));
    this.cityBySlug = new Map(cities.map((c) => [c.slug, c]));
    this.nbhdById = new Map(neighborhoods.map((n) => [n.id, n]));

    const byId = new Map(listings.map((l) => [l.id, l]));
    const monthSet = new Set<string>();
    for (const s of snapshots) {
      monthSet.add(s.month);
      const listing = byId.get(s.listingId)!;
      let arr = this.snapsByMonth.get(s.month);
      if (!arr) this.snapsByMonth.set(s.month, (arr = []));
      arr.push({ ...s, listing });
    }
    this.months = [...monthSet].sort();

    for (const l of listings) {
      if (l.currentStatus !== 'removed' || l.listingType !== 'sale') continue;
      const m = l.lastSeenDate.slice(0, 7);
      let cityMap = this.removalsByMonth.get(m);
      if (!cityMap) this.removalsByMonth.set(m, (cityMap = new Map()));
      cityMap.set(l.cityId, (cityMap.get(l.cityId) ?? 0) + 1);
      // Deterministic sold/withdrawn split: ~78% of removals are closed deals,
      // the rest expired/withdrawn. Keyed by listing id → stable across runs.
      if (hashSeed(`sold:${l.id}`) % 100 < 78) {
        let sold = this.soldByMonth.get(m);
        if (!sold) this.soldByMonth.set(m, (sold = new Map()));
        sold.set(l.cityId, (sold.get(l.cityId) ?? 0) + 1);
      }
    }
    this.mortgageRate = mortgageRateSeries(this.months);
    console.log(
      `[analytics] indexed ${listings.length} listings / ${snapshots.length} snapshots / ${this.months.length} months`,
    );
  }

  /* ---------------- series builders ---------------- */

  private monthlySeries(
    pick: (snaps: Snap[]) => number,
  ): SeriesPoint[] {
    return this.months.map((month) => ({
      period: month,
      value: pick(this.snapsByMonth.get(month) ?? []),
    }));
  }

  private ppm2Series(pred: Predicate, listingType: 'sale' | 'rent'): SeriesPoint[] {
    return this.monthlySeries((snaps) => {
      const vals = snaps
        .filter((s) => s.listing.listingType === listingType && pred(s.listing))
        .map((s) => s.priceEurPerM2);
      return round(median(vals), 1) ?? 0;
    });
  }

  private inventorySeries(pred: Predicate): SeriesPoint[] {
    return this.monthlySeries(
      (snaps) => snaps.filter((s) => s.listing.listingType === 'sale' && pred(s.listing)).length,
    );
  }

  private cutRateSeries(pred: Predicate): SeriesPoint[] {
    return this.monthlySeries((snaps) => {
      const sale = snaps.filter((s) => s.listing.listingType === 'sale' && pred(s.listing));
      if (sale.length === 0) return 0;
      const cut = sale.filter((s) => s.priceEur < s.listing.originalPriceEur).length;
      return round((cut / sale.length) * 100, 1) ?? 0;
    });
  }

  private transactionsSeries(cityId: number | null): SeriesPoint[] {
    return this.months.map((month) => {
      const byCity = this.soldByMonth.get(month);
      let value = 0;
      if (byCity) {
        if (cityId === null) for (const v of byCity.values()) value += v;
        else value = byCity.get(cityId) ?? 0;
      }
      return { period: month, value };
    });
  }

  /** Median days-on-market of removed sale listings over the trailing 12 months. */
  private domFor(pred: Predicate): number | null {
    const cutoff = this.months[this.months.length - 12];
    const samples = this.listings.filter(
      (l) =>
        pred(l) &&
        l.listingType === 'sale' &&
        l.currentStatus === 'removed' &&
        l.lastSeenDate.slice(0, 7) >= cutoff,
    );
    const dom = median(samples.map((l) => daysBetween(l.firstSeenDate, l.lastSeenDate)));
    return isNaN(dom) ? null : Math.round(dom);
  }

  private toMetric(monthly: SeriesPoint[], granularity: Granularity, decimals = 1): MetricSeries {
    const series =
      granularity === 'year' ? toYearly(monthly).map((p) => ({ ...p, value: round(p.value, decimals) ?? 0 })) : monthly;
    return {
      headline: series.length ? series[series.length - 1].value : NaN,
      momPct: granularity === 'month' ? round(momPct(monthly), 1) : null,
      yoyPct: round(yoyPct(monthly, 'month'), 1),
      series,
    };
  }

  /* ---------------- macro helpers ---------------- */

  private incomeForMonth(region: string, month: string): number | null {
    const year = Number(month.slice(0, 4));
    const q = Math.ceil(Number(month.slice(5, 7)) / 3);
    const hit = this.macro.find((m) => m.region === region && m.quarter === `${year}-Q${q}`);
    return hit ? hit.medianAnnualIncomeEur : null;
  }

  private incomeYoY(region: string): number {
    const last = this.months[this.months.length - 1];
    const prev = this.months[this.months.length - 13] ?? this.months[0];
    const a = this.incomeForMonth(region, last);
    const b = this.incomeForMonth(region, prev);
    return a && b ? (pctChange(a, b) ?? 0) : 0;
  }

  /* ---------------- API payloads ---------------- */

  meta(): MetaInfo {
    return this.cached('meta', () => ({
      cities: this.cities.map((c) => ({
        ...c,
        neighborhoods: this.neighborhoods.filter((n) => n.cityId === c.id),
      })),
      months: this.months,
    }));
  }

  overview(granularity: Granularity): NationalOverview {
    return this.cached(`overview:${granularity}`, () => {
      const all: Predicate = () => true;
      const priceMonthly = this.ppm2Series(all, 'sale');
      const rentMonthly = this.ppm2Series(all, 'rent');
      const summaries = this.cities.map((c) => this.citySummary(c));
      const priceYoY = yoyPct(priceMonthly, 'month') ?? 0;
      const rentYoY = yoyPct(rentMonthly, 'month') ?? 0;
      const incomeYoY = average(this.cities.map((c) => this.incomeYoY(c.region)));
      const last = priceMonthly[priceMonthly.length - 1]?.value ?? NaN;
      const lastRent = rentMonthly[rentMonthly.length - 1]?.value ?? NaN;

      return {
        granularity,
        price: this.toMetric(priceMonthly, granularity),
        inventory: this.toMetric(this.inventorySeries(all), granularity, 0),
        transactions: this.toMetric(this.transactionsSeries(null), granularity, 0),
        mortgageRate: this.toMetric(this.mortgageRate, granularity, 2),
        rentalYieldPct: round(rentalYieldPct(lastRent, last), 2),
        overheating: {
          score: overheatingScore(priceYoY, incomeYoY, rentYoY),
          priceYoY: round(priceYoY, 1)!,
          incomeYoY: round(incomeYoY, 1)!,
          rentYoY: round(rentYoY, 1)!,
        },
        topMovers: summaries
          .filter((s) => s.yoyPct !== null)
          .sort((a, b) => (b.yoyPct ?? 0) - (a.yoyPct ?? 0))
          .slice(0, 4)
          .map((s) => ({ city: s.city, yoyPct: s.yoyPct! })),
        cities: summaries,
      } satisfies NationalOverview;
    });
  }

  private citySummary(city: City): CitySummary {
    return this.cached(`summary:${city.slug}`, () => {
      const pred: Predicate = (l) => l.cityId === city.id;
      const priceMonthly = this.ppm2Series(pred, 'sale');
      const rentMonthly = this.ppm2Series(pred, 'rent');
      const inv = this.inventorySeries(pred);
      const last = priceMonthly[priceMonthly.length - 1].value;
      const lastRent = rentMonthly[rentMonthly.length - 1].value;
      const priceYoY = yoyPct(priceMonthly, 'month') ?? 0;
      const rentYoY = yoyPct(rentMonthly, 'month') ?? 0;
      const incYoY = this.incomeYoY(city.region);
      const tx = this.transactionsSeries(city.id);
      const txYoY =
        tx.length > 12
          ? pctChange(tx[tx.length - 1].value, tx[tx.length - 13].value)
          : null;
      const qoq =
        priceMonthly.length > 3
          ? pctChange(last, priceMonthly[priceMonthly.length - 4].value)
          : null;
      return {
        city,
        medianEurPerM2: last,
        momPct: round(momPct(priceMonthly), 1),
        yoyPct: round(priceYoY, 1),
        qoqPct: round(qoq, 1),
        domDays: this.domFor(pred),
        transactionsYoYPct: round(txYoY, 1),
        activeListings: inv[inv.length - 1].value,
        rentalYieldPct: round(rentalYieldPct(lastRent, last), 2),
        overheatingScore: overheatingScore(priceYoY, incYoY, rentYoY),
        momentum: round(momentum(priceMonthly), 3)!,
        sparkline: priceMonthly.slice(-12),
      } satisfies CitySummary;
    });
  }

  cityDetail(slug: string, granularity: Granularity): CityDetail | null {
    const city = this.cityBySlug.get(slug);
    if (!city) return null;
    return this.cached(`city:${slug}:${granularity}`, () => {
      const pred: Predicate = (l) => l.cityId === city.id;
      const priceMonthly = this.ppm2Series(pred, 'sale');
      const rentMonthly = this.ppm2Series(pred, 'rent');
      const lastMonth = this.months[this.months.length - 1];

      // Affordability: median dwelling price ÷ regional median annual income.
      const affordabilityMonthly = this.months.map((month) => {
        const snaps = (this.snapsByMonth.get(month) ?? []).filter(
          (s) => s.listing.listingType === 'sale' && pred(s.listing),
        );
        const medPrice = median(snaps.map((s) => s.priceEur));
        const income = this.incomeForMonth(city.region, month);
        return {
          period: month,
          value: round(income ? (affordabilityYears(medPrice, income) ?? NaN) : NaN, 1) ?? 0,
        };
      });

      // Rental yield series.
      const yieldMonthly = this.months.map((_, i) => ({
        period: this.months[i],
        value: round(rentalYieldPct(rentMonthly[i].value, priceMonthly[i].value) ?? NaN, 2) ?? 0,
      }));

      // Absorption: last active inventory ÷ avg removals over trailing 6 months.
      const inv = this.inventorySeries(pred);
      const removals = this.months
        .slice(-7, -1)
        .map((m) => this.removalsByMonth.get(m)?.get(city.id) ?? 0);
      const absorb = absorptionMonths(inv[inv.length - 1].value, average(removals));

      const dom = this.domFor(pred);

      // Price cuts.
      const cutMonthly = this.cutRateSeries(pred);
      const lastSnaps = (this.snapsByMonth.get(lastMonth) ?? []).filter(
        (s) => s.listing.listingType === 'sale' && pred(s.listing),
      );
      const discounts = lastSnaps
        .filter((s) => s.priceEur < s.listing.originalPriceEur)
        .map((s) => (1 - s.priceEur / s.listing.originalPriceEur) * 100);

      // Per-city income (regional income × city factor) → PIR series.
      const citySeed = this.citySeedBySlug.get(city.slug) as CitySeed;
      const pirMonthly = this.months.map((month) => {
        const snaps = (this.snapsByMonth.get(month) ?? []).filter(
          (s) => s.listing.listingType === 'sale' && pred(s.listing),
        );
        const medPrice = median(snaps.map((s) => s.priceEur));
        const income = this.incomeForMonth(city.region, month);
        const cityIncome = income ? income * citySeed.incomeFactor : null;
        return {
          period: month,
          value: round(cityIncome ? (affordabilityYears(medPrice, cityIncome) ?? NaN) : NaN, 1) ?? 0,
        };
      });

      // Price-to-rent (years to pay off via gross rent).
      const p2rMonthly = this.months.map((_, i) => ({
        period: this.months[i],
        value: round(priceToRentYears(priceMonthly[i].value, rentMonthly[i].value) ?? NaN, 1) ?? 0,
      }));

      // Transactions + mortgage layer.
      const txMonthly = this.transactionsSeries(city.id);
      const financedMonthly = mortgageFinancedSeries(citySeed, this.months, this.mortgageRate);
      const corrCoef = deltaCorrelation(this.mortgageRate, txMonthly, 12);
      const rateVolumeCorrelation: RateVolumeCorrelation = {
        coef: round(corrCoef, 2),
        direction: correlationDirection(corrCoef),
      };

      // Investment-buyer share + construction pipeline.
      const invShareMonthly = investmentShareSeries(citySeed, this.months);
      const constructionQuarterly = constructionSeries(citySeed, this.months);
      const supplyYoY =
        constructionQuarterly.length > 4
          ? pctChange(
              constructionQuarterly[constructionQuarterly.length - 1].value,
              constructionQuarterly[constructionQuarterly.length - 5].value,
            )
          : null;

      // Overheating + momentum.
      const priceYoY = yoyPct(priceMonthly, 'month') ?? 0;
      const rentYoY = yoyPct(rentMonthly, 'month') ?? 0;
      const incYoY = this.incomeYoY(city.region);
      const overheating: OverheatingGauge = {
        score: overheatingScore(priceYoY, incYoY, rentYoY),
        priceYoY: round(priceYoY, 1)!,
        incomeYoY: round(incYoY, 1)!,
        rentYoY: round(rentYoY, 1)!,
      };

      // Neighborhood table + center gradient.
      const nbhds = this.neighborhoods.filter((n) => n.cityId === city.id);
      const nbhdStats: NeighborhoodStats[] = nbhds.map((n) => {
        const np: Predicate = (l) => l.neighborhoodId === n.id;
        const sale = this.ppm2Series(np, 'sale');
        const rent = this.ppm2Series(np, 'rent');
        const lastSale = sale[sale.length - 1].value;
        const lastRent = rent[rent.length - 1].value;
        return {
          neighborhoodId: n.id,
          name: n.name,
          distanceFromCenterKm: n.distanceFromCenterKm,
          medianSaleEurPerM2: lastSale,
          medianRentEurPerM2: lastRent,
          rentalYieldPct: round(rentalYieldPct(lastRent, lastSale), 2),
          yoyPct: round(yoyPct(sale, 'month'), 1),
          activeListings: this.inventorySeries(np)[this.months.length - 1].value,
        };
      });
      const gradient: CenterGradient = {
        decayPctPerKm: (round(
          centerDistanceGradient(
            nbhdStats.map((n) => ({
              distanceKm: n.distanceFromCenterKm,
              medianEurPerM2: n.medianSaleEurPerM2,
            })),
          ),
          1,
        ) ?? 0),
        points: nbhdStats
          .map((n) => ({
            name: n.name,
            distanceKm: n.distanceFromCenterKm,
            medianEurPerM2: n.medianSaleEurPerM2,
          }))
          .sort((a, b) => a.distanceKm - b.distanceKm),
      };

      return {
        city,
        granularity,
        price: this.toMetric(priceMonthly, granularity),
        rent: this.toMetric(rentMonthly, granularity, 2),
        inventory: this.toMetric(this.inventorySeries(pred), granularity, 0),
        priceCutRate: this.toMetric(cutMonthly, granularity),
        avgDiscountPct: round(discounts.length ? average(discounts) : 0, 1)!,
        absorptionMonths: round(absorb, 1),
        domDays: dom,
        affordability: this.toMetric(affordabilityMonthly, granularity),
        pir: this.toMetric(pirMonthly, granularity),
        priceToRent: this.toMetric(p2rMonthly, granularity),
        transactions: this.toMetric(txMonthly, granularity, 0),
        mortgageFinancedPct: this.toMetric(financedMonthly, granularity),
        rateVolumeCorrelation,
        investmentShare: this.toMetric(invShareMonthly, granularity),
        construction: {
          series: constructionQuarterly,
          supplyYoYPct: round(supplyYoY, 1),
          priceYoYPct: round(priceYoY, 1),
          pressure: round(supplyPressure(supplyYoY, priceYoY), 1),
        },
        rentalYield: this.toMetric(yieldMonthly, granularity, 2),
        overheating,
        momentum: round(momentum(priceMonthly), 3)!,
        centerGradient: gradient,
        neighborhoods: nbhdStats.sort((a, b) => b.medianSaleEurPerM2 - a.medianSaleEurPerM2),
        byType: this.breakdown(pred, (l) => l.propertyType),
        byConstruction: this.breakdown(pred, (l) => l.construction),
        byBuildYearBand: this.breakdown(pred, (l) => {
          const band = BUILD_BANDS.find(([, test]) => test(l.buildYear));
          return band ? band[0] : 'other';
        }),
      } satisfies CityDetail;
    });
  }

  private breakdown(pred: Predicate, keyOf: (l: Listing) => string): BreakdownRow[] {
    const lastMonth = this.months[this.months.length - 1];
    const prevYearMonth = this.months[this.months.length - 13];
    const groups = new Map<string, { now: number[]; prev: number[] }>();

    const collect = (month: string, bucket: 'now' | 'prev') => {
      for (const s of this.snapsByMonth.get(month) ?? []) {
        if (s.listing.listingType !== 'sale' || !pred(s.listing)) continue;
        const key = keyOf(s.listing);
        let g = groups.get(key);
        if (!g) groups.set(key, (g = { now: [], prev: [] }));
        g[bucket].push(s.priceEurPerM2);
      }
    };
    collect(lastMonth, 'now');
    if (prevYearMonth) collect(prevYearMonth, 'prev');

    return [...groups.entries()]
      .map(([key, g]) => ({
        key,
        label: key,
        medianEurPerM2: round(median(g.now), 0)!,
        avgEurPerM2: round(average(g.now), 0)!,
        count: g.now.length,
        yoyPct: g.prev.length ? round(pctChange(median(g.now), median(g.prev)), 1) : null,
      }))
      .sort((a, b) => b.medianEurPerM2 - a.medianEurPerM2);
  }

  compare(slugs: string[], granularity: Granularity): CityDetail[] {
    return slugs
      .map((s) => this.cityDetail(s, granularity))
      .filter((d): d is CityDetail => d !== null);
  }

  listingsPage(filter: ListingsFilter): ListingsPage {
    const lastMonth = this.months[this.months.length - 1];
    const city = filter.city ? this.cityBySlug.get(filter.city) : undefined;
    let rows = this.listings.filter((l) => {
      if (city && l.cityId !== city.id) return false;
      if (filter.neighborhoodId && l.neighborhoodId !== Number(filter.neighborhoodId)) return false;
      if (filter.propertyType && l.propertyType !== filter.propertyType) return false;
      if (filter.construction && l.construction !== filter.construction) return false;
      if (filter.listingType && l.listingType !== filter.listingType) return false;
      if (filter.status && l.currentStatus !== filter.status) return false;
      if (!filter.status && l.currentStatus === 'removed') return false; // default: active market
      if (filter.minPrice && l.priceEur < filter.minPrice) return false;
      if (filter.maxPrice && l.priceEur > filter.maxPrice) return false;
      if (filter.minArea && l.areaM2 < filter.minArea) return false;
      if (filter.maxArea && l.areaM2 > filter.maxArea) return false;
      return true;
    });

    const enrich = (l: Listing): ListingRow => {
      const endDate =
        l.currentStatus === 'removed' ? l.lastSeenDate : `${lastMonth}-28`;
      const overpriced =
        l.predictedEurPerM2 && l.listingType === 'sale'
          ? round(pctChange(l.priceEurPerM2, l.predictedEurPerM2), 1)
          : null;
      return {
        ...l,
        cityName: this.cityById.get(l.cityId)!.name,
        neighborhoodName: this.nbhdById.get(l.neighborhoodId)!.name,
        domDays: Math.max(0, daysBetween(l.firstSeenDate, endDate)),
        discountPct:
          l.priceEur < l.originalPriceEur
            ? round((1 - l.priceEur / l.originalPriceEur) * 100, 1)
            : null,
        overpricedPct: overpriced,
      };
    };

    const dir = filter.dir === 'asc' ? 1 : -1;
    const sortKey = filter.sort ?? 'ppm2';
    const enriched = rows.map(enrich).sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      return (va - vb) * dir;
    });

    const pageSize = Math.min(filter.pageSize ?? 25, 100);
    const page = Math.max(filter.page ?? 1, 1);
    return {
      total: enriched.length,
      page,
      pageSize,
      rows: enriched.slice((page - 1) * pageSize, page * pageSize),
    };
  }

  private cached<T>(key: string, compute: () => T): T {
    if (!this.cache.has(key)) this.cache.set(key, compute());
    return this.cache.get(key) as T;
  }
}

function sortValue(row: ListingRow, key: NonNullable<ListingsFilter['sort']>): number {
  switch (key) {
    case 'price':
      return row.priceEur;
    case 'ppm2':
      return row.priceEurPerM2;
    case 'dom':
      return row.domDays;
    case 'overpriced':
      return row.overpricedPct ?? 0;
    case 'discount':
      return row.discountPct ?? 0;
  }
}

function round(v: number | null, decimals: number): number | null {
  if (v === null || !isFinite(v)) return null;
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}
