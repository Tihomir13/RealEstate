import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { AnalyticsEngine } from './server/analytics/analytics-engine';
import { createApiRouter } from './server/api/router';
import { MongoRepository } from './server/db/mongo.repository';
import { PostgresRepository } from './server/db/postgres.repository';
import { PropertyRepository } from './server/db/repository';
import { SqliteRepository } from './server/db/sqlite.repository';

// Local config: `.env` in the project root (gitignored) — see `.env.example`.
try {
  process.loadEnvFile();
} catch {
  /* no .env file — env vars come from the shell */
}

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
/**
 * SSRF guard: hosts the SSR engine will accept. Localhost covers local runs;
 * add the production domain via ALLOWED_HOSTS (comma-separated).
 */
const allowedHosts = [
  'localhost',
  '127.0.0.1',
  ...(process.env['ALLOWED_HOSTS']?.split(',').map((h) => h.trim()) ?? []),
];
const angularApp = new AngularNodeAppEngine({ allowedHosts });

/**
 * Data layer selection — swap SQLite ⇄ PostgreSQL (Supabase) ⇄ MongoDB (Atlas) via env:
 *   DB_DRIVER=postgres DATABASE_URL=postgres://...
 *   DB_DRIVER=mongodb  MONGODB_URI=mongodb+srv://...   (defaults to SQLite)
 */
function createRepository(): PropertyRepository {
  if (process.env['DB_DRIVER'] === 'mongodb') {
    const uri = process.env['MONGODB_URI'] || process.env['DATABASE_URL'];
    if (uri) {
      console.log('[db] using MongoDB');
      return new MongoRepository(uri);
    }
    // Keeps `npm start` / builds working before the Atlas link is pasted into .env.
    console.warn('[db] DB_DRIVER=mongodb but MONGODB_URI is empty — falling back to SQLite');
  }
  if (process.env['DB_DRIVER'] === 'postgres') {
    const url = process.env['DATABASE_URL'];
    if (!url) throw new Error('DB_DRIVER=postgres requires DATABASE_URL');
    console.log('[db] using PostgreSQL');
    return new PostgresRepository(url);
  }
  const file = process.env['SQLITE_PATH'] ?? join(process.cwd(), 'data', 'imoti.db');
  console.log(`[db] using SQLite at ${file}`);
  return new SqliteRepository(file);
}

const engine = new AnalyticsEngine(createRepository());
const ready = engine.init().catch((err) => {
  console.error('[db] initialization failed', err);
  process.exit(1);
});
ready.then(() => {
  const mem = process.memoryUsage();
  console.log(`[memory] rss=${Math.round(mem.rss / 1024 / 1024)}MB heapUsed=${Math.round(mem.heapUsed / 1024 / 1024)}MB heapTotal=${Math.round(mem.heapTotal / 1024 / 1024)}MB`);
});

app.use('/api', async (req, res, next) => {
  await ready;
  next();
});
app.use('/api', createApiRouter(engine));

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use(async (req, res, next) => {
  await ready; // SSR components call /api during render
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
