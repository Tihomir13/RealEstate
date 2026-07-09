-- ИмотиПулс / imoti-tracker — PostgreSQL (Supabase) schema
-- Apply via Supabase SQL editor or: psql "$DATABASE_URL" -f db/migrations/001_schema.postgres.sql
-- Note: the app also creates this schema automatically on first boot when
-- DB_DRIVER=postgres; this file exists for CI pipelines / managed migrations.

CREATE TABLE IF NOT EXISTS cities (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  population INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS neighborhoods (
  id INTEGER PRIMARY KEY,
  city_id INTEGER NOT NULL REFERENCES cities(id),
  name TEXT NOT NULL,
  price_multiplier REAL NOT NULL,
  distance_from_center_km REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS listings (
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
);

CREATE TABLE IF NOT EXISTS listing_snapshots (
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  snapshot_month TEXT NOT NULL,
  price_eur REAL NOT NULL,
  price_eur_per_m2 REAL NOT NULL,
  PRIMARY KEY (listing_id, snapshot_month)
);

CREATE TABLE IF NOT EXISTS macro_quarters (
  region TEXT NOT NULL,
  quarter TEXT NOT NULL,
  house_price_index REAL NOT NULL,
  median_annual_income_eur REAL NOT NULL,
  rent_index REAL NOT NULL,
  PRIMARY KEY (region, quarter)
);

CREATE INDEX IF NOT EXISTS idx_listings_city ON listings(city_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_month ON listing_snapshots(snapshot_month);
