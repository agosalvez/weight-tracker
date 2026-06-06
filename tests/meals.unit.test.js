// Unit tests for utils/meals
const {
  MEAL_TYPES,
  computeEntryKcal,
  aggregateLegacyBuckets,
  normalize,
  fuzzyScore,
} = require('../utils/meals');

describe('utils/meals', () => {
  describe('MEAL_TYPES', () => {
    it('contiene los 6 tipos esperados en español', () => {
      expect(MEAL_TYPES).toEqual(['desayuno', 'almuerzo', 'comida', 'merienda', 'cena', 'snack']);
    });
  });

  describe('computeEntryKcal', () => {
    it('calcula correctamente kcal por gramos', () => {
      expect(computeEntryKcal({ kcal_per_100g: 250, grams: 80 })).toBe(200);
    });

    it('redondea al entero más cercano', () => {
      expect(computeEntryKcal({ kcal_per_100g: 264, grams: 33 })).toBe(87);
    });

    it('devuelve 0 si no hay gramos ni unidades', () => {
      expect(computeEntryKcal({ kcal_per_100g: 100 })).toBe(0);
    });

    it('calcula por unidades + grams_per_unit', () => {
      // 2 lonchas de 30g a 110 kcal/100g → 66 kcal
      expect(computeEntryKcal({ kcal_per_100g: 110, units: 2, grams_per_unit: 30 })).toBe(66);
    });

    it('prefiere gramos sobre unidades si ambos vienen', () => {
      expect(computeEntryKcal({ kcal_per_100g: 100, grams: 50, units: 5, grams_per_unit: 30 })).toBe(50);
    });
  });

  describe('aggregateLegacyBuckets', () => {
    it('suma desayuno y almuerzo en kcal_breakfast', () => {
      const r = aggregateLegacyBuckets([
        { meal_type: 'desayuno', kcal: 300 },
        { meal_type: 'almuerzo', kcal: 100 },
        { meal_type: 'comida',   kcal: 700 },
      ]);
      expect(r.kcal_breakfast).toBe(400);
      expect(r.kcal_lunch).toBe(700);
      expect(r.kcal_total).toBe(1100);
    });

    it('suma merienda y snack en kcal_snacks', () => {
      const r = aggregateLegacyBuckets([
        { meal_type: 'merienda', kcal: 150 },
        { meal_type: 'snack',    kcal: 50 },
      ]);
      expect(r.kcal_snacks).toBe(200);
      expect(r.kcal_total).toBe(200);
    });

    it('devuelve null en buckets vacíos (no 0) para no pisar el legacy', () => {
      const r = aggregateLegacyBuckets([]);
      expect(r.kcal_breakfast).toBeNull();
      expect(r.kcal_lunch).toBeNull();
      expect(r.kcal_dinner).toBeNull();
      expect(r.kcal_snacks).toBeNull();
      expect(r.kcal_total).toBeNull();
    });
  });

  describe('normalize', () => {
    it('quita acentos y pasa a minúsculas', () => {
      expect(normalize('Jamón')).toBe('jamon');
      expect(normalize('CAFÉ con leche')).toBe('cafe con leche');
    });

    it('colapsa espacios y elimina puntuación', () => {
      expect(normalize('  pan,  blanco!!! ')).toBe('pan blanco');
    });
  });

  describe('fuzzyScore', () => {
    it('puntúa exacto como 100', () => {
      expect(fuzzyScore('jamon york', 'Jamón York')).toBe(100);
    });

    it('puntúa prefix como 90', () => {
      expect(fuzzyScore('jamon', 'Jamón York El Pozo')).toBe(90);
    });

    it('puntúa substring como 75', () => {
      expect(fuzzyScore('york', 'Jamón York El Pozo')).toBe(75);
    });

    it('devuelve 0 si no hay match', () => {
      expect(fuzzyScore('plátano', 'jamon york')).toBe(0);
    });

    it('puntúa por tokens parciales cuando no hay substring', () => {
      // "jamon pavo" vs "pavo York" → "pavo" hit en tokens → 30
      const score = fuzzyScore('jamon pavo', 'Pavo York');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(75);
    });
  });
});
