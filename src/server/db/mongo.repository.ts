/**
 * MongoDB / Atlas repository. Activate with:
 *   DB_DRIVER=mongodb MONGODB_URI=mongodb+srv://... npm run serve:ssr:imoti-tracker
 *
 * Documents are stored as camelCase domain objects (no snake_case mapping),
 * so reads with `{ _id: 0 }` projection return the domain types directly.
 * Collections are created implicitly and seeded on first run.
 */
import { Collection, Db, Document, MongoClient, Sort } from 'mongodb';
import { SeedListingSource } from '../seed/listing-source';
import { PropertyRepository } from './repository';
import {
  City,
  Listing,
  ListingSnapshot,
  MacroQuarter,
  Neighborhood,
} from '../../app/core/models/domain.models';

export class MongoRepository implements PropertyRepository {
  private readonly client: MongoClient;
  private readonly dbName: string;
  private db!: Db;

  constructor(uri: string, dbName = process.env['MONGODB_DB'] ?? 'imoti') {
    this.client = new MongoClient(uri);
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
      this.db.collection('listing_snapshots').createIndex({ month: 1 }),
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
    await insertBatched(this.db.collection('listing_snapshots'), ds.snapshots, 5000);
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
  loadListings(): Promise<Listing[]> {
    return this.load<Listing>('listings', { id: 1 });
  }
  loadSnapshots(): Promise<ListingSnapshot[]> {
    return this.load<ListingSnapshot>('listing_snapshots', { month: 1, listingId: 1 });
  }
  loadMacro(): Promise<MacroQuarter[]> {
    return this.load<MacroQuarter>('macro_quarters', { region: 1, quarter: 1 });
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
