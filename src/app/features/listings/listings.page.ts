import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { debounceTime, switchMap } from 'rxjs';
import { PropertyDataProvider } from '../../core/data/property-data.provider';
import {
  CONSTRUCTION_BG,
  fmtDateBg,
  LISTING_TYPE_BG,
  PROPERTY_TYPE_BG,
  STATUS_BG,
} from '../../core/i18n/labels';
import {
  ConstructionType,
  ListingsFilter,
  ListingStatus,
  ListingType,
  Neighborhood,
  PropertyType,
} from '../../core/models/domain.models';
import { Bg1Pipe, BgIntPipe, BgnPipe, EurPipe, PctPipe } from '../../shared/format.pipes';
import { PageHeaderComponent } from '../../shared/ui.components';

type SortKey = NonNullable<ListingsFilter['sort']>;

@Component({
  selector: 'app-listings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, EurPipe, BgnPipe, BgIntPipe, Bg1Pipe, PctPipe],
  template: `
    <app-page-header
      eyebrow="Микроскоп"
      title="Обяви"
      lead="Аналитична таблица на пазара: всяка обява с дни на пазара, отстъпка и отклонение спрямо хедоничния модел (над/подценена)."
    />

    <!-- Filters -->
    <div class="filters card">
      <label class="field">
        Град
        <select [value]="city() ?? ''" (change)="setCity($any($event.target).value)">
          <option value="">Всички</option>
          @for (c of meta()?.cities; track c.id) {
            <option [value]="c.slug">{{ c.name }}</option>
          }
        </select>
      </label>
      <label class="field">
        Квартал
        <select
          [value]="neighborhoodId() ?? ''"
          (change)="neighborhoodId.set(toNum($any($event.target).value)); page.set(1)"
          [disabled]="!city()"
        >
          <option value="">Всички</option>
          @for (n of neighborhoods(); track n.id) {
            <option [value]="n.id">{{ n.name }}</option>
          }
        </select>
      </label>
      <label class="field">
        Тип сделка
        <select [value]="listingType() ?? ''" (change)="listingType.set(orU($any($event.target).value)); page.set(1)">
          <option value="">Всички</option>
          <option value="sale">Продажба</option>
          <option value="rent">Наем</option>
        </select>
      </label>
      <label class="field">
        Тип имот
        <select [value]="propertyType() ?? ''" (change)="propertyType.set(orU($any($event.target).value)); page.set(1)">
          <option value="">Всички</option>
          @for (t of propertyTypes; track t) {
            <option [value]="t">{{ typeBg[t] }}</option>
          }
        </select>
      </label>
      <label class="field">
        Строителство
        <select [value]="construction() ?? ''" (change)="construction.set(orU($any($event.target).value)); page.set(1)">
          <option value="">Всички</option>
          @for (c of constructions; track c) {
            <option [value]="c">{{ constructionBg[c] }}</option>
          }
        </select>
      </label>
      <label class="field">
        Статус
        <select [value]="status() ?? ''" (change)="status.set(orU($any($event.target).value)); page.set(1)">
          <option value="">Активен пазар</option>
          <option value="active">Активна</option>
          <option value="reduced">Намалена</option>
          <option value="removed">Свалена</option>
        </select>
      </label>
      <label class="field">
        Цена от (€)
        <input type="number" min="0" step="1000" [value]="minPrice() ?? ''" (input)="minPrice.set(toNum($any($event.target).value)); page.set(1)" />
      </label>
      <label class="field">
        Цена до (€)
        <input type="number" min="0" step="1000" [value]="maxPrice() ?? ''" (input)="maxPrice.set(toNum($any($event.target).value)); page.set(1)" />
      </label>
      <label class="field">
        Площ от (м²)
        <input type="number" min="0" [value]="minArea() ?? ''" (input)="minArea.set(toNum($any($event.target).value)); page.set(1)" />
      </label>
      <label class="field">
        Площ до (м²)
        <input type="number" min="0" [value]="maxArea() ?? ''" (input)="maxArea.set(toNum($any($event.target).value)); page.set(1)" />
      </label>
    </div>

    @if (result(); as r) {
      <p class="count">
        Намерени: <b>{{ r.total | bgInt }}</b> обяви · страница {{ r.page }} от {{ totalPages() }}
      </p>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Локация</th>
              <th>Имот</th>
              <th class="num sortable" (click)="sortBy('price')" [class.on]="sort() === 'price'">Цена {{ arrow('price') }}</th>
              <th class="num sortable" (click)="sortBy('ppm2')" [class.on]="sort() === 'ppm2'">€/м² {{ arrow('ppm2') }}</th>
              <th class="num">Площ</th>
              <th class="num sortable" (click)="sortBy('dom')" [class.on]="sort() === 'dom'">DOM {{ arrow('dom') }}</th>
              <th class="num sortable" (click)="sortBy('discount')" [class.on]="sort() === 'discount'">Отстъпка {{ arrow('discount') }}</th>
              <th class="num sortable" (click)="sortBy('overpriced')" [class.on]="sort() === 'overpriced'">Δ модел {{ arrow('overpriced') }}</th>
              <th>Статус</th>
              <th class="num">Публикувана</th>
            </tr>
          </thead>
          <tbody>
            @for (l of r.rows; track l.id) {
              <tr>
                <td>
                  <span class="strong">{{ l.cityName }}</span>
                  <span class="muted"> · {{ l.neighborhoodName }}</span>
                </td>
                <td>
                  {{ typeBg[l.propertyType] }} · {{ constructionBg[l.construction] }} ·
                  {{ l.buildYear }} г. · ет. {{ l.floor }}
                  @if (l.isNew) {
                    <span class="badge under">ново</span>
                  }
                </td>
                <td class="num strong">
                  {{ l.priceEur | eur }}
                  <div class="sub-price">{{ l.priceEur | bgn }}</div>
                </td>
                <td class="num">{{ l.priceEurPerM2 | bgInt }}</td>
                <td class="num">{{ l.areaM2 | bgInt }} м²</td>
                <td class="num">{{ l.domDays | bgInt }} дни</td>
                <td class="num">
                  @if (l.discountPct; as d) {
                    <span class="badge reduced">−{{ d | bg1 }}%</span>
                  } @else {
                    <span class="muted">–</span>
                  }
                </td>
                <td class="num">
                  @if (l.overpricedPct !== null) {
                    <span class="badge" [class.over]="l.overpricedPct! > 5" [class.under]="l.overpricedPct! < -5">
                      {{ l.overpricedPct | pct }}
                    </span>
                  } @else {
                    <span class="muted">–</span>
                  }
                </td>
                <td>{{ statusBg[l.currentStatus] }} · {{ typeSaleBg[l.listingType] }}</td>
                <td class="num muted">{{ fmtDateBg(l.firstSeenDate) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <div class="pager">
        <button class="btn" [disabled]="r.page <= 1" (click)="page.set(r.page - 1)">← Назад</button>
        <span>стр. {{ r.page }} / {{ totalPages() }}</span>
        <button class="btn" [disabled]="r.page >= totalPages()" (click)="page.set(r.page + 1)">Напред →</button>
      </div>
    } @else {
      <p class="loading">Зареждане на обявите…</p>
    }
  `,
  styles: `
    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 0.7rem;
      margin-bottom: 1rem;
    }
    .count { color: var(--muted); font-size: 0.85rem; }
    .strong { font-weight: 700; }
    .muted { color: var(--muted); }
    .sub-price { font-size: 0.7rem; color: var(--muted); font-weight: 400; }
    .sortable { cursor: pointer; user-select: none; }
    .sortable.on { color: var(--accent); }
    .pager {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      margin-top: 1.2rem;
      font-size: 0.85rem;
      color: var(--muted);
    }
    .loading { color: var(--muted); padding: 3rem 0; }
  `,
})
export class ListingsPage {
  private readonly data = inject(PropertyDataProvider);
  private readonly route = inject(ActivatedRoute);

