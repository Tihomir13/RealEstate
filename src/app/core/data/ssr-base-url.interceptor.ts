import { HttpInterceptorFn } from '@angular/common/http';
import { inject, PLATFORM_ID, REQUEST } from '@angular/core';
import { isPlatformServer } from '@angular/common';

/**
 * During the SSR render pass, relative `/api/...` URLs have no origin.
 * The API is served by the same Express process, so we prefix the origin the
 * current request actually came in on (works for both `ng serve`'s dev port
 * and the production PORT — hardcoding PORT here broke `ng serve`, whose real
 * listening port differs from the production default).
 */
export const ssrBaseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  const platformId = inject(PLATFORM_ID);
  if (isPlatformServer(platformId) && req.url.startsWith('/')) {
    const incoming = inject(REQUEST, { optional: true });
    const origin = incoming
      ? new URL(incoming.url).origin
      : `http://localhost:${process.env['PORT'] || 4000}`;
    return next(req.clone({ url: `${origin}${req.url}` }));
  }
  return next(req);
};
