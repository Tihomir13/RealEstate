import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { combineLatest, switchMap } from 'rxjs';
import { PropertyDataProvider } from '../../core/data/property-data.provider';
import { Granularity } from '../../core/models/domain.models';
import { NamedSeries, TrendChartComponent } from '../../shared/charts.components';
import { Bg1Pipe, Bg2Pipe, BgIntPipe, EurM2Pipe, PctPipe } from '../../shared/format.pipes';
import { GranularityToggleComponent, PageHeaderComponent } from '../../shared/ui.components';

@Component({
  selector: 'app-compare-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    GranularityToggleComponent,
    TrendChartComponent,
    EurM2Pipe,
    BgIntPipe,
    Bg1Pipe,
    Bg2Pipe,
    PctPipe,
  ],
  template: `
    <app-page-header
      eyebrow="Дуел на пазарите"
      title="Сравнение на градове"
      lead="Избери от 2 до 4 града и ги постави рамо до рамо — цени, наеми, доходност, достъпност и здраве на пазара."
    >
      <app-granularity-toggle [value]="granularity()" (change)="granularity.set($event)" />
    </app-page-header>

    @if (meta(); as m) {
      <div class="pickers card">
        @for (c of m.cities; track c.id) {
          <label class="pick" [class.disabled]="!isSelected(c.slug) && selected().length >= 4">
            <input
              type="checkbox"
              [checked]="isSelected(c.slug)"
              [disabled]="!isSelected(c.slug) && selected().length >= 4"
              (change)="toggleCity(c.slug)"
            />
            {{ c.name }}
          </label>
        }
      </div>
    }

    @if (details(); as list) {
      @if (list.length >= 2) {
        <div class="grid cols-2 charts-row">
          <div class="card">
            <h3>Медиана €/м² (продажба)</h3>
            <app-trend-chart [data]="priceSeries()" unit="€/м²" [height]="320" />
          </div>
          <div class="card">
            <h3>Медиана наем €/м²/мес</h3>
            <app-trend-chart [data]="rentSeries()" unit="€/м²" [height]="320" />
          </div>
        </div>
        <div class="grid cols-2 charts-row">
          <div class="card">
            <h3>Достъпност (години доход)</h3>
            <app-trend-chart [data]="affordabilitySeries()" unit="год." [height]="280" />
          </div>
          <div class="card">
            <h3>Дял намалени обяви (%)</h3>
            <app-trend-chart [data]="cutSeries()" unit="%" [height]="280" />
          </div>
        </div>

        <h2>Ключови показатели</h2>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Показател</th>
                @for (d of list; track d.city.id) {
                  <th class="num">{{ d.city.name }}</th>
                }
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Медиана €/м²</td>
                @for (d of list; track d.city.id) {
                  <td class="num strong">{{ d.price.headline | eurM2 }}</td>
                }
              </tr>
              <tr>
                <td>Ръст ГоГ</td>
                @for (d of list; track d.city.id) {
                  <td class="num">{{ d.price.yoyPct | pct }}</td>
                }
              </tr>
              <tr>
                <td>Наем €/м²/мес</td>
                @for (d of list; track d.city.id) {
                  <td class="num">{{ d.rent.headline | bg2 }} €</td>
                }
              </tr>
              <tr>
                <td>Брутна доходност</td>
                @for (d of list; track d.city.id) {
                  <td class="num">{{ d.rentalYield.headline | bg2 }} %</td>
                }
              </tr>
              <tr>
                <td>Достъпност (год. доход)</td>
                @for (d of list; track d.city.id) {
                  <td class="num">{{ d.affordability.headline | bg1 }}</td>
                }
              </tr>
              <tr>
                <td>Активни обяви</td>
                @for (d of list; track d.city.id) {
                  <td class="num">{{ d.inventory.headline | bgInt }}</td>
                }
              </tr>
              <tr>
                <td>Дни на пазара</td>
                @for (d of list; track d.city.id) {
                  <td class="num">{{ d.domDays | bgInt }}</td>
                }
              </tr>
              <tr>
                <td>Месеци до изчерпване</td>
                @for (d of list; track d.city.id) {
                  <td class="num">{{ d.absorptionMonths | bg1 }}</td>
                }
              </tr>
              <tr>
                <td>Индекс на прегряване</td>
                @for (d of list; track d.city.id) {
                  <td class="num">
                    <span [class.hot]="d.overheating.score > 65" [class.cool]="d.overheating.score < 40">
                      {{ d.overheating.score }}
                    </span>
                  </td>
                }
              </tr>
              <tr>
                <td>Градиент от центъра</td>
                @for (d of list; track d.city.id) {
                  <td class="num">{{ d.centerGradient.decayPctPerKm | bg1 }} %/км</td>
                }
              </tr>
            </tbody>
          </table>
        </div>
      } @else {
        <p class="hint">Избери поне два града за сравнение.</p>
      }
    } @else {
      <p class="loading">Зареждане…</p>
    }
  `,
  styles: `
    .pickers {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem 1rem;
      margin-bottom: 1.2rem;
    }
    .pick {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.9rem;
      cursor: pointer;
      &.disabled { opacity: 0.45; cursor: default; }
      input { accent-color: var(--accent); }
    }
    .charts-row { margin-top: 1rem; }
    .strong { font-weight: 700; }
    .hot { color: var(--down); font-weight: 700; }
    .cool { color: var(--accent); font-weight: 700; }
    .hint, .loading { color: var(--muted); padding: 2rem 0; }
  `,
})
export class ComparePage {
  private readonly data = inject(PropertyDataProvider);

  readonly granularity = signal<Granularity>('month');
  readonly selected = signal<string[]>(['sofia', 'varna']);

  readonly meta = toSignal(this.data.meta());
  readonly details = toSignal(
    combineLatest([toObservable(this.selected), toObservable(this.granularity)]).pipe(
      switchMap(([slugs, g]) => this.data.compare(slugs, g)),
    ),
  );

  readonly priceSeries = computed<NamedSeries[]>(
    () => (this.details() ?? []).map((d) => ({ name: d.city.name, series: d.price.series })),
  );
  readonly rentSeries = computed<NamedSeries[]>(
    () => (this.details() ?? []).map((d) => ({ name: d.city.name, series: d.rent.series })),
  );
  readonly affordabilitySeries = computed<NamedSeries[]>(
    () => (this.details() ?? []).map((d) => ({ name: d.city.name, series: d.affordability.series })),
  );
  readonly cutSeries = computed<NamedSeries[]>(
    () => (this.details() ?? []).map((d) => ({ name: d.city.name, series: d.priceCutRate.series })),
  );

  constructor(title: Title, metaSrv: Meta) {
    title.setTitle('Сравнение на градове — ИмотиПулс');
    metaSrv.updateTag({
      name: 'description',
      content: 'Сравни до 4 български града по цени на имоти, наеми, доходност, достъпност и индекс на прегряване.',
    });
  }

  isSelected(slug: string): boolean {
    return this.selected().includes(slug);
  }

  toggleCity(slug: string): void {
    this.selected.update((cur) => {
      if (cur.includes(slug)) return cur.filter((s) => s !== slug);
      return cur.length >= 4 ? cur : [...cur, slug];
    });
  }
}
