import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { PropertyDataProvider } from '../../core/data/property-data.provider';
import { CitySummary } from '../../core/models/domain.models';
import { SparklineComponent } from '../../shared/charts.components';
import { Bg2Pipe, BgIntPipe, EurM2Pipe, PctPipe } from '../../shared/format.pipes';
import { DeltaChipComponent, PageHeaderComponent } from '../../shared/ui.components';

type SortKey = 'price' | 'yoy' | 'qoq' | 'dom' | 'tx' | 'yield' | 'inventory' | 'overheating';

@Component({
  selector: 'app-cities-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PageHeaderComponent,
    DeltaChipComponent,
    SparklineComponent,
    EurM2Pipe,
    BgIntPipe,
    Bg2Pipe,
    PctPipe,
  ],
  template: `
    <app-page-header
      eyebrow="Класация"
      title="Градове"
      lead="Дванадесет пазара рамо до рамо: цена, ръст (ГоГ и КоК), дни на пазара, обем на сделките, доходност и прегряване. Сортирай по всяка колона и отклоняващият се град изпъква веднага."
    />

    @if (cities(); as list) {
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Град</th>
              <th class="num sortable" (click)="sortBy('price')" [class.on]="sort() === 'price'">Медиана €/м²</th>
              <th class="num sortable" (click)="sortBy('yoy')" [class.on]="sort() === 'yoy'">ГоГ</th>
              <th class="num sortable" (click)="sortBy('qoq')" [class.on]="sort() === 'qoq'">КоК</th>
              <th class="num sortable" (click)="sortBy('dom')" [class.on]="sort() === 'dom'">DOM</th>
              <th class="num sortable" (click)="sortBy('tx')" [class.on]="sort() === 'tx'">Сделки ГоГ</th>
              <th class="num sortable" (click)="sortBy('yield')" [class.on]="sort() === 'yield'">Доходност</th>
              <th class="num sortable" (click)="sortBy('inventory')" [class.on]="sort() === 'inventory'">Обяви</th>
              <th class="num sortable" (click)="sortBy('overheating')" [class.on]="sort() === 'overheating'">Прегряване</th>
              <th>12 месеца</th>
            </tr>
          </thead>
          <tbody>
            @for (c of list; track c.city.id) {
              <tr>
                <td>
                  <a class="city-link" [routerLink]="['/grad', c.city.slug]">{{ c.city.name }}</a>
                </td>
                <td class="num strong">{{ c.medianEurPerM2 | eurM2 }}</td>
                <td class="num"><app-delta-chip [value]="c.yoyPct" label="ГоГ" /></td>
                <td class="num muted">{{ c.qoqPct | pct }}</td>
                <td class="num muted">{{ c.domDays | bgInt }} дни</td>
                <td class="num"><app-delta-chip [value]="c.transactionsYoYPct" label="ГоГ" /></td>
                <td class="num">{{ c.rentalYieldPct | bg2 }} %</td>
                <td class="num">{{ c.activeListings | bgInt }}</td>
                <td class="num">
                  <span class="heat" [class.hot]="c.overheatingScore > 65" [class.cool]="c.overheatingScore < 40">
                    {{ c.overheatingScore }}
                  </span>
                </td>
                <td class="spark-cell"><app-sparkline [series]="c.sparkline" /></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <p class="loading">Зареждане…</p>
    }
  `,
  styles: `
    .city-link { font-weight: 700; text-decoration: none; }
    .strong { font-weight: 700; }
    .muted { color: var(--muted); }
    .sortable { cursor: pointer; user-select: none; }
    .sortable.on { color: var(--accent); }
    .spark-cell { min-width: 130px; }
    .heat { font-weight: 700; }
    .heat.hot { color: var(--down); }
    .heat.cool { color: var(--accent); }
    .loading { color: var(--muted); padding: 3rem 0; }
  `,
})
export class CitiesPage {
  private readonly data = inject(PropertyDataProvider);

  readonly sort = signal<SortKey>('price');
  private readonly overview = toSignal(this.data.overview('month'));

  readonly cities = computed<CitySummary[] | undefined>(() => {
    const o = this.overview();
    if (!o) return undefined;
    const key = this.sort();
    const val = (c: CitySummary): number => {
      switch (key) {
        case 'price': return c.medianEurPerM2;
        case 'yoy': return c.yoyPct ?? 0;
        case 'qoq': return c.qoqPct ?? 0;
        case 'dom': return c.domDays ?? 0;
        case 'tx': return c.transactionsYoYPct ?? 0;
        case 'yield': return c.rentalYieldPct ?? 0;
        case 'inventory': return c.activeListings;
        case 'overheating': return c.overheatingScore;
      }
    };
    return [...o.cities].sort((a, b) => val(b) - val(a));
  });

  constructor(title: Title, meta: Meta) {
    title.setTitle('Градове — ИмотиПулс');
    meta.updateTag({
      name: 'description',
      content: 'Класация на българските градове по цени на имоти, ръст, доходност от наем и индекс на прегряване.',
    });
  }

  sortBy(key: SortKey): void {
    this.sort.set(key);
  }
}
