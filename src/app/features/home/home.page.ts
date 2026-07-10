import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { PropertyDataProvider } from '../../core/data/property-data.provider';
import { fmt2, fmtEurPerM2, fmtInt } from '../../core/i18n/labels';
import { Granularity, NationalOverview, SeriesPoint } from '../../core/models/domain.models';
import { lastN } from '../../core/stats/metrics';
import { NamedSeries, SparklineComponent, TrendChartComponent, GaugeChartComponent } from '../../shared/charts.components';
import { PctPipe } from '../../shared/format.pipes';
import {
  DeltaChipComponent,
  GranularityToggleComponent,
  KpiCardComponent,
  RangeToggleComponent,
} from '../../shared/ui.components';

@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    KpiCardComponent,
    DeltaChipComponent,
    GranularityToggleComponent,
    RangeToggleComponent,
    TrendChartComponent,
    SparklineComponent,
    GaugeChartComponent,
    PctPipe,
  ],
  template: `
    @if (overview(); as o) {
      <!-- Masthead: "пулс на пазара" -->
      <section class="masthead">
        <div class="mast-copy">
          <span class="eyebrow">Национален пулс · {{ periodLabel() }}</span>
          <h1>
            Жилищният пазар днес:
            <b class="big-num">{{ fmtEurPerM2(o.price.headline) }}</b>
          </h1>
          <p class="lead">
            Медианна цена на активните обяви за продажба в 12-те наблюдавани града.
          </p>
          <div class="mast-chips">
            <app-delta-chip [value]="o.price.momPct" label="МоМ" />
            <app-delta-chip [value]="o.price.yoyPct" label="ГоГ" />
          </div>
        </div>
        <div class="mast-gauge card">
          <span class="gauge-label">Индекс на прегряване</span>
          <app-gauge-chart [score]="o.overheating.score" />
          <p class="gauge-note">
            Цени {{ o.overheating.priceYoY | pct }} ГоГ срещу доходи
            {{ o.overheating.incomeYoY | pct }} и наеми {{ o.overheating.rentYoY | pct }}.
          </p>
        </div>
      </section>

      <section class="controls">
        <h2>Тенденция на цените</h2>
        <span class="toggles">
          <app-range-toggle [value]="rangeMonths()" (change)="rangeMonths.set($event)" />
          <app-granularity-toggle [value]="granularity()" (change)="granularity.set($event)" />
        </span>
      </section>

      <div class="grid cols-2 charts-row">
        <div class="card">
          <h3>Цена срещу обем на сделките</h3>
          <app-trend-chart
            [data]="priceChartSeries(o)"
            [dualAxis]="true"
            ariaLabel="Цена на кв.м срещу брой сключени сделки — разминаването е водещ индикатор"
          />
        </div>
        <div class="card">
          <h3>Активни обяви за продажба</h3>
          <app-trend-chart
            [data]="[{ name: 'Обяви', series: ranged(o.inventory.series) }]"
            kind="bar"
            ariaLabel="Брой активни обяви по период"
          />
        </div>
      </div>

      <div class="grid cols-4 kpi-row">
        <app-kpi-card
          label="Сделки/месец"
          [value]="fmtInt(o.transactions.headline)"
          [mom]="o.transactions.momPct"
          [yoy]="o.transactions.yoyPct"
        />
        <app-kpi-card
          label="Лихва по ипотеки"
          [value]="fmt2(o.mortgageRate.headline) + ' %'"
          sub="синтетичен БНБ-стил индикатор"
          [yoy]="o.mortgageRate.yoyPct"
          [invert]="true"
        />
        <app-kpi-card
          label="Брутна доходност от наем"
          [value]="fmt2(o.rentalYieldPct) + ' %'"
          sub="годишен наем ÷ цена, национално"
        />
        <app-kpi-card
          label="Най-бърз ръст (ГоГ)"
          [value]="o.topMovers[0].city.name"
          [sub]="'+' + (o.topMovers[0].yoyPct | pct: false)"
        />
      </div>

      <h2>Градовете под лупа</h2>
      <div class="grid cols-3 city-grid">
        @for (c of o.cities; track c.city.id) {
          <a class="card city-card" [routerLink]="['/grad', c.city.slug]">
            <div class="city-head">
              <span class="city-name">{{ c.city.name }}</span>
              <app-delta-chip [value]="c.yoyPct" label="ГоГ" />
            </div>
            <span class="city-price">{{ fmtEurPerM2(c.medianEurPerM2) }}</span>
            <app-sparkline [series]="c.sparkline" />
            <div class="city-foot">
              <span>{{ fmtInt(c.activeListings) }} обяви</span>
              <span>доходност {{ fmt2(c.rentalYieldPct) }}%</span>
              <span [class.hot]="c.overheatingScore > 65">прегряване {{ c.overheatingScore }}</span>
            </div>
          </a>
        }
      </div>
    } @else {
      <p class="loading">Зареждане на пазарните данни…</p>
    }
  `,
  styles: `
    .masthead {
      display: grid;
      grid-template-columns: 1.5fr 1fr;
      gap: 1.4rem;
      align-items: stretch;
      margin-top: 2rem;
    }
    .eyebrow {
      font-size: 0.74rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .mast-copy h1 {
      font-size: clamp(1.8rem, 4vw, 2.6rem);
      margin: 0.4rem 0 0.4rem;
      font-weight: 400;
    }
    .big-num {
      display: block;
      font-size: clamp(3.4rem, 9vw, 6rem);
      font-weight: 800;
      letter-spacing: -0.01em;
      color: var(--ink);
      font-variant-numeric: tabular-nums;
      line-height: 1;
      margin-top: 0.3rem;
    }
    .lead { color: var(--muted); max-width: 46ch; }
    .mast-chips { display: flex; gap: 0.5rem; margin-top: 0.6rem; }
    .mast-gauge { display: flex; flex-direction: column; }
    .gauge-label {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--muted);
    }
    .gauge-note { font-size: 0.8rem; color: var(--muted); margin: 0; }
    .controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
      h2 { margin-bottom: 0; }
      .toggles { display: flex; gap: 0.6rem; flex-wrap: wrap; }
    }
    .charts-row { margin-top: 1rem; }
    .kpi-row { margin-top: 1rem; }
    .city-card {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      text-decoration: none;
      color: var(--ink);
      transition: border-color 120ms ease, transform 120ms ease;
      &:hover { border-color: var(--accent); transform: translateY(-2px); }
    }
    .city-head { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
    .city-name { font-family: var(--font-display); font-weight: 700; font-size: 1.2rem; }
    .city-price { font-size: 1.35rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .city-foot {
      display: flex;
      justify-content: space-between;
      gap: 0.4rem;
      flex-wrap: wrap;
      font-size: 0.74rem;
      color: var(--muted);
      .hot { color: var(--down); font-weight: 700; }
    }
    .loading { color: var(--muted); padding: 3rem 0; }
    @media (max-width: 860px) {
      .masthead { grid-template-columns: 1fr; }
    }
  `,
})
export class HomePage {
  private readonly data = inject(PropertyDataProvider);

