# ИмотиПулс (imoti-tracker)

Production-ready **Angular SSR** приложение за проследяване на цените на имоти в
България по град и квартал — market-intelligence dashboard (не marketplace).
UI на български, код на английски.

## Стартиране

Изисквания: **Node ≥ 22.13** (заради вградения `node:sqlite`).

```bash
npm install
npm run build
npm run serve:ssr:imoti-tracker     # → http://localhost:4000
```

При първо стартиране приложението създава `data/imoti.db` (SQLite) и го
seed-ва детерминистично (~12k обяви, ~34k месечни snapshots, 24 месеца
история, макро данни по региони). Нулево конфигуриране.

Dev режим: `npm start` (ng serve с SSR dev server). Тестове: `npm test`
(vitest, чистите статистически функции). Забележка: `node:sqlite` печата
`ExperimentalWarning` — безвредно; API-то е стабилно от Node 22.13+.

Env променливи: `PORT` (default 4000), `SQLITE_PATH`, `ALLOWED_HOSTS`
(comma-separated production домейни за SSR host guard).

## Превключване към PostgreSQL / Supabase

Слоят за данни е зад интерфейса `PropertyRepository`
(`src/server/db/repository.ts`) с две имплементации — SQLite (default) и
Postgres. Превключването е конфигурация:

```bash
DB_DRIVER=postgres DATABASE_URL=postgres://user:pass@host:5432/db \
  npm run serve:ssr:imoti-tracker
```

Схемата се създава и seed-ва автоматично при празна база. За managed
миграции: `db/migrations/001_schema.postgres.sql` (пусни го в Supabase SQL
editor). Никакъв друг код не се променя.

## Архитектура

```
src/
  app/core/models/domain.models.ts   типове, споделени клиент↔сървър
  app/core/stats/metrics.ts          чисти формули (unit-тествани)
  app/core/data/                     PropertyDataProvider (HTTP) + SSR interceptor
  app/features/                      6 страници (standalone, signals, @if/@for)
  app/shared/                        KPI карти, Δ-чипове, ECharts обвивки, pipes
  server/seed/                       детерминистичен генератор + scraper seam
  server/db/                         repository интерфейс + SQLite/Postgres
  server/analytics/                  AnalyticsEngine (всички Tier 1–3 метрики)
  server/api/router.ts               REST API (/api/…)
  server.ts                          Express + Angular SSR + избор на драйвер
```

Потокът: репозитори → AnalyticsEngine (in-memory индекси + кеш) → REST API →
Angular (SSR render + hydration с HTTP transfer cache, без повторни заявки в
браузъра). Графиките (ngx-echarts) се рендират само в браузъра.

### API

- `GET /api/meta` — градове, квартали, налични месеци
- `GET /api/overview?granularity=month|year`
- `GET /api/cities/:slug?granularity=…`
- `GET /api/compare?cities=sofia,varna&granularity=…` (до 4)
- `GET /api/listings?city=&neighborhoodId=&propertyType=&construction=&listingType=&status=&minPrice=&maxPrice=&minArea=&maxArea=&sort=&dir=&page=&pageSize=`

## Слоеве данни и фаза 2 (реален scraper)

Ingestion минава през `ExternalListingSource`
(`src/server/seed/listing-source.ts`):

- `SeedListingSource` — работещата имплементация (детерминистичен генератор,
  seeded RNG → идентични данни при всеки рестарт).
- `PortalListingSource` — фаза 2 stub, хвърля `NotImplemented`
  (`// TODO: phase 2 — real scraper`).

За да включиш реален събирач: имплементирай `fetchListings(citySlug, sinceIso)`
да връща `{ listings, snapshots }` по типовете от `domain.models.ts` и го
подай на repository seed/refresh стъпката вместо `SeedListingSource`. Никоя
статистика, API или UI код не зависи от източника.

Макро слоят (`MacroQuarter`) е NSI-стил тримесечни данни (HPI, медианен
годишен доход, индекс на наемите) по статистически региони — ползва се за
достъпност и индекса на прегряване.

## Методология

Всички формули са документирани на страница „Методология“ в приложението и
живеят като чисти функции в `src/app/core/stats/metrics.ts`: медиани €/м²,
MoM/YoY, брутна доходност, дял намалени обяви, months-of-supply, DOM,
достъпност (цена ÷ доход), хедоничен модел (ridge OLS в log-пространство),
индекс на прегряване 0–100, ценова инерция (2-ра производна), градиент
цена–разстояние от центъра.
