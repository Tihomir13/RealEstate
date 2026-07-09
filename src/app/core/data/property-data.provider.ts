/**
 * Client-side `PropertyDataProvider`: the single place the UI reads data from.
 * Everything goes through the REST API (which in turn reads through the
 * repository seam on the server).
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import {
  CityDetail,
  Granularity,
  ListingsFilter,
  ListingsPage,
  MetaInfo,
  NationalOverview,
} from '../models/domain.models';

@Injectable({ providedIn: 'root' })
export class PropertyDataProvider {
  private readonly http = inject(HttpClient);
  private readonly meta$ = this.http.get<MetaInfo>('/api/meta').pipe(shareReplay(1));

  meta(): Observable<MetaInfo> {
    return this.meta$;
  }

  overview(granularity: Granularity): Observable<NationalOverview> {
    return this.http.get<NationalOverview>('/api/overview', { params: { granularity } });
  }

  cityDetail(slug: string, granularity: Granularity): Observable<CityDetail> {
    return this.http.get<CityDetail>(`/api/cities/${slug}`, { params: { granularity } });
  }

  compare(slugs: string[], granularity: Granularity): Observable<CityDetail[]> {
    return this.http.get<CityDetail[]>('/api/compare', {
      params: { cities: slugs.join(','), granularity },
    });
  }

  listings(filter: ListingsFilter): Observable<ListingsPage> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filter)) {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    }
    return this.http.get<ListingsPage>('/api/listings', { params });
  }
}
