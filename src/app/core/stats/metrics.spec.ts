import {
  absorptionMonths,
  affordabilityYears,
  average,
  centerDistanceGradient,
  daysBetween,
  fitHedonic,
  median,
  momentum,
  momPct,
  overheatingScore,
  pctChange,
  rentalYieldPct,
  toYearly,
  yoyPct,
} from './metrics';

describe('metrics (pure functions)', () => {
  it('median handles odd, even and empty inputs', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNaN();
  });

  it('average', () => {
    expect(average([2, 4, 6])).toBe(4);
  });

  it('pctChange guards against zero base', () => {
    expect(pctChange(110, 100)).toBeCloseTo(10);
    expect(pctChange(1, 0)).toBeNull();
  });

  it('momPct / yoyPct read the right lags', () => {
    const s = Array.from({ length: 13 }, (_, i) => ({
      period: `2025-${String(i + 1).padStart(2, '0')}`,
      value: 100 + i,
    }));
    expect(momPct(s)).toBeCloseTo((112 - 111) / 111 * 100);
    expect(yoyPct(s, 'month')).toBeCloseTo(12);
    expect(yoyPct([{ period: '2024', value: 100 }, { period: '2025', value: 108 }], 'year')).toBeCloseTo(8);
  });

  it('toYearly reduces by median per year', () => {
    const yearly = toYearly([
      { period: '2024-01', value: 10 },
      { period: '2024-02', value: 30 },
      { period: '2025-01', value: 50 },
    ]);
    expect(yearly).toEqual([
      { period: '2024', value: 20 },
      { period: '2025', value: 50 },
    ]);
  });

  it('rentalYieldPct: 8 €/m²/mo on 1600 €/m² = 6%', () => {
    expect(rentalYieldPct(8, 1600)).toBeCloseTo(6);
    expect(rentalYieldPct(8, 0)).toBeNull();
  });

  it('absorptionMonths', () => {
    expect(absorptionMonths(300, 60)).toBe(5);
    expect(absorptionMonths(300, 0)).toBeNull();
  });

  it('affordabilityYears', () => {
    expect(affordabilityYears(120000, 12000)).toBe(10);
  });

  it('daysBetween', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
  });

  it('overheatingScore is 50 when balanced and clamped to [0,100]', () => {
    expect(overheatingScore(8, 8, 8)).toBe(50);
    expect(overheatingScore(30, 0, 0)).toBe(100);
    expect(overheatingScore(-30, 10, 10)).toBe(0);
  });

  it('momentum: accelerating series has positive momentum', () => {
    // MoM growth increases 1%, 2%, ..., so second derivative > 0
    const values = [100];
    for (let i = 1; i <= 10; i++) values.push(values[i - 1] * (1 + i / 100));
    const series = values.map((v, i) => ({ period: `p${i}`, value: v }));
    expect(momentum(series)).toBeGreaterThan(0);
  });

  it('centerDistanceGradient recovers a known decay', () => {
    // price = 2000 * e^(-0.1 * km)  →  slope ≈ -10 %/km
    const pts = [0, 1, 2, 4, 6].map((km) => ({
      distanceKm: km,
      medianEurPerM2: 2000 * Math.exp(-0.1 * km),
    }));
    expect(centerDistanceGradient(pts)).toBeCloseTo(-10, 0);
  });

  it('hedonic regression recovers categorical premiums', () => {
    // Synthetic: base 1000 €/m², neighborhood B has +20%, type "big" has -10%.
    const samples = [];
    for (let i = 0; i < 200; i++) {
      const nbhd = i % 2 ? 'A' : 'B';
      const type = i % 3 ? 'small' : 'big';
      let y = 1000 * (nbhd === 'B' ? 1.2 : 1) * (type === 'big' ? 0.9 : 1);
      y *= 1 + ((i % 7) - 3) / 500; // tiny noise
      samples.push({ y, categorical: [nbhd, type], numeric: [2000 + (i % 30), (i % 8) + 1] });
    }
    const model = fitHedonic(samples)!;
    const predB = model.predict({ categorical: ['B', 'small'], numeric: [2015, 4] });
    const predA = model.predict({ categorical: ['A', 'small'], numeric: [2015, 4] });
    expect(predB / predA).toBeCloseTo(1.2, 1);
  });
});

import {
  correlationDirection,
  deltaCorrelation,
  lastN,
  pearson,
  priceToRentYears,
  supplyPressure,
} from './metrics';

describe('macro metric additions', () => {
  it('priceToRentYears: 1800 €/m² at 9 €/m²/mo = ~16.7 years', () => {
    expect(priceToRentYears(1800, 9)).toBeCloseTo(16.67, 1);
    expect(priceToRentYears(1800, 0)).toBeNull();
  });

  it('pearson recovers perfect correlation and sign', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1);
    expect(pearson([1, 2], [1, 2])).toBeNull();
  });

  it('deltaCorrelation: rising rate with falling volume → negative', () => {
    // Varying step sizes so the deltas have variance (perfectly linear series
    // have constant deltas → undefined correlation).
    const step = (i: number) => 0.05 + (i % 4) * 0.04;
    const rate = Array.from({ length: 14 }, (_, i) => ({ period: `p${i}`, value: 2 + step(i) * i }));
    const volume = rate.map((p, i) => ({ period: `p${i}`, value: 500 - p.value * 60 }));
    const coef = deltaCorrelation(rate, volume, 12)!;
    expect(coef).toBeLessThan(-0.5);
    expect(correlationDirection(coef)).toBe('negative');
    expect(correlationDirection(0.05)).toBe('neutral');
  });

  it('supplyPressure = supply growth − price growth', () => {
    expect(supplyPressure(12, 8)).toBe(4);
    expect(supplyPressure(null, 8)).toBeNull();
  });

  it('lastN slices trailing window', () => {
    const s = [1, 2, 3, 4, 5].map((v, i) => ({ period: `p${i}`, value: v }));
    expect(lastN(s, 2).map((p) => p.value)).toEqual([4, 5]);
    expect(lastN(s, 0).length).toBe(5);
    expect(lastN(s, 99).length).toBe(5);
  });
});
