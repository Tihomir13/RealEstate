/**
 * Persistence seam. The analytics engine reads ONLY through this interface,
 * so swapping SQLite ⇄ PostgreSQL (Supabase) ⇄ MongoDB (Atlas) is a
 * configuration change. Queries are scoped (one city / one month / a filtered
 * listings page) rather than "load everything" so the app never needs to hold
 * the full dataset in memory — the DB does the filtering, the analytics
 * engine's pure stats functions do the math on the resulting small set.
 */
import {
  City,
  ConstructionType,
  Listing,
  ListingStatus,
  ListingType,
  MacroQuarter,
  Neighborhood,
  PropertyType,
} from '../../app/core/models/domain.models';

/** A snapshot row enriched with the listing fields needed to filter/group it,
 * so per-city and per-month queries never need a join. */
export interface DenormSnapshot {
  listingId: number;
  month: string; // 'YYYY-MM'
  priceEur: number;
  priceEurPerM2: number;
  cityId: number;
  neighborhoodId: number;
  propertyType: PropertyType;
  construction: ConstructionType;
  buildYear: number;
  listingType: ListingType;
  originalPriceEur: number;
}

/** Minimal shape needed to compute days-on-market and the sold/removed split. */
export interface RemovedListing {
  id: number;
  cityId: number;
  firstSeenDate: string;
  lastSeenDate: string;
}

export interface ListingsQuery {
  cityId?: number;
  neighborhoodId?: number;
  propertyType?: PropertyType;
  construction?: ConstructionType;
  listingType?: ListingType;
  status?: ListingStatus;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
}

export interface PropertyRepository {
  /** Creates the schema if missing and seeds it when empty. */
  init(): Promise<void>;
  loadCities(): Promise<City[]>;
  loadNeighborhoods(): Promise<Neighborhood[]>;
  loadMacro(): Promise<MacroQuarter[]>;
  /** Distinct snapshot months, ascending. */
  loadMonths(): Promise<string[]>;
  /** All snapshot rows for one city, across every month. */
  snapshotsForCity(cityId: number): Promise<DenormSnapshot[]>;
  /** All snapshot rows for one month, across every city. */
  snapshotsForMonth(month: string): Promise<DenormSnapshot[]>;
  /** Every removed sale listing (the only ones feeding DOM / sold-volume stats). */
  removedSaleListings(): Promise<RemovedListing[]>;
  /** WHERE-filtered listings for the `/api/listings` page (unsorted, unpaginated —
   * sorting/pagination stay in the analytics engine since a couple of sort keys
   * are derived fields, not stored columns). */
  listingsMatching(query: ListingsQuery): Promise<Listing[]>;
  close(): Promise<void>;
}

