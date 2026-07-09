import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  PLATFORM_ID,
} from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { fmt1, fmtInt, fmtPeriod } from '../core/i18n/labels';
import { SeriesPoint } from '../core/models/domain.models';
import { ThemeService } from '../core/services/theme.service';

export interface NamedSeries {
  name: string;
  series: SeriesPoint[];
}

function palette(dark: boolean): string[] {
  return dark
    ? ['#3FB8AE', '#7FA6E8', '#E2A33C', '#D67BA8', '#8AC77B', '#A08BE0']
    : ['#0F8B84', '#3D6BC6', '#C98A1B', '#B85586', '#5B9E4D', '#7C63C9'];
}

function baseText(dark: boolean) {
  return {
    ink: dark ? '#E9EEF3' : '#16202B',
    muted: dark ? '#93A1B0' : '#5D6B7A',
    line: dark ? '#2A3541' : '#DDE3E9',
    surface: dark ? '#171E26' : '#FFFFFF',
  };
}

/** Multi/single line or bar trend chart. */
@Component({
  selector: 'app-trend-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgxEchartsDirective],
  template: `
    @if (isBrowser) {
      <div
        echarts
        [options]="options()"
        class="chart"
        [style.height.px]="height()"
        role="img"
        [attr.aria-label]="ariaLabel()"
      ></div>
    } @else {
      <div class="chart ssr-placeholder" [style.height.px]="height()"></div>
    }
  `,
  styles: `
    .chart { width: 100%; }
    .ssr-placeholder {
      background: repeating-linear-gradient(-45deg, var(--surface-2), var(--surface-2) 6px, transparent 6px, transparent 14px);
      border-radius: var(--radius);
      opacity: 0.4;
    }
  `,
})
export class TrendChartComponent {
  private readonly theme = inject(ThemeService);
  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  data = input.required<NamedSeries[]>();
  height = input<number>(280);
  kind = input<'line' | 'bar'>('line');
  unit = input<string>('');
  /** When true and 2 series are given, the 2nd gets its own right-hand axis. */
  dualAxis = input<boolean>(false);
  ariaLabel = input<string>('Графика на тенденция');

  options = computed<EChartsCoreOption>(() => {
    const dark = this.theme.theme() === 'dark';
    const colors = palette(dark);
    const t = baseText(dark);
    const all = this.data();
    const periods = all[0]?.series.map((p) => fmtPeriod(p.period)) ?? [];
    const multi = all.length > 1;
    const unit = this.unit();

    return {
      color: colors,
      grid: { left: 8, right: 12, top: multi ? 34 : 16, bottom: 8, containLabel: true },
      legend: multi
        ? { top: 0, textStyle: { color: t.muted, fontFamily: 'Sofia Sans' }, icon: 'roundRect' }
        : undefined,
      tooltip: {
        trigger: 'axis',
        backgroundColor: t.surface,
        borderColor: t.line,
        textStyle: { color: t.ink, fontFamily: 'Sofia Sans' },
        valueFormatter: (v: unknown) => `${fmt1(v as number)}${unit ? ' ' + unit : ''}`,
      },
      xAxis: {
        type: 'category',
        data: periods,
        boundaryGap: this.kind() === 'bar',
        axisLine: { lineStyle: { color: t.line } },
        axisLabel: { color: t.muted, fontFamily: 'Sofia Sans', hideOverlap: true },
        axisTick: { show: false },
      },
      yAxis: this.dualAxis()
        ? [
            {
              type: 'value',
              scale: true,
              splitLine: { lineStyle: { color: t.line } },
              axisLabel: { color: t.muted, fontFamily: 'Sofia Sans', formatter: (v: number) => fmtInt(v) },
            },
            {
              type: 'value',
              scale: true,
              splitLine: { show: false },
              axisLabel: { color: t.muted, fontFamily: 'Sofia Sans', formatter: (v: number) => fmtInt(v) },
            },
          ]
        : {
            type: 'value',
            scale: true,
            splitLine: { lineStyle: { color: t.line } },
            axisLabel: {
              color: t.muted,
              fontFamily: 'Sofia Sans',
              formatter: (v: number) => fmtInt(v),
            },
          },
      series: all.map((s, i) => ({
        name: s.name,
        type: this.kind(),
        yAxisIndex: this.dualAxis() && i === 1 ? 1 : 0,
        smooth: 0.25,
        symbol: 'none',
        emphasis: { focus: multi ? 'series' : 'none' },
        lineStyle: { width: 2.4 },
        areaStyle:
          !multi && this.kind() === 'line'
            ? {
                opacity: 0.14,
                color: colors[i],
              }
            : undefined,
        data: s.series.map((p) => p.value),
      })),
    };
  });
}

