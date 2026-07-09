/**
 * REST API consumed by the Angular client (browser + SSR render pass).
 * The engine caches every payload, so responses are O(1) after warm-up.
 */
import { Router } from 'express';
import { Granularity, ListingsFilter } from '../../app/core/models/domain.models';
import { AnalyticsEngine } from '../analytics/analytics-engine';

export function createApiRouter(engine: AnalyticsEngine): Router {
  const router = Router();

  const granularityOf = (q: unknown): Granularity => (q === 'year' ? 'year' : 'month');

  router.get('/meta', (_req, res) => {
    res.json(engine.meta());
  });

  router.get('/overview', (req, res) => {
    res.json(engine.overview(granularityOf(req.query['granularity'])));
  });

  router.get('/cities/:slug', (req, res) => {
    const detail = engine.cityDetail(req.params['slug'], granularityOf(req.query['granularity']));
    if (!detail) {
      res.status(404).json({ error: 'city-not-found' });
      return;
    }
    res.json(detail);
  });

  router.get('/compare', (req, res) => {
    const slugs = String(req.query['cities'] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4);
    res.json(engine.compare(slugs, granularityOf(req.query['granularity'])));
  });

  router.get('/listings', (req, res) => {
    const q = req.query;
    const num = (v: unknown) => (v == null || v === '' ? undefined : Number(v));
    const str = <T extends string>(v: unknown) => (v ? (String(v) as T) : undefined);
    const filter: ListingsFilter = {
      city: str(q['city']),
      neighborhoodId: num(q['neighborhoodId']),
      propertyType: str(q['propertyType']),
      construction: str(q['construction']),
      listingType: str(q['listingType']),
      status: str(q['status']),
      minPrice: num(q['minPrice']),
      maxPrice: num(q['maxPrice']),
      minArea: num(q['minArea']),
      maxArea: num(q['maxArea']),
      sort: str(q['sort']),
      dir: str(q['dir']),
      page: num(q['page']),
      pageSize: num(q['pageSize']),
    };
    res.json(engine.listingsPage(filter));
  });

  return router;
}
