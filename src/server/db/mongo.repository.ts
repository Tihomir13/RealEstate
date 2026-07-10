/**
 * MongoDB / Atlas repository. Activate with:
 *   DB_DRIVER=mongodb MONGODB_URI=mongodb+srv://... npm run serve:ssr:imoti-tracker
 *
 * Documents are stored as camelCase domain objects (no snake_case mapping),
 * so reads with `{ _id: 0 }` projection return the domain types directly.
 * Snapshot documents carry a handful of denormalized listing fields (cityId,
 * neighborhoodId, propertyType, construction, buildYear, listingType,
 * originalPriceEur) so per-city/per-month queries never need a `$lookup`
 * join — same reasoning as the SQL repos' denormalized columns.
 * Collections are created implicitly and seeded on first run.
 */
import { Collection, Db, Document, Filter, MongoClient, Sort } from 'mongodb';
import { SeedListingSource } from '../seed/listing-source';
import { DenormSnapshot, ListingsQuery, PropertyRepository, RemovedListing } from './repository';
import { City, Listing, MacroQuarter, Neighborhood } from '../../app/core/models/domain.models';

export class MongoRepository implements PropertyRepository {
  private readonly client: MongoClient;
  private readonly dbName: string;
  private db!: Db;

  constructor(uri: string, dbName = process.env['MONGODB_DB'] ?? 'imoti') {
    // Default pool (100) is normally plenty, but the analytics engine fans out
    // ~50 concurrent per-city/per-month queries the first time `overview()`
    // computes — headroom here avoids queuing behind the driver's own pool cap.
    this.client = new MongoClient(uri, { maxPoolSize: 100 });
    this.dbName = dbName;
  }

  async init(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db(this.dbName);
    await this.ensureIndexes();
    const count = await this.db.collection('listings').countDocuments();
    if (count === 0) await this.seed();
  }

