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
  lat: number; // approximate real-world latitude
  lng: number; // approximate real-world longitude
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
  lat: number; // approximate real-world city-center latitude
  lng: number; // approximate real-world city-center longitude
  neighborhoods: NeighborhoodSeed[];
}

export const CITY_SEEDS: CitySeed[] = [
  {
    slug: 'sofia', name: 'София', region: 'yugozapaden', population: 1280000,
    annualGrowthPct: 14, yield: 0.0042, incomeFactor: 1.28, investmentPeakPct: 36, listingsScale: 1,
    lat: 42.6977, lng: 23.3219,
    neighborhoods: [
      { name: 'Център', base: 3050, distanceKm: 0.5, lat: 42.6952, lng: 23.3225 },
      { name: 'Лозенец', base: 2750, distanceKm: 2.2, lat: 42.6769, lng: 23.3253 },
      { name: 'Изток', base: 2600, distanceKm: 3.0, lat: 42.6700, lng: 23.3450 },
      { name: 'Витоша', base: 2150, distanceKm: 7.5, lat: 42.6350, lng: 23.2800 },
      { name: 'Младост', base: 1950, distanceKm: 8.0, lat: 42.6480, lng: 23.3800 },
      { name: 'Дружба', base: 1650, distanceKm: 8.5, lat: 42.6550, lng: 23.4200 },
      { name: 'Надежда', base: 1580, distanceKm: 6.0, lat: 42.7350, lng: 23.3000 },
      { name: 'Люлин', base: 1450, distanceKm: 9.0, lat: 42.7100, lng: 23.2450 },
    ],
  },
  {
    slug: 'plovdiv', name: 'Пловдив', region: 'yuzhen-tsentralen', population: 343000,
    annualGrowthPct: 11, yield: 0.0048, incomeFactor: 1.06, investmentPeakPct: 28, listingsScale: 0.5,
    lat: 42.1354, lng: 24.7453,
    neighborhoods: [
      { name: 'Стария град', base: 1680, distanceKm: 0.4, lat: 42.1500, lng: 24.7550 },
      { name: 'Каменица', base: 1550, distanceKm: 1.5, lat: 42.1280, lng: 24.7550 },
      { name: 'Кършияка', base: 1380, distanceKm: 2.5, lat: 42.1550, lng: 24.7350 },
      { name: 'Смирненски', base: 1300, distanceKm: 3.5, lat: 42.1450, lng: 24.7150 },
      { name: 'Тракия', base: 1220, distanceKm: 5.0, lat: 42.1300, lng: 24.7900 },
      { name: 'Столипиново', base: 1050, distanceKm: 4.0, lat: 42.1650, lng: 24.7700 },
    ],
  },
  {
    slug: 'varna', name: 'Варна', region: 'severoiztochen', population: 336000,
    annualGrowthPct: 12.5, yield: 0.0046, incomeFactor: 1.12, investmentPeakPct: 34, listingsScale: 0.5,
    lat: 43.2141, lng: 27.9147,
    neighborhoods: [
      { name: 'Гръцка махала', base: 2080, distanceKm: 0.3, lat: 43.2100, lng: 27.9150 },
      { name: 'Бриз', base: 1950, distanceKm: 4.5, lat: 43.1850, lng: 27.9100 },
      { name: 'Чайка', base: 1800, distanceKm: 3.0, lat: 43.2350, lng: 27.9350 },
      { name: 'Левски', base: 1560, distanceKm: 2.5, lat: 43.2050, lng: 27.8950 },
      { name: 'Аспарухово', base: 1320, distanceKm: 4.0, lat: 43.1750, lng: 27.8850 },
      { name: 'Владислав Варненчик', base: 1230, distanceKm: 7.0, lat: 43.2200, lng: 27.8400 },
    ],
  },
  {
    slug: 'burgas', name: 'Бургас', region: 'yugoiztochen', population: 202000,
    annualGrowthPct: 11.5, yield: 0.0047, incomeFactor: 1.08, investmentPeakPct: 33, listingsScale: 0.4,
    lat: 42.5048, lng: 27.4626,
    neighborhoods: [
      { name: 'Центъра', base: 1850, distanceKm: 0.4, lat: 42.5048, lng: 27.4626 },
      { name: 'Лазур', base: 1720, distanceKm: 1.8, lat: 42.4950, lng: 27.4750 },
      { name: 'Възраждане', base: 1500, distanceKm: 1.2, lat: 42.4980, lng: 27.4550 },
      { name: 'Славейков', base: 1350, distanceKm: 3.5, lat: 42.4800, lng: 27.4700 },
      { name: 'Меден рудник', base: 1180, distanceKm: 6.0, lat: 42.4700, lng: 27.4350 },
    ],
  },
  {
    slug: 'ruse', name: 'Русе', region: 'severen-tsentralen', population: 138000,
    annualGrowthPct: 9, yield: 0.0052, incomeFactor: 1.0, investmentPeakPct: 22, listingsScale: 0.28,
    lat: 43.8564, lng: 25.9709,
    neighborhoods: [
      { name: 'Център', base: 1280, distanceKm: 0.4, lat: 43.8564, lng: 25.9709 },
      { name: 'Възраждане', base: 1120, distanceKm: 1.5, lat: 43.8480, lng: 25.9600 },
      { name: 'Здравец', base: 1000, distanceKm: 3.0, lat: 43.8350, lng: 25.9500 },
      { name: 'Дружба', base: 900, distanceKm: 4.5, lat: 43.8250, lng: 25.9800 },
    ],
  },
  {
    slug: 'stara-zagora', name: 'Стара Загора', region: 'yugoiztochen', population: 121000,
    annualGrowthPct: 9.5, yield: 0.0052, incomeFactor: 1.02, investmentPeakPct: 22, listingsScale: 0.26,
    lat: 42.4258, lng: 25.6345,
    neighborhoods: [
      { name: 'Център', base: 1300, distanceKm: 0.3, lat: 42.4258, lng: 25.6345 },
      { name: 'Аязмото', base: 1150, distanceKm: 1.8, lat: 42.4150, lng: 25.6500 },
      { name: 'Три чучура', base: 1020, distanceKm: 3.0, lat: 42.4400, lng: 25.6150 },
      { name: 'Железник', base: 920, distanceKm: 4.5, lat: 42.4450, lng: 25.6600 },
    ],
  },
  {
    slug: 'pleven', name: 'Плевен', region: 'severozapaden', population: 89000,
    annualGrowthPct: 7.5, yield: 0.0056, incomeFactor: 0.96, investmentPeakPct: 18, listingsScale: 0.2,
    lat: 43.4170, lng: 24.6067,
    neighborhoods: [
      { name: 'Център', base: 1050, distanceKm: 0.3, lat: 43.4170, lng: 24.6067 },
      { name: 'Дружба', base: 880, distanceKm: 2.5, lat: 43.4300, lng: 24.5900 },
      { name: 'Сторгозия', base: 800, distanceKm: 3.5, lat: 43.4050, lng: 24.5850 },
      { name: '9-ти квартал', base: 760, distanceKm: 2.0, lat: 43.4050, lng: 24.6250 },
    ],
  },
  {
    slug: 'veliko-tarnovo', name: 'Велико Търново', region: 'severen-tsentralen', population: 67000,
    annualGrowthPct: 9, yield: 0.0050, incomeFactor: 1.0, investmentPeakPct: 26, listingsScale: 0.18,
    lat: 43.0757, lng: 25.6172,
    neighborhoods: [
      { name: 'Старият град', base: 1250, distanceKm: 0.5, lat: 43.0800, lng: 25.6280 },
      { name: 'Център', base: 1200, distanceKm: 0.8, lat: 43.0757, lng: 25.6172 },
      { name: 'Колю Фичето', base: 1000, distanceKm: 2.5, lat: 43.0900, lng: 25.6050 },
      { name: 'Бузлуджа', base: 950, distanceKm: 2.0, lat: 43.0650, lng: 25.6350 },
    ],
  },
  {
    slug: 'blagoevgrad', name: 'Благоевград', region: 'yugozapaden', population: 68000,
    annualGrowthPct: 8.5, yield: 0.0052, incomeFactor: 0.98, investmentPeakPct: 22, listingsScale: 0.17,
    lat: 42.0195, lng: 23.0942,
    neighborhoods: [
      { name: 'Център', base: 1180, distanceKm: 0.3, lat: 42.0195, lng: 23.0942 },
      { name: 'Вароша', base: 1100, distanceKm: 0.8, lat: 42.0230, lng: 23.0980 },
      { name: 'Еленово', base: 950, distanceKm: 2.5, lat: 42.0350, lng: 23.1000 },
      { name: 'Струмско', base: 880, distanceKm: 3.0, lat: 42.0000, lng: 23.0850 },
    ],
  },
  {
    slug: 'dobrich', name: 'Добрич', region: 'severoiztochen', population: 78000,
    annualGrowthPct: 7, yield: 0.0058, incomeFactor: 0.95, investmentPeakPct: 20, listingsScale: 0.16,
    lat: 43.5726, lng: 27.8273,
    neighborhoods: [
      { name: 'Център', base: 950, distanceKm: 0.3, lat: 43.5726, lng: 27.8273 },
      { name: 'Дружба', base: 820, distanceKm: 2.0, lat: 43.5850, lng: 27.8300 },
      { name: 'Строител', base: 780, distanceKm: 2.8, lat: 43.5600, lng: 27.8400 },
      { name: 'Балик', base: 740, distanceKm: 3.2, lat: 43.5850, lng: 27.8450 },
    ],
  },
  {
    slug: 'shumen', name: 'Шумен', region: 'severoiztochen', population: 72000,
    annualGrowthPct: 7.5, yield: 0.0056, incomeFactor: 0.96, investmentPeakPct: 19, listingsScale: 0.16,
    lat: 43.2706, lng: 26.9224,
    neighborhoods: [
      { name: 'Център', base: 980, distanceKm: 0.3, lat: 43.2706, lng: 26.9224 },
      { name: 'Добруджански', base: 850, distanceKm: 1.8, lat: 43.2600, lng: 26.9350 },
      { name: 'Тракия', base: 800, distanceKm: 2.5, lat: 43.2550, lng: 26.9100 },
      { name: 'Боян Българанов', base: 760, distanceKm: 3.0, lat: 43.2850, lng: 26.9300 },
    ],
  },
  {
    slug: 'haskovo', name: 'Хасково', region: 'yuzhen-tsentralen', population: 67000,
    annualGrowthPct: 7, yield: 0.0058, incomeFactor: 0.95, investmentPeakPct: 18, listingsScale: 0.15,
    lat: 41.9344, lng: 25.5551,
    neighborhoods: [
      { name: 'Център', base: 920, distanceKm: 0.3, lat: 41.9344, lng: 25.5551 },
      { name: 'Куба', base: 820, distanceKm: 1.5, lat: 41.9450, lng: 25.5650 },
      { name: 'Орфей', base: 760, distanceKm: 2.5, lat: 41.9250, lng: 25.5450 },
      { name: 'Бадема', base: 720, distanceKm: 3.0, lat: 41.9200, lng: 25.5700 },
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