  readonly granularity = signal<Granularity>('month');
  readonly rangeMonths = signal<number>(24);
  readonly overview = toSignal(
    toObservable(this.granularity).pipe(switchMap((g) => this.data.overview(g))),
  );

  readonly fmtEurPerM2 = fmtEurPerM2;
  readonly fmtInt = fmtInt;
  readonly fmt2 = fmt2;

  constructor(title: Title, meta: Meta) {
    title.setTitle('ИмотиПулс — обзор на жилищния пазар в България');
    meta.updateTag({
      name: 'description',
      content:
        'Медианни цени €/м², наличност, доходност от наем и индекс на прегряване за 12 български града — по месеци и години.',
    });
  }

  ranged(series: SeriesPoint[]): SeriesPoint[] {
    const n = this.rangeMonths();
    return lastN(series, this.granularity() === 'year' ? Math.ceil(n / 12) : n);
  }

  priceChartSeries(o: NationalOverview): NamedSeries[] {
    const base: NamedSeries[] = [
      { name: 'Медиана €/м²', series: this.ranged(o.price.series) },
      { name: 'Сделки/месец', series: this.ranged(o.transactions.series) },
    ];
    return o.priceForecast.length
      ? [...base, { name: 'Прогноза (линеен тренд)', series: o.priceForecast, projected: true }]
      : base;
  }

  periodLabel(): string {
    const o = this.overview();
    if (!o) return '';
    const s = o.price.series;
    return s.length ? s[s.length - 1].period : '';
  }
}
