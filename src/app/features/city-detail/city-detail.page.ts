import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { combineLatest, switchMap } from 'rxjs';
import { PropertyDataProvider } from '../../core/data/property-data.provider';
import {
  BUILD_BAND_BG,
  CONSTRUCTION_BG,
  fmt1,
  fmt2,
  fmtEurPerM2,
  fmtInt,
  PROPERTY_TYPE_BG,
} from '../../core/i18n/labels';
import { BreakdownRow, Granularity, SeriesPoint } from '../../core/models/domain.models';
import { lastN } from '../../core/stats/metrics';
import { GaugeChartComponent, TrendChartComponent } from '../../shared/charts.components';
import { Bg1Pipe, Bg2Pipe, BgIntPipe, EurM2Pipe, PctPipe } from '../../shared/format.pipes';
import {
  DeltaChipComponent,
  GranularityToggleComponent,
  KpiCardComponent,
  PageHeaderComponent,
  RangeToggleComponent,
} from '../../shared/ui.components';

@Component({
  selector: 'app-city-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PageHeaderComponent,
    GranularityToggleComponent,
    RangeToggleComponent,
    KpiCardComponent,
    DeltaChipComponent,
    TrendChartComponent,
    GaugeChartComponent,
    EurM2Pipe,
    BgIntPipe,
    Bg1Pipe,
    Bg2Pipe,
    PctPipe,
  ],
  template: `
    @if (detail(); as d) {
      <app-page-header
        eyebrow="Профил на пазара"
        [title]="d.city.name"
        [lead]="'Регион ' + d.city.region + ' · население ' + fmtInt(d.city.population) + ' · пълният набор показатели за продажби и наеми.'"
      >
        <app-range-toggle [value]="rangeMonths()" (change)="rangeMonths.set($event)" />
        <app-granularity-toggle [value]="granularity()" (change)="granularity.set($event)" />
      </app-page-header>

      <div class="grid cols-4">
        <app-kpi-card
          label="Медиана €/м² (продажба)"
          [value]="fmtEurPerM2(d.price.headline)"
          [mom]="d.price.momPct"
          [yoy]="d.price.yoyPct"
        />
        <app-kpi-card
          label="Медиана наем €/м²/мес"
          [value]="fmt2(d.rent.headline) + ' €'"
          [mom]="d.rent.momPct"
          [yoy]="d.rent.yoyPct"
        />
        <app-kpi-card
          label="Брутна доходност"
          [value]="fmt2(d.rentalYield.headline) + ' %'"
          [yoy]="d.rentalYield.yoyPct"
        />
        <app-kpi-card
          label="Активни обяви"
          [value]="fmtInt(d.inventory.headline)"
          [mom]="d.inventory.momPct"
          [yoy]="d.inventory.yoyPct"
        />
      </div>

      <div class="grid cols-2 charts-row">
        <div class="card">
          <h3>Цена срещу обем на сделките</h3>
          <app-trend-chart
            [data]="[
              { name: 'Медиана €/м²', series: ranged(d.price.series) },
              { name: 'Сделки/месец', series: ranged(d.transactions.series) },
            ]"
            [dualAxis]="true"
            ariaLabel="Цена срещу брой сключени сделки — разминаването е водещ индикатор"
          />
        </div>
        <div class="card">
          <h3>Наем €/м²/мес — тенденция</h3>
          <app-trend-chart [data]="[{ name: 'Наем €/м²', series: ranged(d.rent.series) }]" unit="€/м²" />
        </div>
      </div>

      <h2>Сделки и финансиране</h2>
      <div class="grid cols-4">
        <app-kpi-card
          label="Сделки/месец"
          [value]="fmtInt(d.transactions.headline)"
          [mom]="d.transactions.momPct"
          [yoy]="d.transactions.yoyPct"
        />
        <app-kpi-card
          label="Финансирани с ипотека"
          [value]="fmt1(d.mortgageFinancedPct.headline) + ' %'"
          [yoy]="d.mortgageFinancedPct.yoyPct"
        />
        <app-kpi-card
          label="Лихва ⇄ обем сделки"
          [value]="corrLabel(d.rateVolumeCorrelation.direction)"
          [sub]="'корелация на Δ за 12 мес.: ' + (d.rateVolumeCorrelation.coef ?? '–')"
        />
        <app-kpi-card
          label="Инвестиционни купувачи"
          [value]="fmt1(d.investmentShare.headline) + ' %'"
          sub="спад = съзряване на пазара"
          [yoy]="d.investmentShare.yoyPct"
        />
      </div>
      <div class="grid cols-2 charts-row">
        <div class="card">
          <h3>Дял инвестиционни купувачи (%)</h3>
          <app-trend-chart [data]="[{ name: '% инвестиционни', series: ranged(d.investmentShare.series) }]" unit="%" />
        </div>
        <div class="card">
          <h3>Ново строителство (единици в строеж, тримесечно)</h3>
          <app-trend-chart [data]="[{ name: 'В строеж', series: d.construction.series }]" kind="bar" />
          <p class="note">
            Предлагане {{ d.construction.supplyYoYPct | pct }} ГоГ срещу цени
            {{ d.construction.priceYoYPct | pct }} → натиск на предлагането:
            <b>{{ d.construction.pressure | pct }}</b>
          </p>
        </div>
      </div>

      <h2>Здраве на пазара</h2>
      <div class="grid cols-4">
        <app-kpi-card
          label="Дял намалени обяви"
          [value]="fmt1(d.priceCutRate.headline) + ' %'"
          [sub]="'среден дисконт ' + fmt1(d.avgDiscountPct) + '%'"
          [yoy]="d.priceCutRate.yoyPct"
          [invert]="true"
        />
        <app-kpi-card
          label="Месеци до изчерпване"
          [value]="fmt1(d.absorptionMonths)"
          sub="наличност ÷ средни продажби (6 мес.)"
        />
        <app-kpi-card
          label="Дни на пазара (DOM)"
          [value]="fmtInt(d.domDays)"
          sub="медиана, свалени обяви (12 мес.)"
        />
        <app-kpi-card
          label="Достъпност (PIR, градски доход)"
          [value]="fmt1(d.pir.headline) + ' год.'"
          sub="медианен имот ÷ градски годишен доход"
          [yoy]="d.pir.yoyPct"
          [invert]="true"
        />
        <app-kpi-card
          label="Изплащане чрез наем (P/R)"
          [value]="fmt1(d.priceToRent.headline) + ' год.'"
          sub="цена ÷ годишен брутен наем"
          [yoy]="d.priceToRent.yoyPct"
          [invert]="true"
        />
      </div>

      <div class="grid cols-2 charts-row">
        <div class="card">
          <h3>Дял намалени обяви (%)</h3>
          <app-trend-chart [data]="[{ name: '% намалени', series: ranged(d.priceCutRate.series) }]" unit="%" />
        </div>
        <div class="card">
          <h3>Достъпност (години доход)</h3>
          <app-trend-chart
            [data]="[
              { name: 'PIR (градски доход)', series: ranged(d.pir.series) },
              { name: 'Регионален доход', series: ranged(d.affordability.series) },
            ]"
            unit="год."
          />
        </div>
      </div>

      <h2>Прегряване и инерция</h2>
      <div class="grid cols-3">
        <div class="card gauge-card">
          <h3>Индекс на прегряване</h3>
          <app-gauge-chart [score]="d.overheating.score" />
          <p class="note">
            Цени {{ d.overheating.priceYoY | pct }} ГоГ · доходи {{ d.overheating.incomeYoY | pct }} ·
            наеми {{ d.overheating.rentYoY | pct }}
          </p>
        </div>
        <app-kpi-card
          label="Инерция на цените"
          [value]="(d.momentum > 0 ? '+' : '') + fmt2(d.momentum) + ' пп/мес'"
          [sub]="d.momentum > 0.02 ? 'ръстът се ускорява' : d.momentum < -0.02 ? 'ръстът се забавя' : 'стабилен темп'"
        />
        <app-kpi-card
          label="Градиент от центъра"
          [value]="fmt1(d.centerGradient.decayPctPerKm) + ' %/км'"
          sub="промяна на €/м² с всеки км от центъра"
        />
      </div>

      <h2>Квартали</h2>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Квартал</th>
              <th class="num">км от центъра</th>
              <th class="num">Продажба €/м²</th>
              <th class="num">Наем €/м²</th>
              <th class="num">Доходност</th>
              <th class="num">ГоГ</th>
              <th class="num">Обяви</th>
            </tr>
          </thead>
          <tbody>
            @for (n of d.neighborhoods; track n.neighborhoodId) {
              <tr>
                <td class="strong">{{ n.name }}</td>
                <td class="num muted">{{ n.distanceFromCenterKm | bg1 }}</td>
                <td class="num strong">{{ n.medianSaleEurPerM2 | eurM2 }}</td>
                <td class="num">{{ n.medianRentEurPerM2 | bg2 }} €</td>
                <td class="num">{{ n.rentalYieldPct | bg2 }} %</td>
                <td class="num"><app-delta-chip [value]="n.yoyPct" label="ГоГ" /></td>
                <td class="num">{{ n.activeListings | bgInt }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <h2>Срезове на пазара</h2>
      <div class="grid cols-3">
        <div class="card">
          <h3>По тип имот</h3>
          @for (row of d.byType; track row.key) {
            <div class="mini-row">
              <span>{{ typeLabel(row) }}</span>
              <span class="mini-val">{{ row.medianEurPerM2 | eurM2 }}</span>
              <app-delta-chip [value]="row.yoyPct" label="ГоГ" />
            </div>
          }
        </div>
        <div class="card">
          <h3>По строителство</h3>
          @for (row of d.byConstruction; track row.key) {
            <div class="mini-row">
              <span>{{ constructionLabel(row) }}</span>
              <span class="mini-val">{{ row.medianEurPerM2 | eurM2 }}</span>
              <app-delta-chip [value]="row.yoyPct" label="ГоГ" />
            </div>
          }
        </div>
        <div class="card">
          <h3>По година на строеж</h3>
          @for (row of d.byBuildYearBand; track row.key) {
            <div class="mini-row">
              <span>{{ bandLabel(row) }}</span>
              <span class="mini-val">{{ row.medianEurPerM2 | eurM2 }}</span>
              <app-delta-chip [value]="row.yoyPct" label="ГоГ" />
            </div>
          }
        </div>
      </div>

      <p class="cta">
        <a class="btn" [routerLink]="['/obiavi']" [queryParams]="{ city: d.city.slug }">
          Виж обявите в {{ d.city.name }} →
        </a>
      </p>
    } @else {
      <p class="loading">Зареждане на профила…</p>
    }
  `,
  styles: `
    .charts-row { margin-top: 1rem; }
    .strong { font-weight: 700; }
    .muted { color: var(--muted); }
    .note { font-size: 0.78rem; color: var(--muted); margin: 0; }
    .gauge-card { display: flex; flex-direction: column; }
    .mini-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      justify-content: space-between;
      padding: 0.45rem 0;
      border-bottom: 1px solid var(--line);
      font-size: 0.88rem;
      &:last-child { border-bottom: 0; }
      .mini-val { margin-left: auto; font-weight: 700; font-variant-numeric: tabular-nums; }
    }
    .cta { margin-top: 1.6rem; }
    .loading { color: var(--muted); padding: 3rem 0; }
  `,
})
export class CityDetailPage {
  private readonly data = inject(PropertyDataProvider);
  private readonly titleSrv = inject(Title);
  private readonly metaSrv = inject(Meta);