  readonly propertyTypes: PropertyType[] = ['studio', 'one-bed', 'two-bed', 'three-plus', 'maisonette', 'house'];
  readonly constructions: ConstructionType[] = ['brick', 'panel', 'epk', 'other'];
  readonly typeBg = PROPERTY_TYPE_BG;
  readonly constructionBg = CONSTRUCTION_BG;
  readonly statusBg = STATUS_BG;
  readonly typeSaleBg = LISTING_TYPE_BG;
  readonly fmtDateBg = fmtDateBg;

  readonly city = signal<string | undefined>(undefined);
  readonly neighborhoodId = signal<number | undefined>(undefined);
  readonly propertyType = signal<PropertyType | undefined>(undefined);
  readonly construction = signal<ConstructionType | undefined>(undefined);
  readonly listingType = signal<ListingType | undefined>(undefined);
  readonly status = signal<ListingStatus | undefined>(undefined);
  readonly minPrice = signal<number | undefined>(undefined);
  readonly maxPrice = signal<number | undefined>(undefined);
  readonly minArea = signal<number | undefined>(undefined);
  readonly maxArea = signal<number | undefined>(undefined);
  readonly sort = signal<SortKey>('ppm2');
  readonly dir = signal<'asc' | 'desc'>('desc');
  readonly page = signal(1);

