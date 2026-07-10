/**
 * Core domain models — shared by the SSR server (API layer) and the Angular client.
 * All identifiers/values in English; UI translates to Bulgarian labels.
 */

export type PropertyType =
  | 'studio' // 1-стаен
  | 'one-bed' // 2-стаен
  | 'two-bed' // 3-стаен
  | 'three-plus' // 4+ стаен
  | 'maisonette' // мезонет
  | 'house'; // къща

export type ConstructionType = 'brick' | 'panel' | 'epk' | 'other';

export type ListingType = 'sale' | 'rent';

export type ListingStatus = 'active' | 'removed' | 'reduced';

export interface City {
  id: number;
  slug: string;
  name: string; // Bulgarian display name
  region: string; // NSI statistical region key
  population: number;
  lat: number;
  lng: number;
}

export interface Neighborhood {
  id: number;
  cityId: number;
  name: string; // Bulgarian display name
  priceMultiplier: number;
  distanceFromCenterKm: number;
  lat: number;
  lng: number;
}

export interface Listing {
  id: number;
  cityId: number;
  neighborhoodId: number;
  propertyType: PropertyType;
  construction: ConstructionType;
  buildYear: number;
  floor: number;
  areaM2: number;
  priceEur: number; // current price
  priceEurPerM2: number;
  listingType: ListingType;
  isNew: boolean;
  firstSeenDate: string; // ISO date
  lastSeenDate: string; // ISO date
  currentStatus: ListingStatus;
  originalPriceEur: number;
  predictedEurPerM2?: number | null; // hedonic model output (sale only)
}

export interface ListingSnapshot {
  listingId: number;
  month: string; // 'YYYY-MM'
  priceEur: number;
  priceEurPerM2: number;
}

/** NSI-style macro figures per statistical region and quarter. */
export interface MacroQuarter {
  region: string;
  quarter: string; // 'YYYY-Qn'
  housePriceIndex: number; // 2020 = 100
  medianAnnualIncomeEur: number;
  rentIndex: number; // 2020 = 100
}

/* ---------- Time series / stats payloads ---------- */

export type Granularity = 'month' | 'year';

export interface SeriesPoint {
  period: string; // 'YYYY-MM' or 'YYYY'
  value: number;
}

export interface MetricSeries {
  headline: number; // latest value
  momPct: number | null; // month-over-month %
  yoyPct: number | null; // year-over-year %
  series: SeriesPoint[];
}

export interface BreakdownRow {
  key: string; // neighborhood / type / construction / build band
  label: string;
  medianEurPerM2: number;
  avgEurPerM2: number;
  count: number;
  yoyPct: number | null;
}

export interface NeighborhoodStats {
  neighborhoodId: number;
  name: string;
  distanceFromCenterKm: number;
  lat: number;
  lng: number;
  medianSaleEurPerM2: number;
  medianRentEurPerM2: number;
  rentalYieldPct: number | null;
  yoyPct: number | null;
  activeListings: number;
}

export interface CitySummary {
  city: City;
  medianEurPerM2: number;
  momPct: number | null;
  yoyPct: number | null;
  activeListings: number;
  rentalYieldPct: number | null;
  overheatingScore: number; // 0-100
  momentum: number; // signed, pp/month of MoM growth change
  qoqPct: number | null; // price change vs 3 months back
  domDays: number | null;
  transactionsYoYPct: number | null;
  sparkline: SeriesPoint[];
}

export interface CenterGradient {
  /** % price decay per km from center (negative slope). */
  decayPctPerKm: number;
  points: { name: string; distanceKm: number; medianEurPerM2: number }[];
}

export interface OverheatingGauge {
  score: number; // 0-100
  priceYoY: number;
  incomeYoY: number;
  rentYoY: number;
}

export interface RateVolumeCorrelation {
  coef: number | null; // Pearson over trailing 12 months of Δrate vs Δvolume
  direction: 'negative' | 'positive' | 'neutral';
}

export interface ConstructionSupply {
  series: SeriesPoint[]; // quarterly units under construction
  supplyYoYPct: number | null;
  priceYoYPct: number | null;
  /** supply growth − price growth; positive = supply pressure building. */
  pressure: number | null;
}

export interface CityDetail {
  city: City;
  granularity: Granularity;
  price: MetricSeries; // median €/m² (sale)
  /** Naive linear-trend extrapolation beyond the last actual month; [] if unavailable. */
  priceForecast: SeriesPoint[];
  rent: MetricSeries; // median €/m²/mo
  inventory: MetricSeries; // active listings
  priceCutRate: MetricSeries; // % of active listings cut
  avgDiscountPct: number;
  absorptionMonths: number | null; // months of supply
  domDays: number | null; // median days on market
  affordability: MetricSeries; // years of income for median dwelling (regional income)
  pir: MetricSeries; // price-to-income ratio using per-city income
  priceToRent: MetricSeries; // years to pay off via rent
  transactions: MetricSeries; // closed transactions (sold), per month
  mortgageFinancedPct: MetricSeries; // % of transactions financed by mortgage
  rateVolumeCorrelation: RateVolumeCorrelation;
  investmentShare: MetricSeries; // % of transactions with investment intent
  construction: ConstructionSupply;
  rentalYield: MetricSeries; // %
  overheating: OverheatingGauge;
  momentum: number;
  centerGradient: CenterGradient;
  neighborhoods: NeighborhoodStats[];
  byType: BreakdownRow[];
  byConstruction: BreakdownRow[];
  byBuildYearBand: BreakdownRow[];
}

export interface NationalOverview {
  granularity: Granularity;
  price: MetricSeries;
  /** Naive linear-trend extrapolation beyond the last actual month; [] if unavailable. */
  priceForecast: SeriesPoint[];
  inventory: MetricSeries;
  transactions: MetricSeries;
  mortgageRate: MetricSeries;
  rentalYieldPct: number | null;
  overheating: OverheatingGauge;
  topMovers: { city: City; yoyPct: number }[];
  cities: CitySummary[];
}

export interface ListingRow extends Listing {
  cityName: string;
  neighborhoodName: string;
  domDays: number;
  discountPct: number | null;
  overpricedPct: number | null; // actual vs hedonic prediction, +over / -under
}

export interface ListingsPage {
  total: number;
  page: number;
  pageSize: number;
  rows: ListingRow[];
}

export interface ListingsFilter {
  city?: string; // slug
  neighborhoodId?: number;
  propertyType?: PropertyType;
  construction?: ConstructionType;
  listingType?: ListingType;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
  status?: ListingStatus;
  sort?: 'price' | 'ppm2' | 'dom' | 'overpriced' | 'discount';
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface MetaInfo {
  cities: (City & { neighborhoods: Neighborhood[] })[];
  months: string[]; // available snapshot months, ascending
}

/** BGN is pegged: 1 EUR = 1.95583 BGN. */
export const BGN_PER_EUR = 1.95583;
