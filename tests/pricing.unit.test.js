const { computeCostEur, formatEur } = require('../utils/pricing');

describe('utils/pricing', () => {
  const OLD = process.env.USD_TO_EUR;
  beforeEach(() => { process.env.USD_TO_EUR = '0.92'; });
  afterEach(() => { process.env.USD_TO_EUR = OLD; });

  it('calcula el coste de gpt-4o-mini', () => {
    // 1000 in, 500 out → (1000/1e6*0.15 + 500/1e6*0.60) = 0.00015+0.0003=0.00045 usd → *0.92
    expect(computeCostEur('gpt-4o-mini', 1000, 500)).toBeCloseTo(0.000414, 6);
  });

  it('usa precios distintos para gpt-4o', () => {
    const mini = computeCostEur('gpt-4o-mini', 1000, 1000);
    const big  = computeCostEur('gpt-4o', 1000, 1000);
    expect(big).toBeGreaterThan(mini);
  });

  it('cae al fallback con modelo desconocido', () => {
    expect(computeCostEur('modelo-raro', 1000, 500))
      .toBe(computeCostEur('gpt-4o-mini', 1000, 500));
  });

  it('maneja tokens nulos/negativos como 0', () => {
    expect(computeCostEur('gpt-4o-mini', null, undefined)).toBe(0);
    expect(computeCostEur('gpt-4o-mini', -50, -10)).toBe(0);
  });

  it('respeta USD_TO_EUR del entorno', () => {
    process.env.USD_TO_EUR = '1';
    const a = computeCostEur('gpt-4o', 1e6, 0); // 2.50 usd → 2.50 eur
    expect(a).toBeCloseTo(2.5, 6);
  });

  it('formatEur muestra 4 decimales para importes diminutos', () => {
    expect(formatEur(0.0004)).toBe('0.0004 €');
    expect(formatEur(1.234)).toBe('1.23 €');
    expect(formatEur(0)).toBe('0.00 €');
  });
});
