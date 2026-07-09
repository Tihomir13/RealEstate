/**
 * PostgreSQL / Supabase repository. Activate with:
 *   DB_DRIVER=postgres DATABASE_URL=postgres://... npm run serve:ssr:imoti-tracker
 *
 * Schema is created automatically (same dialect-neutral DDL as SQLite) and
 * seeded on first run. `db/migrations/001_schema.postgres.sql` contains the
 * standalone migration for Supabase SQL editor / CI pipelines.
 */
import { Pool } from 'pg';
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

export class PostgresRepository implements PropertyRepository {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 5 });
  }

  async init(): Promise<void> {
    for (const stmt of SCHEMA_STATEMENTS) await this.pool.query(stmt);
    const res = await this.pool.query('SELECT COUNT(*)::int AS c FROM listings');
    if (res.rows[0].c === 0) await this.seed();
  }

  private async seed(): Promise<void> {
    const started = Date.now();
    const ds = new SeedListingSource().full();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const c of ds.cities) {
        await client.query(
          'INSERT INTO cities (id, slug, name, region, population) VALUES ($1,$2,$3,$4,$5)',
          [c.id, c.slug, c.name, c.region, c.population],
        );
      }
      for (const n of ds.neighborhoods) {
        await client.query(
          `INSERT INTO neighborhoods (id, city_id, name, price_multiplier, distance_from_center_km)
           VALUES ($1,$2,$3,$4,$5)`,
          [n.id, n.cityId, n.name, n.priceMultiplier, n.distanceFromCenterKm],
        );
      }

      // Batched multi-row inserts for the two large tables.
      await batchInsert(client, ds.listings, 500, (l) => [
        l.id, l.cityId, l.neighborhoodId, l.propertyType, l.construction, l.buildYear, l.floor,
        l.areaM2, l.priceEur, l.priceEurPerM2, l.listingType, l.isNew,
        l.firstSeenDate, l.lastSeenDate, l.currentStatus, l.originalPriceEur,
        l.predictedEurPerM2 ?? null,
      ], `INSERT INTO listings (
            id, city_id, neighborhood_id, property_type, construction, build_year, floor,
            area_m2, price_eur, price_eur_per_m2, listing_type, is_new,
            first_seen_date, last_seen_date, current_status, original_price_eur, predicted_eur_per_m2
          ) VALUES %VALUES%`, 17);

      await batchInsert(client, ds.snapshots, 1000, (s) => [
        s.listingId, s.month, s.priceEur, s.priceEurPerM2,
      ], `INSERT INTO listing_snapshots (listing_id, snapshot_month, price_eur, price_eur_per_m2)
          VALUES %VALUES%`, 4);

      for (const m of ds.macro) {
        await client.query(
          `INSERT INTO macro_quarters (region, quarter, house_price_index, median_annual_income_eur, rent_index)
           VALUES ($1,$2,$3,$4,$5)`,
          [m.region, m.quarter, m.housePriceIndex, m.medianAnnualIncomeEur, m.rentIndex],
        );
      }

      await client.query('COMMIT');
      console.log(`[db] seeded PostgreSQL in ${Date.now() - started}ms`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  private async all<T>(sql: string, map: (r: Record<string, unknown>) => T): Promise<T[]> {
    const res = await this.pool.query(sql);
    return res.rows.map(map);
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
    return this.all('SELECT * FROM listing_snapshots ORDER BY snapshot_month, listing_id', mapSnapshot);
  }
  loadMacro(): Promise<MacroQuarter[]> {
    return this.all('SELECT * FROM macro_quarters ORDER BY region, quarter', mapMacro);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

async function batchInsert<T>(
  client: { query: (sql: string, params: unknown[]) => Promise<unknown> },
  rows: T[],
  batchSize: number,
  toParams: (row: T) => unknown[],
  template: string,
  cols: number,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const params: unknown[] = [];
    const tuples = batch.map((row, r) => {
      params.push(...toParams(row));
      const ph = Array.from({ length: cols }, (_, c) => `$${r * cols + c + 1}`);
      return `(${ph.join(',')})`;
    });
    await client.query(template.replace('%VALUES%', tuples.join(',')), params);
  }
}
