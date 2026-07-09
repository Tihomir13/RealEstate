import { HttpInterceptorFn } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformServer } from '@angular/common';

/**
 * During the SSR render pass, relative `/api/...` URLs have no origin.
 * The API is served by the same Express process, so we prefix localhost:PORT.
 */
export const ssrBaseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  const platformId = inject(PLATFORM_ID);
  if (isPlatformServer(platformId) && req.url.startsWith('/')) {
    const port = process.env['PORT'] || 4000;
    return next(req.clone({ url: `http://localhost:${port}${req.url}` }));
  }
  return next(req);
};
