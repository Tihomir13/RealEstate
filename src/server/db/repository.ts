/**
 * Persistence seam. The analytics engine reads ONLY through this interface,
 * so swapping SQLite ⇄ PostgreSQL (Supabase) is a configuration change.
 */
import {
  City,
  Listing,
  ListingSnapshot,
  MacroQuarter,
  Neighborhood,
} from '../../app/core/models/domain.models';

export interface PropertyRepository {
  /** Creates the schema if missing and seeds it when empty. */
  init(): Promise<void>;
  loadCities(): Promise<City[]>;
  loadNeighborhoods(): Promise<Neighborhood[]>;
  loadListings(): Promise<Listing[]>;
  loadSnapshots(): Promise<ListingSnapshot[]>;
  loadMacro(): Promise<MacroQuarter[]>;
  close(): Promise<void>;
}

/** Dialect-neutral DDL (works on SQLite and PostgreSQL). */
export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS cities (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    region TEXT NOT NULL,
    population INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS neighborhoods (
    id INTEGER PRIMARY KEY,
    city_id INTEGER NOT NULL REFERENCES cities(id),
    name TEXT NOT NULL,
    price_multiplier REAL NOT NULL,
    distance_from_center_km REAL NOT NULL
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
];

/* ---------- row mappers (snake_case DB → camelCase domain) ---------- */

export function mapCity(r: Record<string, unknown>): City {
  return {
    id: Number(r['id']),
    slug: String(r['slug']),
    name: String(r['name']),
    region: String(r['region']),
    population: Number(r['population']),
  };
}

export function mapNeighborhood(r: Record<string, unknown>): Neighborhood {
  return {
    id: Number(r['id']),
    cityId: Number(r['city_id']),
    name: String(r['name']),
    priceMultiplier: Number(r['price_multiplier']),
    distanceFromCenterKm: Number(r['distance_from_center_km']),
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

export function mapSnapshot(r: Record<string, unknown>): ListingSnapshot {
  return {
    listingId: Number(r['listing_id']),
    month: String(r['snapshot_month']),
    priceEur: Number(r['price_eur']),
    priceEurPerM2: Number(r['price_eur_per_m2']),
  };
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