/** Tiny inline sparkline (12-month pulse). */
@Component({
  selector: 'app-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgxEchartsDirective],
  template: `
    @if (isBrowser) {
      <div echarts [options]="options()" class="spark" aria-hidden="true"></div>
    } @else {
      <div class="spark" aria-hidden="true"></div>
    }
  `,
  styles: `.spark { width: 100%; height: 42px; }`,
})
export class SparklineComponent {
  private readonly theme = inject(ThemeService);
  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  series = input.required<SeriesPoint[]>();

  options = computed<EChartsCoreOption>(() => {
    const dark = this.theme.theme() === 'dark';
    const color = dark ? '#3FB8AE' : '#0F8B84';
    return {
      grid: { left: 0, right: 0, top: 4, bottom: 0 },
      xAxis: { type: 'category', show: false, data: this.series().map((p) => p.period) },
      yAxis: { type: 'value', show: false, scale: true },
      tooltip: { show: false },
      series: [
        {
          type: 'line',
          data: this.series().map((p) => p.value),
          smooth: 0.3,
          symbol: 'none',
          lineStyle: { width: 1.6, color },
          areaStyle: { opacity: 0.12, color },
        },
      ],
      animation: false,
    };
  });
}

/** Overheating gauge 0–100 (the app's signature visual). */
@Component({
  selector: 'app-gauge-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgxEchartsDirective],
  template: `
    @if (isBrowser) {
      <div
        echarts
        [options]="options()"
        class="gauge"
        [style.height.px]="height()"
        role="img"
        [attr.aria-label]="'Индекс на прегряване: ' + score()"
      ></div>
    } @else {
      <div class="gauge" [style.height.px]="height()"></div>
    }
  `,
  styles: `.gauge { width: 100%; }`,
})
export class GaugeChartComponent {
  private readonly theme = inject(ThemeService);
  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  score = input.required<number>();
  height = input<number>(190);

  options = computed<EChartsCoreOption>(() => {
    const dark = this.theme.theme() === 'dark';
    const t = baseText(dark);
    return {
      series: [
        {
          type: 'gauge',
          startAngle: 200,
          endAngle: -20,
          min: 0,
          max: 100,
          radius: '100%',
          center: ['50%', '64%'],
          axisLine: {
            lineStyle: {
              width: 12,
              color: [
                [0.4, dark ? '#3FB8AE' : '#0F8B84'],
                [0.65, dark ? '#E2C86A' : '#C98A1B'],
                [1, dark ? '#E07A6B' : '#C64B33'],
              ],
            },
          },
          pointer: { length: '58%', width: 4, itemStyle: { color: t.ink } },
          axisTick: { show: false },
          splitLine: { length: 4, distance: 4, lineStyle: { color: t.muted, width: 1 } },
          axisLabel: { show: false },
          detail: {
            valueAnimation: true,
            fontSize: 34,
            fontWeight: 700,
            fontFamily: 'Sofia Sans Condensed',
            color: t.ink,
            offsetCenter: [0, '28%'],
          },
          data: [{ value: this.score() }],
        },
      ],
    };
  });
}
