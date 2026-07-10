# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ИмотиПулс (imoti-tracker): an Angular SSR market-intelligence dashboard tracking
Bulgarian real-estate prices by city/neighborhood. It is a read-only analytics
dashboard, not a listings marketplace. UI text and content is Bulgarian; all
code (identifiers, comments) is English.

Node ≥ 22.13 is required (uses the built-in `node:sqlite` module).

## Commands

```bash
npm install
npm start                            # ng serve, dev mode with SSR dev server
npm run build                        # production build (browser + server bundles)
npm run serve:ssr:imoti-tracker      # run the built SSR server → http://localhost:4000
npm test                             # vitest — pure stats functions in core/stats
```

There is no lint script configured. Run a single test file/case via vitest
directly, e.g. `npx vitest run src/app/core/stats/metrics.spec.ts -t "median"`.

On first run the app creates `data/imoti.db` (SQLite) and deterministically
seeds it (~12k listings, ~34k monthly snapshots, 24 months of history, macro
data by region) — zero manual setup. The `node:sqlite` `ExperimentalWarning`
on startup is expected/harmless.

Env vars: `PORT` (default 4000), `SQLITE_PATH`, `ALLOWED_HOSTS`
(comma-separated production domains for the SSR host guard), `DB_DRIVER` /
`DATABASE_URL` / `MONGODB_URI` / `MONGODB_DB` (see below). `src/server.ts`
loads a root `.env` file (gitignored, see `.env.example`) via Node's built-in
`process.loadEnvFile()`; shell env vars take precedence over `.env` entries.

## Architecture

Data flow: **repository → AnalyticsEngine (in-memory indexes + cache) → REST
API → Angular (SSR render + hydration via HTTP transfer cache)**. Charts
(ngx-echarts) render browser-only.

```
src/app/core/models/domain.models.ts   types shared client↔server (single source of truth)
src/app/core/stats/metrics.ts          pure statistical formulas, unit-tested
src/app/core/data/                     PropertyDataProvider (HTTP client) + SSR base-url interceptor
src/app/features/                      6 standalone pages (signals, @if/@for, OnPush)
src/app/shared/                        KPI cards, delta chips, ECharts wrappers, format pipes
src/server/seed/                       deterministic data generator + scraper seam
src/server/db/                         PropertyRepository interface + SQLite/Postgres/Mongo impls
src/server/analytics/                  AnalyticsEngine — all Tier 1-3 metrics
src/server/api/router.ts               REST API (/api/...)
src/server.ts                          Express + Angular SSR + driver selection
```

### Persistence seam

`PropertyRepository` (`src/server/db/repository.ts`) is the only interface the
analytics engine reads through. `SCHEMA_STATEMENTS` there is dialect-neutral
DDL shared by both SQLite and Postgres. Swapping backends is a config change,
not a code change:

```bash
DB_DRIVER=postgres DATABASE_URL=postgres://user:pass@host:5432/db \
  npm run serve:ssr:imoti-tracker
DB_DRIVER=mongodb MONGODB_URI=mongodb+srv://user:pass@cluster/ \
  npm run serve:ssr:imoti-tracker   # optional MONGODB_DB, default "imoti"
```

Schema is created and seeded automatically on an empty database. For managed
migrations use `db/migrations/001_schema.postgres.sql` (run in the Supabase
SQL editor). Row mappers in `repository.ts` translate snake_case DB columns to
camelCase domain types — keep that convention when adding fields. The MongoDB
implementation (`mongo.repository.ts`) skips the mappers: it stores camelCase
domain documents natively and reads them back with an `{ _id: 0 }` projection.
If `DB_DRIVER=mongodb` but `MONGODB_URI` is empty (fresh `.env`), the server
warns and falls back to SQLite so builds and first runs still work.

