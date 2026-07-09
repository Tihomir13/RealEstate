import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Granularity } from '../core/models/domain.models';
import { fmtPct } from '../core/i18n/labels';

/** Δ-chip: consistent MoM / YoY change indicator across the whole app. */
@Component({
  selector: 'app-delta-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (value() !== null && value() !== undefined) {
      <span class="chip" [class.up]="isUp()" [class.down]="isDown()" [class.flat]="isFlat()">
        <span class="arrow" aria-hidden="true">{{ isUp() ? '▲' : isDown() ? '▼' : '■' }}</span>
        {{ text() }}
        <span class="tag">{{ label() }}</span>
      </span>
    }
  `,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.72rem;
      font-weight: 600;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      font-variant-numeric: tabular-nums;
      background: var(--surface-2);
      color: var(--muted);
      white-space: nowrap;
    }
    .chip.up { color: var(--up); background: color-mix(in srgb, var(--up) 12%, transparent); }
    .chip.down { color: var(--down); background: color-mix(in srgb, var(--down) 12%, transparent); }
    .arrow { font-size: 0.6rem; }
    .tag { font-weight: 400; opacity: 0.75; }
  `,
})
export class DeltaChipComponent {
  /** Percent change value. */
  value = input.required<number | null | undefined>();
  /** 'МоМ' | 'ГоГ' | custom. */
  label = input<string>('ГоГ');
  /** When true, positive change is styled as bad (e.g. affordability). */
  invert = input<boolean>(false);

  text = computed(() => fmtPct(this.value()));
  isFlat = computed(() => Math.abs(this.value() ?? 0) < 0.05);
  isUp = computed(() => {
    const v = this.value() ?? 0;
    return !this.isFlat() && (this.invert() ? v < 0 : v > 0);
  });
  isDown = computed(() => {
    const v = this.value() ?? 0;
    return !this.isFlat() && (this.invert() ? v > 0 : v < 0);
  });
}

/** KPI card: label + big value + optional deltas + optional projected content. */
@Component({
  selector: 'app-kpi-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DeltaChipComponent],
  template: `
    <div class="kpi">
      <span class="label">{{ label() }}</span>
      <span class="value">{{ value() }}</span>
      @if (sub()) {
        <span class="sub">{{ sub() }}</span>
      }
      <span class="chips">
        @if (mom() !== undefined) {
          <app-delta-chip [value]="mom()" label="МоМ" [invert]="invert()" />
        }
        @if (yoy() !== undefined) {
          <app-delta-chip [value]="yoy()" label="ГоГ" [invert]="invert()" />
        }
      </span>
      <ng-content />
    </div>
  `,
  styles: `
    .kpi {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      padding: 1rem 1.1rem;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      min-width: 0;
    }
    .label {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      font-weight: 600;
    }
    .value {
      font-family: var(--font-display);
      font-size: clamp(1.6rem, 2.6vw, 2.2rem);
      font-weight: 700;
      line-height: 1.05;
      font-variant-numeric: tabular-nums;
    }
    .sub { font-size: 0.78rem; color: var(--muted); }
    .chips { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  `,
})
export class KpiCardComponent {
  label = input.required<string>();
  value = input.required<string>();
  sub = input<string | null>(null);
  mom = input<number | null | undefined>(undefined);
  yoy = input<number | null | undefined>(undefined);
  invert = input<boolean>(false);
}

/** Month / year granularity toggle. */
@Component({
  selector: 'app-granularity-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toggle" role="group" aria-label="Гранулярност на данните">
      <button
        type="button"
        [class.active]="value() === 'month'"
        (click)="change.emit('month')"
      >
        По месеци
      </button>
      <button
        type="button"
        [class.active]="value() === 'year'"
        (click)="change.emit('year')"
      >
        По години
      </button>
    </div>
  `,
  styles: `
    .toggle {
      display: inline-flex;
      border: 1px solid var(--line);
      border-radius: 999px;
      overflow: hidden;
      background: var(--surface);
    }
    button {
      border: 0;
      background: transparent;
      color: var(--muted);
      font: inherit;
      font-size: 0.8rem;
      font-weight: 600;
      padding: 0.35rem 0.9rem;
      cursor: pointer;
    }
    button.active {
      background: var(--accent);
      color: #fff;
    }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  `,
})
export class GranularityToggleComponent {
  value = input.required<Granularity>();
  change = output<Granularity>();
}

/** Trailing time-range selector for charts (months; 0 = whole history). */
@Component({
  selector: 'app-range-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toggle" role="group" aria-label="Период на графиките">
      @for (opt of options; track opt.months) {
        <button type="button" [class.active]="value() === opt.months" (click)="change.emit(opt.months)">
          {{ opt.label }}
        </button>
      }
    </div>
  `,
  styles: `
    .toggle {
      display: inline-flex;
      border: 1px solid var(--line);
      border-radius: 999px;
      overflow: hidden;
      background: var(--surface);
    }
    button {
      border: 0;
      background: transparent;
      color: var(--muted);
      font: inherit;
      font-size: 0.78rem;
      font-weight: 600;
      padding: 0.32rem 0.75rem;
      cursor: pointer;
    }
    button.active { background: var(--surface-2); color: var(--accent); }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  `,
})
export class RangeToggleComponent {
  readonly options = [
    { label: '2 г', months: 24 },
    { label: '5 г', months: 60 },
    { label: '10 г', months: 0 },
  ];
  value = input.required<number>();
  change = output<number>();
}

/** Page header with eyebrow + title + slot for actions. */
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="ph">
      <div>
        <span class="eyebrow">{{ eyebrow() }}</span>
        <h1>{{ title() }}</h1>
        @if (lead()) {
          <p class="lead">{{ lead() }}</p>
        }
      </div>
      <div class="actions"><ng-content /></div>
    </header>
  `,
  styles: `
    .ph {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 1rem;
      flex-wrap: wrap;
      margin-block: 1.6rem 1.2rem;
    }
    .eyebrow {
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--accent);
    }
    h1 {
      font-family: var(--font-display);
      font-size: clamp(1.7rem, 4vw, 2.6rem);
      line-height: 1.05;
      margin: 0.15rem 0 0;
    }
    .lead { color: var(--muted); max-width: 60ch; margin: 0.5rem 0 0; }
    .actions { display: flex; gap: 0.6rem; align-items: center; }
  `,
})
export class PageHeaderComponent {
  eyebrow = input<string>('');
  title = input.required<string>();
  lead = input<string | null>(null);
}