  private async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.db.collection('cities').createIndex({ slug: 1 }, { unique: true }),
      this.db.collection('listings').createIndex({ cityId: 1 }),
      this.db.collection('listings').createIndex({ currentStatus: 1, listingType: 1 }),
      this.db.collection('listing_snapshots').createIndex({ month: 1 }),
      this.db.collection('listing_snapshots').createIndex({ cityId: 1, month: 1 }),
      this.db
        .collection('listing_snapshots')
        .createIndex({ listingId: 1, month: 1 }, { unique: true }),
      this.db
        .collection('macro_quarters')
        .createIndex({ region: 1, quarter: 1 }, { unique: true }),
    ]);
  }

  private async seed(): Promise<void> {
    const started = Date.now();
    const ds = new SeedListingSource().full();
    // Clear partial leftovers from an interrupted seed, then insert with the
    // large `listings` collection last — the count guard in init() stays 0
    // until the seed has fully succeeded, so a crashed seed retries cleanly.
    const names = ['cities', 'neighborhoods', 'listing_snapshots', 'macro_quarters', 'listings'];
    for (const name of names) await this.db.collection(name).deleteMany({});
    await insertBatched(this.db.collection('cities'), ds.cities, 1000);
    await insertBatched(this.db.collection('neighborhoods'), ds.neighborhoods, 1000);

    const listingById = new Map(ds.listings.map((l) => [l.id, l]));
    const denormSnapshots: DenormSnapshot[] = ds.snapshots.map((s) => {
      const l = listingById.get(s.listingId)!;
      return {
        listingId: s.listingId,
        month: s.month,
        priceEur: s.priceEur,
        priceEurPerM2: s.priceEurPerM2,
        cityId: l.cityId,
        neighborhoodId: l.neighborhoodId,
        propertyType: l.propertyType,
        construction: l.construction,
        buildYear: l.buildYear,
        listingType: l.listingType,
        originalPriceEur: l.originalPriceEur,
      };
    });
    await insertBatched(this.db.collection('listing_snapshots'), denormSnapshots, 5000);
    await insertBatched(this.db.collection('macro_quarters'), ds.macro, 1000);
    await insertBatched(this.db.collection('listings'), ds.listings, 1000);
    console.log(`[db] seeded MongoDB in ${Date.now() - started}ms`);
  }

  /** Same sort orders as the SQL repositories' ORDER BY clauses. */
  private load<T>(coll: string, sort: Sort): Promise<T[]> {
    return this.db
      .collection(coll)
      .find({}, { projection: { _id: 0 } })
      .sort(sort)
      .toArray() as Promise<T[]>;
  }

  loadCities(): Promise<City[]> {
    return this.load<City>('cities', { id: 1 });
  }
  loadNeighborhoods(): Promise<Neighborhood[]> {
    return this.load<Neighborhood>('neighborhoods', { id: 1 });
  }
  loadMacro(): Promise<MacroQuarter[]> {
    return this.load<MacroQuarter>('macro_quarters', { region: 1, quarter: 1 });
  }

  async loadMonths(): Promise<string[]> {
    const months = await this.db.collection('listing_snapshots').distinct('month');
    return (months as string[]).sort();
  }

  snapshotsForCity(cityId: number): Promise<DenormSnapshot[]> {
    return this.db
      .collection('listing_snapshots')
      .find({ cityId }, { projection: { _id: 0 } })
      .sort({ month: 1 })
      .toArray() as unknown as Promise<DenormSnapshot[]>;
  }

  snapshotsForMonth(month: string): Promise<DenormSnapshot[]> {
    return this.db
      .collection('listing_snapshots')
      .find({ month }, { projection: { _id: 0 } })
      .toArray() as unknown as Promise<DenormSnapshot[]>;
  }

  removedSaleListings(): Promise<RemovedListing[]> {
    return this.db
      .collection('listings')
      .find(
        { currentStatus: 'removed', listingType: 'sale' },
        { projection: { _id: 0, id: 1, cityId: 1, firstSeenDate: 1, lastSeenDate: 1 } },
      )
      .toArray() as unknown as Promise<RemovedListing[]>;
  }

  listingsMatching(query: ListingsQuery): Promise<Listing[]> {
    // Truthy checks (not `!= null`) mirror the original in-memory filter's
    // `if (filter.x && ...)` semantics exactly, including the `0`-is-ignored quirk.
    const filter: Filter<Document> = {};
    if (query.cityId != null) filter['cityId'] = query.cityId;
    if (query.neighborhoodId) filter['neighborhoodId'] = query.neighborhoodId;
    if (query.propertyType) filter['propertyType'] = query.propertyType;
    if (query.construction) filter['construction'] = query.construction;
    if (query.listingType) filter['listingType'] = query.listingType;
    if (query.status) filter['currentStatus'] = query.status;
    else filter['currentStatus'] = { $ne: 'removed' }; // default: active market
    if (query.minPrice || query.maxPrice) {
      filter['priceEur'] = {
        ...(query.minPrice ? { $gte: query.minPrice } : {}),
        ...(query.maxPrice ? { $lte: query.maxPrice } : {}),
      };
    }
    if (query.minArea || query.maxArea) {
      filter['areaM2'] = {
        ...(query.minArea ? { $gte: query.minArea } : {}),
        ...(query.maxArea ? { $lte: query.maxArea } : {}),
      };
    }
    return this.db
      .collection('listings')
      .find(filter, { projection: { _id: 0 } })
      .sort({ id: 1 })
      .toArray() as unknown as Promise<Listing[]>;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

/** insertMany in chunks; copies each doc because the driver mutates inputs with `_id`. */
async function insertBatched<T extends Document>(
  coll: Collection,
  docs: readonly T[],
  batchSize: number,
): Promise<void> {
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize).map((d) => ({ ...d }));
    await coll.insertMany(batch, { ordered: true });
  }
}