  /** Route param via withComponentInputBinding. */
  slug = input.required<string>();

  readonly granularity = signal<Granularity>('month');
  readonly rangeMonths = signal<number>(24);

  readonly detail = toSignal(
    combineLatest([toObservable(this.slug), toObservable(this.granularity)]).pipe(
      switchMap(([slug, g]) => this.data.cityDetail(slug, g)),
    ),
  );

  readonly fmtEurPerM2 = fmtEurPerM2;
  readonly fmtInt = fmtInt;
  readonly fmt1 = fmt1;
  readonly fmt2 = fmt2;

  constructor() {
    effect(() => {
      const d = this.detail();
      if (!d) return;
      this.titleSrv.setTitle(`${d.city.name} — цени на имоти | ИмотиПулс`);
      this.metaSrv.updateTag({
        name: 'description',
        content: `Медиана ${Math.round(d.price.headline)} €/м² в ${d.city.name}: тенденции, наеми, доходност, достъпност, квартали и индекс на прегряване.`,
      });
    });
  }

  ranged(series: SeriesPoint[]): SeriesPoint[] {
    const n = this.rangeMonths();
    return lastN(series, this.granularity() === 'year' ? Math.ceil(n / 12) : n);
  }

  corrLabel(dir: 'negative' | 'positive' | 'neutral'): string {
    return dir === 'negative' ? 'Обратна' : dir === 'positive' ? 'Права' : 'Неутрална';
  }

  typeLabel(row: BreakdownRow): string {
    return PROPERTY_TYPE_BG[row.key as keyof typeof PROPERTY_TYPE_BG] ?? row.key;
  }
  constructionLabel(row: BreakdownRow): string {
    return CONSTRUCTION_BG[row.key as keyof typeof CONSTRUCTION_BG] ?? row.key;
  }
  bandLabel(row: BreakdownRow): string {
    return BUILD_BAND_BG[row.key] ?? row.key;
  }
}