  readonly meta = toSignal(this.data.meta());

  readonly neighborhoods = computed<Neighborhood[]>(() => {
    const m = this.meta();
    const slug = this.city();
    if (!m || !slug) return [];
    return m.cities.find((c) => c.slug === slug)?.neighborhoods ?? [];
  });

  private readonly filter = computed<ListingsFilter>(() => ({
    city: this.city(),
    neighborhoodId: this.neighborhoodId(),
    propertyType: this.propertyType(),
    construction: this.construction(),
    listingType: this.listingType(),
    status: this.status(),
    minPrice: this.minPrice(),
    maxPrice: this.maxPrice(),
    minArea: this.minArea(),
    maxArea: this.maxArea(),
    sort: this.sort(),
    dir: this.dir(),
    page: this.page(),
    pageSize: 25,
  }));

  readonly result = toSignal(
    toObservable(this.filter).pipe(
      debounceTime(120),
      switchMap((f) => this.data.listings(f)),
    ),
  );

  readonly totalPages = computed(() => {
    const r = this.result();
    return r ? Math.max(1, Math.ceil(r.total / r.pageSize)) : 1;
  });

  constructor(title: Title, metaSrv: Meta) {
    title.setTitle('Обяви — аналитична таблица | ИмотиПулс');
    metaSrv.updateTag({
      name: 'description',
      content: 'Филтрирай обяви за имоти по град, квартал, тип и цена — с дни на пазара, отстъпки и хедонична оценка.',
    });
    const qp = this.route.snapshot.queryParamMap;
    if (qp.get('city')) this.city.set(qp.get('city')!);
  }

  setCity(slug: string): void {
    this.city.set(slug || undefined);
    this.neighborhoodId.set(undefined);
    this.page.set(1);
  }

  sortBy(key: SortKey): void {
    if (this.sort() === key) {
      this.dir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sort.set(key);
      this.dir.set('desc');
    }
    this.page.set(1);
  }

  arrow(key: SortKey): string {
    return this.sort() === key ? (this.dir() === 'asc' ? '↑' : '↓') : '';
  }

  toNum(v: string): number | undefined {
    return v === '' ? undefined : Number(v);
  }

  orU<T extends string>(v: string): T | undefined {
    return (v || undefined) as T | undefined;
  }
}
