import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, PLATFORM_ID } from '@angular/core';
import { NeighborhoodStats } from '../core/models/domain.models';
import { fmtEurPerM2, fmtPct } from '../core/i18n/labels';
import { ThemeService } from '../core/services/theme.service';

interface MapPoint {
  neighborhoodId: number;
  name: string;
  x: number;
  y: number;
  r: number;
  opacity: number;
  label: string;
}

const SIZE = 300;
const PAD = SIZE * 0.16;

/** Stylized bubble map of a city's neighborhoods, positioned by real lat/lng (no basemap tiles). */
@Component({
  selector: 'app-neighborhood-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isBrowser) {
      <svg [attr.viewBox]="viewBox" class="nbhd-map" role="img" [attr.aria-label]="ariaLabel()">
        @for (p of points(); track p.neighborhoodId) {
          <circle
            [attr.cx]="p.x"
            [attr.cy]="p.y"
            [attr.r]="p.r"
            [attr.fill]="color"
            [attr.fill-opacity]="p.opacity"
            [attr.stroke]="color"
            stroke-opacity="0.9"
          >
            <title>{{ p.name }} — {{ p.label }}</title>
          </circle>
          <text [attr.x]="p.x" [attr.y]="p.y + p.r + 11" text-anchor="middle">{{ p.name }}</text>
        }
      </svg>
    } @else {
      <div class="chart ssr-placeholder" [style.height.px]="height()"></div>
    }
  `,
  styles: `
    .nbhd-map { width: 100%; height: auto; display: block; }
    .nbhd-map text {
      font-size: 8px;
      font-family: 'Sofia Sans', sans-serif;
      fill: var(--muted);
    }
    .ssr-placeholder {
      width: 100%;
      background: repeating-linear-gradient(-45deg, var(--surface-2), var(--surface-2) 6px, transparent 6px, transparent 14px);
      border-radius: var(--radius);
      opacity: 0.4;
    }
  `,
})
export class NeighborhoodMapComponent {
  private readonly theme = inject(ThemeService);
  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly viewBox = `0 0 ${SIZE} ${SIZE}`;

  data = input.required<NeighborhoodStats[]>();
  /** Which value drives bubble size/opacity. */
  metric = input<'price' | 'yoy'>('price');
  height = input<number>(320);
  ariaLabel = input<string>('Карта на кварталите');

  get color(): string {
    return this.theme.theme() === 'dark' ? '#3FB8AE' : '#0F8B84';
  }

  points = computed<MapPoint[]>(() => {
    const rows = this.data();
    if (!rows.length) return [];

    const latRad = (average(rows.map((n) => n.lat)) * Math.PI) / 180;
    const cosLat = Math.cos(latRad) || 1;
    const projected = rows.map((n) => ({ x: n.lng * cosLat, y: -n.lat }));

    const xs = projected.map((p) => p.x);
    const ys = projected.map((p) => p.y);
    const spanX = Math.max(...xs) - Math.min(...xs) || 1e-6;
    const spanY = Math.max(...ys) - Math.min(...ys) || 1e-6;
    const scale = (SIZE - 2 * PAD) / Math.max(spanX, spanY);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);

    const metric = this.metric();
    const values = rows.map((n) => (metric === 'yoy' ? (n.yoyPct ?? 0) : n.medianSaleEurPerM2));
    const minV = Math.min(...values);
    const maxV = Math.max(...values);

    return rows.map((n, i) => {
      const t = maxV === minV ? 0.5 : (values[i] - minV) / (maxV - minV);
      return {
        neighborhoodId: n.neighborhoodId,
        name: n.name,
        x: PAD + (projected[i].x - minX) * scale,
        y: PAD + (projected[i].y - minY) * scale,
        r: 9 + t * 20,
        opacity: 0.3 + t * 0.55,
        label: metric === 'yoy' ? fmtPct(n.yoyPct) : fmtEurPerM2(n.medianSaleEurPerM2),
      };
    });
  });
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
