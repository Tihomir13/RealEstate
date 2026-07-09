/**
 * Seed geography: cities, neighborhoods, realistic €/m² anchors (sale),
 * distance from center and macro-region mapping.
 *
 * Anchors follow the brief: Sofia center ~2000–3500, Sofia outer ~1300–2000,
 * Varna ~1200–2100, Plovdiv ~1100–1700, Burgas ~1200–1900, regional ~700–1300.
 */

export interface NeighborhoodSeed {
  name: string;
  base: number; // €/m² sale anchor at series start
  distanceKm: number;
}

export interface CitySeed {
  slug: string;
  name: string;
  region: string; // NSI region
  population: number;
  annualGrowthPct: number; // baseline yearly price growth (2024–2025 pace)
  yield: number; // monthly rent as share of sale €/m² (0.004–0.006)
  /** City median net income relative to its NSI region (Sofia > region avg). */
  incomeFactor: number;
  /** Share of investment-intent buyers at the 2021–22 peak (%). */
  investmentPeakPct: number;
  listingsScale: number; // relative market size
  neighborhoods: NeighborhoodSeed[];
}

export const CITY_SEEDS: CitySeed[] = [
  {
    slug: 'sofia', name: 'София', region: 'yugozapaden', population: 1280000,
    annualGrowthPct: 14, yield: 0.0042, incomeFactor: 1.28, investmentPeakPct: 36, listingsScale: 1,
    neighborhoods: [
      { name: 'Център', base: 3050, distanceKm: 0.5 },
      { name: 'Лозенец', base: 2750, distanceKm: 2.2 },
      { name: 'Изток', base: 2600, distanceKm: 3.0 },
      { name: 'Витоша', base: 2150, distanceKm: 7.5 },
      { name: 'Младост', base: 1950, distanceKm: 8.0 },
      { name: 'Дружба', base: 1650, distanceKm: 8.5 },
      { name: 'Надежда', base: 1580, distanceKm: 6.0 },
      { name: 'Люлин', base: 1450, distanceKm: 9.0 },
    ],
  },
  {
    slug: 'plovdiv', name: 'Пловдив', region: 'yuzhen-tsentralen', population: 343000,
    annualGrowthPct: 11, yield: 0.0048, incomeFactor: 1.06, investmentPeakPct: 28, listingsScale: 0.5,
    neighborhoods: [
      { name: 'Стария град', base: 1680, distanceKm: 0.4 },
      { name: 'Каменица', base: 1550, distanceKm: 1.5 },
      { name: 'Кършияка', base: 1380, distanceKm: 2.5 },
      { name: 'Смирненски', base: 1300, distanceKm: 3.5 },
      { name: 'Тракия', base: 1220, distanceKm: 5.0 },
      { name: 'Столипиново', base: 1050, distanceKm: 4.0 },
    ],
  },
  {
    slug: 'varna', name: 'Варна', region: 'severoiztochen', population: 336000,
    annualGrowthPct: 12.5, yield: 0.0046, incomeFactor: 1.12, investmentPeakPct: 34, listingsScale: 0.5,
    neighborhoods: [
      { name: 'Гръцка махала', base: 2080, distanceKm: 0.3 },
      { name: 'Бриз', base: 1950, distanceKm: 4.5 },
      { name: 'Чайка', base: 1800, distanceKm: 3.0 },
      { name: 'Левски', base: 1560, distanceKm: 2.5 },
      { name: 'Аспарухово', base: 1320, distanceKm: 4.0 },
      { name: 'Владислав Варненчик', base: 1230, distanceKm: 7.0 },
    ],
  },
  {
    slug: 'burgas', name: 'Бургас', region: 'yugoiztochen', population: 202000,
    annualGrowthPct: 11.5, yield: 0.0047, incomeFactor: 1.08, investmentPeakPct: 33, listingsScale: 0.4,
    neighborhoods: [
      { name: 'Центъра', base: 1850, distanceKm: 0.4 },
      { name: 'Лазур', base: 1720, distanceKm: 1.8 },
      { name: 'Възраждане', base: 1500, distanceKm: 1.2 },
      { name: 'Славейков', base: 1350, distanceKm: 3.5 },
      { name: 'Меден рудник', base: 1180, distanceKm: 6.0 },
    ],
  },
  {
    slug: 'ruse', name: 'Русе', region: 'severen-tsentralen', population: 138000,
    annualGrowthPct: 9, yield: 0.0052, incomeFactor: 1.0, investmentPeakPct: 22, listingsScale: 0.28,
    neighborhoods: [
      { name: 'Център', base: 1280, distanceKm: 0.4 },
      { name: 'Възраждане', base: 1120, distanceKm: 1.5 },
      { name: 'Здравец', base: 1000, distanceKm: 3.0 },
      { name: 'Дружба', base: 900, distanceKm: 4.5 },
    ],
  },
  {
    slug: 'stara-zagora', name: 'Стара Загора', region: 'yugoiztochen', population: 121000,
    annualGrowthPct: 9.5, yield: 0.0052, incomeFactor: 1.02, investmentPeakPct: 22, listingsScale: 0.26,
    neighborhoods: [
      { name: 'Център', base: 1300, distanceKm: 0.3 },
      { name: 'Аязмото', base: 1150, distanceKm: 1.8 },
      { name: 'Три чучура', base: 1020, distanceKm: 3.0 },
      { name: 'Железник', base: 920, distanceKm: 4.5 },
    ],
  },
  {
    slug: 'pleven', name: 'Плевен', region: 'severozapaden', population: 89000,
    annualGrowthPct: 7.5, yield: 0.0056, incomeFactor: 0.96, investmentPeakPct: 18, listingsScale: 0.2,
    neighborhoods: [
      { name: 'Център', base: 1050, distanceKm: 0.3 },
      { name: 'Дружба', base: 880, distanceKm: 2.5 },
      { name: 'Сторгозия', base: 800, distanceKm: 3.5 },
      { name: '9-ти квартал', base: 760, distanceKm: 2.0 },
    ],
  },
  {
    slug: 'veliko-tarnovo', name: 'Велико Търново', region: 'severen-tsentralen', population: 67000,
    annualGrowthPct: 9, yield: 0.0050, incomeFactor: 1.0, investmentPeakPct: 26, listingsScale: 0.18,
    neighborhoods: [
      { name: 'Старият град', base: 1250, distanceKm: 0.5 },
      { name: 'Център', base: 1200, distanceKm: 0.8 },
      { name: 'Колю Фичето', base: 1000, distanceKm: 2.5 },
      { name: 'Бузлуджа', base: 950, distanceKm: 2.0 },
    ],
  },
  {
    slug: 'blagoevgrad', name: 'Благоевград', region: 'yugozapaden', population: 68000,
    annualGrowthPct: 8.5, yield: 0.0052, incomeFactor: 0.98, investmentPeakPct: 22, listingsScale: 0.17,
    neighborhoods: [
      { name: 'Център', base: 1180, distanceKm: 0.3 },
      { name: 'Вароша', base: 1100, distanceKm: 0.8 },
      { name: 'Еленово', base: 950, distanceKm: 2.5 },
      { name: 'Струмско', base: 880, distanceKm: 3.0 },
    ],
  },
  {
    slug: 'dobrich', name: 'Добрич', region: 'severoiztochen', population: 78000,
    annualGrowthPct: 7, yield: 0.0058, incomeFactor: 0.95, investmentPeakPct: 20, listingsScale: 0.16,
    neighborhoods: [
      { name: 'Център', base: 950, distanceKm: 0.3 },
      { name: 'Дружба', base: 820, distanceKm: 2.0 },
      { name: 'Строител', base: 780, distanceKm: 2.8 },
      { name: 'Балик', base: 740, distanceKm: 3.2 },
    ],
  },
  {
    slug: 'shumen', name: 'Шумен', region: 'severoiztochen', population: 72000,
    annualGrowthPct: 7.5, yield: 0.0056, incomeFactor: 0.96, investmentPeakPct: 19, listingsScale: 0.16,
    neighborhoods: [
      { name: 'Център', base: 980, distanceKm: 0.3 },
      { name: 'Добруджански', base: 850, distanceKm: 1.8 },
      { name: 'Тракия', base: 800, distanceKm: 2.5 },
      { name: 'Боян Българанов', base: 760, distanceKm: 3.0 },
    ],
  },
  {
    slug: 'haskovo', name: 'Хасково', region: 'yuzhen-tsentralen', population: 67000,
    annualGrowthPct: 7, yield: 0.0058, incomeFactor: 0.95, investmentPeakPct: 18, listingsScale: 0.15,
    neighborhoods: [
      { name: 'Център', base: 920, distanceKm: 0.3 },
      { name: 'Куба', base: 820, distanceKm: 1.5 },
      { name: 'Орфей', base: 760, distanceKm: 2.5 },
      { name: 'Бадема', base: 720, distanceKm: 3.0 },
    ],
  },
];

/** NSI-style regions with median annual net income anchors (€/year, 2024). */
export const REGION_SEEDS: Record<string, { name: string; income2024: number; incomeGrowthPct: number }> = {
  'yugozapaden': { name: 'Югозападен', income2024: 13800, incomeGrowthPct: 8.5 },
  'yuzhen-tsentralen': { name: 'Южен централен', income2024: 9600, incomeGrowthPct: 7.5 },
  'severoiztochen': { name: 'Североизточен', income2024: 9900, incomeGrowthPct: 7.8 },
  'yugoiztochen': { name: 'Югоизточен', income2024: 10100, incomeGrowthPct: 7.6 },
  'severen-tsentralen': { name: 'Северен централен', income2024: 8900, incomeGrowthPct: 7.2 },
  'severozapaden': { name: 'Северозападен', income2024: 8200, incomeGrowthPct: 6.8 },
};