The repository is **scoped, not "load everything"**: besides the small tables
(`loadCities`/`loadNeighborhoods`/`loadMacro`/`loadMonths`), it exposes
`snapshotsForCity`/`snapshotsForMonth`/`removedSaleListings`/`listingsMatching`
— each answers one city, one month, or one WHERE-filtered page. `listing_snapshots`
carries a handful of columns denormalized from the parent listing (`city_id`,
`neighborhood_id`, `property_type`, `construction`, `build_year`,
`listing_type`, `original_price_eur`) precisely so these scoped queries never
need a join. This keeps the DB responsible for filtering while `metrics.ts`'s
pure functions do the math on the resulting small set — deliberately *not*
reimplemented as SQL/Mongo aggregations, since that would fork business logic
per driver. **Changing the snapshot schema requires recreating the database**
(delete `data/imoti.db`, drop the Postgres tables, drop the Mongo collections)
since `init()` only auto-seeds when `listings` is empty.

### Ingestion seam

`ExternalListingSource` (`src/server/seed/listing-source.ts`) has two
implementations: `SeedListingSource` (the working one — seeded RNG produces
identical data on every restart) and `PortalListingSource` (a phase-2 stub
that throws `NotImplemented`, marked `// TODO: phase 2 — real scraper`). To
wire in a real scraper, implement `fetchListings(citySlug, sinceIso)` returning
`{ listings, snapshots }` typed per `domain.models.ts`, and pass it to the
repository's seed/refresh step in place of `SeedListingSource`. No stats, API,
or UI code depends on the data source.

`MacroQuarter` data (NSI-style quarterly HPI, median income, rent index by
statistical region) feeds affordability and the overheating index.

### Analytics / methodology

All formulas are pure functions in `src/app/core/stats/metrics.ts` (unit
tested in `metrics.spec.ts`) and are also documented for end users on the
in-app "Методология" page. This includes: median €/m², MoM/YoY, gross rental
yield, price-cut share, months-of-supply, DOM, affordability (price ÷ income),
a hedonic model (ridge OLS in log space, powering `predictedEurPerM2` /
overpriced%), a 0-100 overheating index, price momentum (2nd derivative), and
the price-vs-distance-from-center gradient. `AnalyticsEngine`
(`src/server/analytics/analytics-engine.ts`) keeps only small tables resident
(cities, neighborhoods, macro, months, removed-sale listings); a city's or
month's snapshot rows are fetched from the repository lazily on cache miss,
reduced to a payload (~50KB) by the pure functions, and cached indefinitely —
the raw rows fall out of scope afterward. Cache keys are a finite,
enumerable set (`meta`, `global-monthly-series`, 2 overviews, 3 entries per
city), so there's no eviction logic. When adding a metric, compute it once
per cache entry rather than per-request, and prefer extending the existing
per-city/per-month fetch over adding a new "load everything" query.

### API (`src/server/api/router.ts`)

- `GET /api/meta` — cities, neighborhoods, available months
- `GET /api/overview?granularity=month|year`
- `GET /api/cities/:slug?granularity=…`
- `GET /api/compare?cities=sofia,varna&granularity=…` (max 4)
- `GET /api/listings?city=&neighborhoodId=&propertyType=&construction=&listingType=&status=&minPrice=&maxPrice=&minArea=&maxArea=&sort=&dir=&page=&pageSize=`

### Frontend conventions

Standalone components only, `ChangeDetectionStrategy.OnPush`, signals +
`toSignal()` over the `PropertyDataProvider` observables (no NgModules, no
manual subscriptions). `PropertyDataProvider`
(`src/app/core/data/property-data.provider.ts`) is the single place the UI
reads data from — always via `/api/...`, never a direct repository/engine
call from the client. During SSR, `ssrBaseUrlInterceptor` rewrites relative
`/api/...` URLs to `http://localhost:$PORT/...` since the server-rendered
`HttpClient` has no browser origin — remember this when the API is called
from a page's constructor/field initializer (which runs during SSR).
