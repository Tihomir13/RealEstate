/**
 * Phase-2 scraper seam.
 *
 * The application NEVER depends on a real scraper being present. All ingestion
 * goes through `ExternalListingSource`; today the only working implementation
 * is `SeedListingSource` (deterministic generator). A real portal scraper
 * plugs in later by implementing the same interface.
 */
import { Listing, ListingSnapshot } from '../../app/core/models/domain.models';
import { applyHedonicPredictions, generateSeedDataset, SeedDataset } from './seed-generator';

export interface ExternalListingBatch {
  listings: Listing[];
  snapshots: ListingSnapshot[];
}

export interface ExternalListingSource {
  /** Human-readable source id, stored for provenance. */
  readonly sourceId: string;
  /** Fetch listings for a city (slug) that changed since the given ISO date. */
  fetchListings(citySlug: string, sinceIso: string): Promise<ExternalListingBatch>;
}

/** Active implementation: deterministic seed generator. */
export class SeedListingSource implements ExternalListingSource {
  readonly sourceId = 'seed';
  private dataset: SeedDataset | null = null;

  private ensure(): SeedDataset {
    if (!this.dataset) {
      this.dataset = generateSeedDataset();
      applyHedonicPredictions(this.dataset);
    }
    return this.dataset;
  }

  full(): SeedDataset {
    return this.ensure();
  }

  async fetchListings(citySlug: string, sinceIso: string): Promise<ExternalListingBatch> {
    const ds = this.ensure();
    const city = ds.cities.find((c) => c.slug === citySlug);
    if (!city) return { listings: [], snapshots: [] };
    const listings = ds.listings.filter(
      (l) => l.cityId === city.id && l.lastSeenDate >= sinceIso,
    );
    const ids = new Set(listings.map((l) => l.id));
    return {
      listings,
      snapshots: ds.snapshots.filter((s) => ids.has(s.listingId)),
    };
  }
}

/**
 * Phase-2 placeholder for a real portal scraper.
 * // TODO: phase 2 — real scraper (imot.bg / imoti.net adapters go here).
 */
export class PortalListingSource implements ExternalListingSource {
  readonly sourceId = 'portal';

  fetchListings(): Promise<ExternalListingBatch> {
    throw new Error('NotImplemented: PortalListingSource is a phase-2 feature.');
  }
}
