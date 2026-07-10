/**
 * Analytics engine. Every formula lives in `app/core/stats/metrics.ts` as a
 * pure function; this class only wires data. Unlike the original design, it
 * does NOT hold the full listings/snapshots dataset in memory: cities,
 * neighborhoods, macro figures and the list of removed sale listings are
 * small and stay resident, but a city's snapshot history is fetched from the
 * repository on demand (once per city, on cache miss) and released after the
 * computed payload is cached — the DB does the filtering (one city / one
 * month), these pure functions do the math on the resulting small set.
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
  forecastLinear,
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
import { DenormSnapshot, PropertyRepository, RemovedListing } from '../db/repository';

type SnapPredicate = (s: DenormSnapshot) => boolean;
const ALWAYS: SnapPredicate = () => true;

interface MonthStats {
  price: number; // median €/m² sale
  rent: number; // median €/m² rent
  inventory: number; // active sale count
  cutRate: number; // % of sale listings cut
}

interface MonthlySeries {
  price: SeriesPoint[];
  rent: SeriesPoint[];
  inventory: SeriesPoint[];
  cutRate: SeriesPoint[];
}

const BUILD_BANDS: [string, (y: number) => boolean][] = [
  ['before-1975', (y) => y < 1975],
  ['1975-1994', (y) => y >= 1975 && y <= 1994],
  ['1995-2014', (y) => y >= 1995 && y <= 2014],
  ['2015-plus', (y) => y >= 2015],
];

export class AnalyticsEngine {
  private cities: City[] = [];
  private neighborhoods: Neighborhood[] = [];
  private macro: MacroQuarter[] = [];
  private months: string[] = [];
  private removedSale: RemovedListing[] = [];
  private removalsByMonth = new Map<string, Map<number, number>>(); // month → cityId → count (sale)
  private soldByMonth = new Map<string, Map<number, number>>(); // month → cityId → closed transactions
  private citySeedBySlug = new Map(CITY_SEEDS.map((c) => [c.slug, c]));
  private mortgageRate: SeriesPoint[] = [];
  private nbhdById = new Map<number, Neighborhood>();
  private cityById = new Map<number, City>();
  private cityBySlug = new Map<string, City>();
  // Finite key space — `meta` + shared global series + 2 overviews + 3 entries
  // per city; no eviction needed. Holds resolved values (`cached`) and
  // in-flight/resolved promises (`cachedAsync`) side by side, keyed distinctly.
  private cache = new Map<string, unknown>();

  constructor(private readonly repo: PropertyRepository) {}

  async init(): Promise<void> {
    await this.repo.init();
    const [cities, neighborhoods, macro, months, removedSale] = await Promise.all([
      this.repo.loadCities(),
      this.repo.loadNeighborhoods(),
      this.repo.loadMacro(),
      this.repo.loadMonths(),
      this.repo.removedSaleListings(),
    ]);
    this.cities = cities;
    this.neighborhoods = neighborhoods;
    this.macro = macro;
    this.months = months;
    this.removedSale = removedSale;
    this.cityById = new Map(cities.map((c) => [c.id, c]));
    this.cityBySlug = new Map(cities.map((c) => [c.slug, c]));
    this.nbhdById = new Map(neighborhoods.map((n) => [n.id, n]));

    for (const l of removedSale) {
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
      `[analytics] ready: ${cities.length} cities / ${this.months.length} months / ` +
        `${removedSale.length} removed-sale listings indexed (snapshots load lazily per city)`,
    );
  }

  /* ---------------- series builders (operate on an already-scoped snapshot set) ---------------- */

  private groupByMonth(snaps: DenormSnapshot[]): Map<string, DenormSnapshot[]> {
    const byMonth = new Map<string, DenormSnapshot[]>();
    for (const s of snaps) {
      let arr = byMonth.get(s.month);
      if (!arr) byMonth.set(s.month, (arr = []));
      arr.push(s);
    }
    return byMonth;
  }

  private monthStats(snaps: DenormSnapshot[], pred: SnapPredicate): MonthStats {
    const salePpm2: number[] = [];
    const rentPpm2: number[] = [];
    let saleCount = 0;
    let cutCount = 0;
    for (const s of snaps) {
      if (!pred(s)) continue;
      if (s.listingType === 'sale') {
        salePpm2.push(s.priceEurPerM2);
        saleCount++;
        if (s.priceEur < s.originalPriceEur) cutCount++;
      } else if (s.listingType === 'rent') {
        rentPpm2.push(s.priceEurPerM2);
      }
    }
    return {
      price: round(median(salePpm2), 1) ?? 0,
      rent: round(median(rentPpm2), 1) ?? 0,
      inventory: saleCount,
      cutRate: saleCount ? (round((cutCount / saleCount) * 100, 1) ?? 0) : 0,
    };
  }

  /** Price/rent/inventory/cut-rate series from an already-fetched (city- or
   * globally-scoped) month→snapshots map. */
  private buildMonthlySeries(
    byMonth: Map<string, DenormSnapshot[]>,
    pred: SnapPredicate,
  ): MonthlySeries {
    const price: SeriesPoint[] = [];
    const rent: SeriesPoint[] = [];
    const inventory: SeriesPoint[] = [];
    const cutRate: SeriesPoint[] = [];
    for (const month of this.months) {
      const stats = this.monthStats(byMonth.get(month) ?? [], pred);
      price.push({ period: month, value: stats.price });
      rent.push({ period: month, value: stats.rent });
      inventory.push({ period: month, value: stats.inventory });
      cutRate.push({ period: month, value: stats.cutRate });
    }
    return { price, rent, inventory, cutRate };
  }

  /** Snapshot prices (€) of sale listings matching `pred` in one month. */
  private salePricesFrom(
    byMonth: Map<string, DenormSnapshot[]>,
    month: string,
    pred: SnapPredicate,
  ): number[] {
    const prices: number[] = [];
    for (const s of byMonth.get(month) ?? []) {
      if (s.listingType === 'sale' && pred(s)) prices.push(s.priceEur);
    }
    return prices;
  }

  /** Global (all-cities) monthly series — the one place with an inherent
   * full-scan, but it runs once (cached indefinitely) and in bounded batches
   * (≈1,470 rows/month × BATCH months at a time), never materializing the
   * whole dataset at once. Batched rather than fully sequential: awaiting
   * one month at a time means 120 round-trips to the DB, and against a remote
   * driver (e.g. Mongo Atlas) that alone can take longer than Angular's SSR
   * stabilization timeout. */
  private async computeGlobalMonthlySeries(): Promise<MonthlySeries> {
    const BATCH = 40;
    const statsByMonth: MonthStats[] = new Array(this.months.length);
    for (let i = 0; i < this.months.length; i += BATCH) {
      const batchMonths = this.months.slice(i, i + BATCH);
      const batchStats = await Promise.all(
        batchMonths.map((month) =>
          this.repo.snapshotsForMonth(month).then((snaps) => this.monthStats(snaps, ALWAYS)),
        ),
      );
      batchStats.forEach((stats, j) => (statsByMonth[i + j] = stats));
    }
    const price: SeriesPoint[] = [];
    const rent: SeriesPoint[] = [];
    const inventory: SeriesPoint[] = [];
    const cutRate: SeriesPoint[] = [];
    this.months.forEach((month, i) => {
      const stats = statsByMonth[i];
      price.push({ period: month, value: stats.price });
      rent.push({ period: month, value: stats.rent });
      inventory.push({ period: month, value: stats.inventory });
      cutRate.push({ period: month, value: stats.cutRate });
    });
    return { price, rent, inventory, cutRate };
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
  private domFor(cityId: number): number | null {
    const cutoff = this.months[this.months.length - 12];
    const samples = this.removedSale.filter(
      (l) => l.cityId === cityId && l.lastSeenDate.slice(0, 7) >= cutoff,
    );
    const dom = median(samples.map((l) => daysBetween(l.firstSeenDate, l.lastSeenDate)));
    return isNaN(dom) ? null : Math.round(dom);
  }

  private toMetric(monthly: SeriesPoint[], granularity: Granularity, decimals = 1): MetricSeries {
    const series =
      granularity === 'year'
        ? toYearly(monthly).map((p) => ({ ...p, value: round(p.value, decimals) ?? 0 }))
        : monthly;
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

  async overview(granularity: Granularity): Promise<NationalOverview> {
    return this.cachedAsync(`overview:${granularity}`, async () => {
      // Run the global series and every city's summary concurrently — each
      // is an independent DB round-trip, and against a remote driver (Mongo
      // Atlas) awaiting them one after another can add up past the SSR
      // stabilization timeout.
      const [{ price: priceMonthly, rent: rentMonthly, inventory: invMonthly }, summaries] =
        await Promise.all([
          this.cachedAsync('global-monthly-series', () => this.computeGlobalMonthlySeries()),
          Promise.all(this.cities.map((c) => this.citySummary(c))),
        ]);
      const priceYoY = yoyPct(priceMonthly, 'month') ?? 0;
      const rentYoY = yoyPct(rentMonthly, 'month') ?? 0;
      const incomeYoY = average(this.cities.map((c) => this.incomeYoY(c.region)));
      const last = priceMonthly[priceMonthly.length - 1]?.value ?? NaN;
      const lastRent = rentMonthly[rentMonthly.length - 1]?.value ?? NaN;

      return {
        granularity,
        price: this.toMetric(priceMonthly, granularity),
        priceForecast: granularity === 'month' ? forecastLinear(priceMonthly) : [],
        inventory: this.toMetric(invMonthly, granularity, 0),
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

  private async citySummary(city: City): Promise<CitySummary> {
    return this.cachedAsync(`summary:${city.slug}`, async () => {
      const snaps = await this.repo.snapshotsForCity(city.id);
      const byMonth = this.groupByMonth(snaps);
      const { price: priceMonthly, rent: rentMonthly, inventory: inv } = this.buildMonthlySeries(
        byMonth,
        ALWAYS,
      );
      const last = priceMonthly[priceMonthly.length - 1].value;
      const lastRent = rentMonthly[rentMonthly.length - 1].value;
      const priceYoY = yoyPct(priceMonthly, 'month') ?? 0;
      const rentYoY = yoyPct(rentMonthly, 'month') ?? 0;
      const incYoY = this.incomeYoY(city.region);
      const tx = this.transactionsSeries(city.id);
      const txYoY =
        tx.length > 12 ? pctChange(tx[tx.length - 1].value, tx[tx.length - 13].value) : null;
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
        domDays: this.domFor(city.id),
        transactionsYoYPct: round(txYoY, 1),
        activeListings: inv[inv.length - 1].value,
        rentalYieldPct: round(rentalYieldPct(lastRent, last), 2),
        overheatingScore: overheatingScore(priceYoY, incYoY, rentYoY),
        momentum: round(momentum(priceMonthly), 3)!,
        sparkline: priceMonthly.slice(-12),
      } satisfies CitySummary;
    });
  }

  async cityDetail(slug: string, granularity: Granularity): Promise<CityDetail | null> {
    const city = this.cityBySlug.get(slug);
    if (!city) return null;
    return this.cachedAsync(`city:${slug}:${granularity}`, async () => {
      const snaps = await this.repo.snapshotsForCity(city.id);
      const byMonth = this.groupByMonth(snaps);
      const {
        price: priceMonthly,
        rent: rentMonthly,
        inventory: invSeries,
        cutRate: cutMonthly,
      } = this.buildMonthlySeries(byMonth, ALWAYS);
      const lastMonth = this.months[this.months.length - 1];

      // Affordability: median dwelling price ÷ regional median annual income.
      const affordabilityMonthly = this.months.map((month) => {
        const medPrice = median(this.salePricesFrom(byMonth, month, ALWAYS));
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
      const removals = this.months
        .slice(-7, -1)
        .map((m) => this.removalsByMonth.get(m)?.get(city.id) ?? 0);
      const absorb = absorptionMonths(invSeries[invSeries.length - 1].value, average(removals));

      const dom = this.domFor(city.id);

      // Price cuts.
      const discounts: number[] = [];
      for (const s of byMonth.get(lastMonth) ?? []) {
        if (s.listingType !== 'sale') continue;
        if (s.priceEur < s.originalPriceEur) {
          discounts.push((1 - s.priceEur / s.originalPriceEur) * 100);
        }
      }

      // Per-city income (regional income × city factor) → PIR series.
      const citySeed = this.citySeedBySlug.get(city.slug) as CitySeed;
      const pirMonthly = this.months.map((month) => {
        const medPrice = median(this.salePricesFrom(byMonth, month, ALWAYS));
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
        const np: SnapPredicate = (s) => s.neighborhoodId === n.id;
        const { price: sale, rent, inventory: nInv } = this.buildMonthlySeries(byMonth, np);
        const lastSale = sale[sale.length - 1].value;
        const lastRent = rent[rent.length - 1].value;
        return {
          neighborhoodId: n.id,
          name: n.name,
          distanceFromCenterKm: n.distanceFromCenterKm,
          lat: n.lat,
          lng: n.lng,
          medianSaleEurPerM2: lastSale,
          medianRentEurPerM2: lastRent,
          rentalYieldPct: round(rentalYieldPct(lastRent, lastSale), 2),
          yoyPct: round(yoyPct(sale, 'month'), 1),
          activeListings: nInv[this.months.length - 1].value,
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
        priceForecast: granularity === 'month' ? forecastLinear(priceMonthly) : [],
        rent: this.toMetric(rentMonthly, granularity, 2),
        inventory: this.toMetric(invSeries, granularity, 0),
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
        byType: this.breakdown(byMonth, (s) => s.propertyType),
        byConstruction: this.breakdown(byMonth, (s) => s.construction),
        byBuildYearBand: this.breakdown(byMonth, (s) => {
          const band = BUILD_BANDS.find(([, test]) => test(s.buildYear));
          return band ? band[0] : 'other';
        }),
      } satisfies CityDetail;
    });
  }

  private breakdown(
    byMonth: Map<string, DenormSnapshot[]>,
    keyOf: (s: DenormSnapshot) => string,
  ): BreakdownRow[] {
    const lastMonth = this.months[this.months.length - 1];
    const prevYearMonth = this.months[this.months.length - 13];
    const groups = new Map<string, { now: number[]; prev: number[] }>();

    const collect = (month: string, bucket: 'now' | 'prev') => {
      for (const s of byMonth.get(month) ?? []) {
        if (s.listingType !== 'sale') continue;
        const key = keyOf(s);
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

  async compare(slugs: string[], granularity: Granularity): Promise<CityDetail[]> {
    const results = await Promise.all(slugs.map((s) => this.cityDetail(s, granularity)));
    return results.filter((d): d is CityDetail => d !== null);
  }

  async listingsPage(filter: ListingsFilter): Promise<ListingsPage> {
    const lastMonth = this.months[this.months.length - 1];
    const city = filter.city ? this.cityBySlug.get(filter.city) : undefined;
    const rows = await this.repo.listingsMatching({
      cityId: city?.id,
      neighborhoodId: filter.neighborhoodId,
      propertyType: filter.propertyType,
      construction: filter.construction,
      listingType: filter.listingType,
      status: filter.status,
      minPrice: filter.minPrice,
      maxPrice: filter.maxPrice,
      minArea: filter.minArea,
      maxArea: filter.maxArea,
    });

    const enrich = (l: Listing): ListingRow => {
      const endDate = l.currentStatus === 'removed' ? l.lastSeenDate : `${lastMonth}-28`;
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

  /** Same memoization as `cached`, but for async computations — storing the
   * in-flight promise immediately dedupes concurrent cache misses too. */
  private cachedAsync<T>(key: string, compute: () => Promise<T>): Promise<T> {
    if (!this.cache.has(key)) this.cache.set(key, compute());
    return this.cache.get(key) as Promise<T>;
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
