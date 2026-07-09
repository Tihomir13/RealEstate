/**
 * Default repository: SQLite via Node's built-in `node:sqlite` module
 * (Node ≥ 22.13 — no native compilation, no external binaries).
 *
 * The database file is created and seeded deterministically on first boot.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SeedListingSource } from '../seed/listing-source';
import {
  mapCity,
  mapListing,
  mapMacro,
  mapNeighborhood,
  mapSnapshot,
  PropertyRepository,
  SCHEMA_STATEMENTS,
} from './repository';
import {
  City,
  Listing,
  ListingSnapshot,
  MacroQuarter,
  Neighborhood,
} from '../../app/core/models/domain.models';

export class SqliteRepository implements PropertyRepository {
  private db!: DatabaseSync;

  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    mkdirSync(dirname(this.filePath), { recursive: true });
    this.db = new DatabaseSync(this.filePath);
    this.db.exec('PRAGMA journal_mode = WAL');
    for (const stmt of SCHEMA_STATEMENTS) this.db.exec(stmt);

    const row = this.db.prepare('SELECT COUNT(*) AS c FROM listings').get() as { c: number };
    if (Number(row.c) === 0) this.seed();
  }

  private seed(): void {
    const started = Date.now();
    const ds = new SeedListingSource().full();
    this.db.exec('BEGIN');
    try {
      const insCity = this.db.prepare(
        'INSERT INTO cities (id, slug, name, region, population) VALUES (?,?,?,?,?)',
      );
      for (const c of ds.cities) insCity.run(c.id, c.slug, c.name, c.region, c.population);

      const insNbhd = this.db.prepare(
        `INSERT INTO neighborhoods (id, city_id, name, price_multiplier, distance_from_center_km)
         VALUES (?,?,?,?,?)`,
      );
      for (const n of ds.neighborhoods) {
        insNbhd.run(n.id, n.cityId, n.name, n.priceMultiplier, n.distanceFromCenterKm);
      }

      const insListing = this.db.prepare(
        `INSERT INTO listings (
           id, city_id, neighborhood_id, property_type, construction, build_year, floor,
           area_m2, price_eur, price_eur_per_m2, listing_type, is_new,
           first_seen_date, last_seen_date, current_status, original_price_eur, predicted_eur_per_m2
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      );
      for (const l of ds.listings) {
        insListing.run(
          l.id, l.cityId, l.neighborhoodId, l.propertyType, l.construction, l.buildYear,
          l.floor, l.areaM2, l.priceEur, l.priceEurPerM2, l.listingType, l.isNew ? 1 : 0,
          l.firstSeenDate, l.lastSeenDate, l.currentStatus, l.originalPriceEur,
          l.predictedEurPerM2 ?? null,
        );
      }

      const insSnap = this.db.prepare(
        `INSERT INTO listing_snapshots (listing_id, snapshot_month, price_eur, price_eur_per_m2)
         VALUES (?,?,?,?)`,
      );
      for (const s of ds.snapshots) insSnap.run(s.listingId, s.month, s.priceEur, s.priceEurPerM2);

      const insMacro = this.db.prepare(
        `INSERT INTO macro_quarters (region, quarter, house_price_index, median_annual_income_eur, rent_index)
         VALUES (?,?,?,?,?)`,
      );
      for (const m of ds.macro) {
        insMacro.run(m.region, m.quarter, m.housePriceIndex, m.medianAnnualIncomeEur, m.rentIndex);
      }

      this.db.exec('COMMIT');
      console.log(
        `[db] seeded SQLite: ${ds.listings.length} listings, ${ds.snapshots.length} snapshots in ${Date.now() - started}ms`,
      );
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  private all<T>(sql: string, map: (r: Record<string, unknown>) => T): Promise<T[]> {
    const rows = this.db.prepare(sql).all() as Record<string, unknown>[];
    return Promise.resolve(rows.map(map));
  }

  loadCities(): Promise<City[]> {
    return this.all('SELECT * FROM cities ORDER BY id', mapCity);
  }
  loadNeighborhoods(): Promise<Neighborhood[]> {
    return this.all('SELECT * FROM neighborhoods ORDER BY id', mapNeighborhood);
  }
  loadListings(): Promise<Listing[]> {
    return this.all('SELECT * FROM listings ORDER BY id', mapListing);
  }
  loadSnapshots(): Promise<ListingSnapshot[]> {
    return this.all(
      'SELECT * FROM listing_snapshots ORDER BY snapshot_month, listing_id',
      mapSnapshot,
    );
  }
  loadMacro(): Promise<MacroQuarter[]> {
    return this.all('SELECT * FROM macro_quarters ORDER BY region, quarter', mapMacro);
  }

  async close(): Promise<void> {
    this.db?.close();
  }
}