/** Dialect-neutral DDL (works on SQLite and PostgreSQL). */
export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS cities (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    region TEXT NOT NULL,
    population INTEGER NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS neighborhoods (
    id INTEGER PRIMARY KEY,
    city_id INTEGER NOT NULL REFERENCES cities(id),
    name TEXT NOT NULL,
    price_multiplier REAL NOT NULL,
    distance_from_center_km REAL NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY,
    city_id INTEGER NOT NULL REFERENCES cities(id),
    neighborhood_id INTEGER NOT NULL REFERENCES neighborhoods(id),
    property_type TEXT NOT NULL,
    construction TEXT NOT NULL,
    build_year INTEGER NOT NULL,
    floor INTEGER NOT NULL,
    area_m2 REAL NOT NULL,
    price_eur REAL NOT NULL,
    price_eur_per_m2 REAL NOT NULL,
    listing_type TEXT NOT NULL,
    is_new INTEGER NOT NULL,
    first_seen_date TEXT NOT NULL,
    last_seen_date TEXT NOT NULL,
    current_status TEXT NOT NULL,
    original_price_eur REAL NOT NULL,
    predicted_eur_per_m2 REAL
  )`,
  `CREATE TABLE IF NOT EXISTS listing_snapshots (
    listing_id INTEGER NOT NULL REFERENCES listings(id),
    snapshot_month TEXT NOT NULL,
    price_eur REAL NOT NULL,
    price_eur_per_m2 REAL NOT NULL,
    city_id INTEGER NOT NULL REFERENCES cities(id),
    neighborhood_id INTEGER NOT NULL REFERENCES neighborhoods(id),
    property_type TEXT NOT NULL,
    construction TEXT NOT NULL,
    build_year INTEGER NOT NULL,
    listing_type TEXT NOT NULL,
    original_price_eur REAL NOT NULL,
    PRIMARY KEY (listing_id, snapshot_month)
  )`,
  `CREATE TABLE IF NOT EXISTS macro_quarters (
    region TEXT NOT NULL,
    quarter TEXT NOT NULL,
    house_price_index REAL NOT NULL,
    median_annual_income_eur REAL NOT NULL,
    rent_index REAL NOT NULL,
    PRIMARY KEY (region, quarter)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_listings_city ON listings(city_id)`,
  `CREATE INDEX IF NOT EXISTS idx_snapshots_month ON listing_snapshots(snapshot_month)`,
  `CREATE INDEX IF NOT EXISTS idx_snapshots_city_month ON listing_snapshots(city_id, snapshot_month)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_removed_sale ON listings(current_status, listing_type)`,
];

/* ---------- row mappers (snake_case DB → camelCase domain) ---------- */

export function mapCity(r: Record<string, unknown>): City {
  return {
    id: Number(r['id']),
    slug: String(r['slug']),
    name: String(r['name']),
    region: String(r['region']),
    population: Number(r['population']),
    lat: Number(r['lat']),
    lng: Number(r['lng']),
  };
}

export function mapNeighborhood(r: Record<string, unknown>): Neighborhood {
  return {
    id: Number(r['id']),
    cityId: Number(r['city_id']),
    name: String(r['name']),
    priceMultiplier: Number(r['price_multiplier']),
    distanceFromCenterKm: Number(r['distance_from_center_km']),
    lat: Number(r['lat']),
    lng: Number(r['lng']),
  };
}

export function mapListing(r: Record<string, unknown>): Listing {
  return {
    id: Number(r['id']),
    cityId: Number(r['city_id']),
    neighborhoodId: Number(r['neighborhood_id']),
    propertyType: r['property_type'] as Listing['propertyType'],
    construction: r['construction'] as Listing['construction'],
    buildYear: Number(r['build_year']),
    floor: Number(r['floor']),
    areaM2: Number(r['area_m2']),
    priceEur: Number(r['price_eur']),
    priceEurPerM2: Number(r['price_eur_per_m2']),
    listingType: r['listing_type'] as Listing['listingType'],
    isNew: Number(r['is_new']) === 1 || r['is_new'] === true,
    firstSeenDate: String(r['first_seen_date']),
    lastSeenDate: String(r['last_seen_date']),
    currentStatus: r['current_status'] as Listing['currentStatus'],
    originalPriceEur: Number(r['original_price_eur']),
    predictedEurPerM2: r['predicted_eur_per_m2'] == null ? null : Number(r['predicted_eur_per_m2']),
  };
}

export function mapDenormSnapshot(r: Record<string, unknown>): DenormSnapshot {
  return {
    listingId: Number(r['listing_id']),
    month: String(r['snapshot_month']),
    priceEur: Number(r['price_eur']),
    priceEurPerM2: Number(r['price_eur_per_m2']),
    cityId: Number(r['city_id']),
    neighborhoodId: Number(r['neighborhood_id']),
    propertyType: r['property_type'] as DenormSnapshot['propertyType'],
    construction: r['construction'] as DenormSnapshot['construction'],
    buildYear: Number(r['build_year']),
    listingType: r['listing_type'] as DenormSnapshot['listingType'],
    originalPriceEur: Number(r['original_price_eur']),
  };
}

export function mapRemovedListing(r: Record<string, unknown>): RemovedListing {
  return {
    id: Number(r['id']),
    cityId: Number(r['city_id']),
    firstSeenDate: String(r['first_seen_date']),
    lastSeenDate: String(r['last_seen_date']),
  };
}

/**
 * Shared WHERE-clause builder for `listingsMatching`, used by both SQL repos.
 * `placeholder(n)` renders the n-th bind parameter (`?` for SQLite, `$n` for Postgres).
 */
export function buildListingsWhereSql(
  query: ListingsQuery,
  placeholder: (n: number) => string,
): { sql: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => {
    values.push(value);
    conditions.push(`${column} = ${placeholder(values.length)}`);
  };
  // Truthy checks (not `!= null`) mirror the original in-memory filter's
  // `if (filter.x && ...)` semantics exactly, including the `0`-is-ignored quirk.
  if (query.cityId != null) add('city_id', query.cityId);
  if (query.neighborhoodId) add('neighborhood_id', query.neighborhoodId);
  if (query.propertyType) add('property_type', query.propertyType);
  if (query.construction) add('construction', query.construction);
  if (query.listingType) add('listing_type', query.listingType);
  if (query.status) {
    add('current_status', query.status);
  } else {
    conditions.push("current_status != 'removed'"); // default: active market
  }
  if (query.minPrice) {
    values.push(query.minPrice);
    conditions.push(`price_eur >= ${placeholder(values.length)}`);
  }
  if (query.maxPrice) {
    values.push(query.maxPrice);
    conditions.push(`price_eur <= ${placeholder(values.length)}`);
  }
  if (query.minArea) {
    values.push(query.minArea);
    conditions.push(`area_m2 >= ${placeholder(values.length)}`);
  }
  if (query.maxArea) {
    values.push(query.maxArea);
    conditions.push(`area_m2 <= ${placeholder(values.length)}`);
  }
  return { sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values };
}

export function mapMacro(r: Record<string, unknown>): MacroQuarter {
  return {
    region: String(r['region']),
    quarter: String(r['quarter']),
    housePriceIndex: Number(r['house_price_index']),
    medianAnnualIncomeEur: Number(r['median_annual_income_eur']),
    rentIndex: Number(r['rent_index']),
  };
}
