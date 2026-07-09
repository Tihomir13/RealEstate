/** Bulgarian UI labels for English domain values + BG number formatting. */
import {
  BGN_PER_EUR,
  ConstructionType,
  ListingStatus,
  ListingType,
  PropertyType,
} from '../models/domain.models';

export const PROPERTY_TYPE_BG: Record<PropertyType, string> = {
  'studio': '1-стаен',
  'one-bed': '2-стаен',
  'two-bed': '3-стаен',
  'three-plus': '4+ стаен',
  'maisonette': 'Мезонет',
  'house': 'Къща',
};

export const CONSTRUCTION_BG: Record<ConstructionType, string> = {
  brick: 'Тухла',
  panel: 'Панел',
  epk: 'ЕПК',
  other: 'Друго',
};

export const STATUS_BG: Record<ListingStatus, string> = {
  active: 'Активна',
  reduced: 'Намалена',
  removed: 'Свалена',
};

export const LISTING_TYPE_BG: Record<ListingType, string> = {
  sale: 'Продажба',
  rent: 'Наем',
};

export const BUILD_BAND_BG: Record<string, string> = {
  'before-1975': 'преди 1975',
  '1975-1994': '1975–1994',
  '1995-2014': '1995–2014',
  '2015-plus': '2015+',
};

const nf0 = new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export function fmtInt(v: number | null | undefined): string {
  return v == null || !isFinite(v) ? '–' : nf0.format(v);
}

export function fmt1(v: number | null | undefined): string {
  return v == null || !isFinite(v) ? '–' : nf1.format(v);
}

export function fmt2(v: number | null | undefined): string {
  return v == null || !isFinite(v) ? '–' : nf2.format(v);
}

export function fmtEur(v: number | null | undefined): string {
  return v == null ? '–' : `${nf0.format(v)} €`;
}

export function fmtEurPerM2(v: number | null | undefined): string {
  return v == null ? '–' : `${nf0.format(v)} €/м²`;
}

export function fmtBgn(vEur: number | null | undefined): string {
  return vEur == null ? '–' : `${nf0.format(vEur * BGN_PER_EUR)} лв.`;
}

export function fmtPct(v: number | null | undefined, sign = true): string {
  if (v == null || !isFinite(v)) return '–';
  const s = sign && v > 0 ? '+' : '';
  return `${s}${nf1.format(v)}%`;
}

const MONTH_BG = ['яну', 'фев', 'мар', 'апр', 'май', 'юни', 'юли', 'авг', 'сеп', 'окт', 'ное', 'дек'];

/** '2026-06' → 'юни ’26'; '2026-Q2' → 'Q2 ’26'; '2026' stays. */
export function fmtPeriod(period: string): string {
  if (period.length === 4) return period;
  const [y, m] = period.split('-');
  if (m.startsWith('Q')) return `${m} ’${y.slice(2)}`;
  return `${MONTH_BG[Number(m) - 1]} ’${y.slice(2)}`;
}

export function fmtDateBg(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}.${m}.${y}`;
}
