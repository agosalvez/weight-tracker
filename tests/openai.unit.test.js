// Unit tests for utils/openai (sanitize pure + parseFreeText with mocked fetch)
const { sanitizeItems, parseFreeText, isConfigured } = require('../utils/openai');

describe('utils/openai', () => {
  describe('sanitizeItems', () => {
    it('filtra items sin nombre, sin gramos válidos o con kcal absurdas', () => {
      const r = sanitizeItems({ items: [
        { name: 'Pan tostado', grams: 60, kcal_per_100g: 290 },
        { name: '', grams: 50, kcal_per_100g: 100 },        // sin nombre
        { name: 'X', grams: 0, kcal_per_100g: 100 },        // gramos 0
        { name: 'Y', grams: 50, kcal_per_100g: 5000 },      // kcal absurda
      ] });
      expect(r).toEqual([{ name: 'Pan tostado', grams: 60, kcal_per_100g: 290 }]);
    });

    it('redondea gramos y kcal', () => {
      expect(sanitizeItems({ items: [{ name: 'A', grams: 59.6, kcal_per_100g: 289.4 }] }))
        .toEqual([{ name: 'A', grams: 60, kcal_per_100g: 289 }]);
    });

    it('devuelve [] si no hay items', () => {
      expect(sanitizeItems({})).toEqual([]);
      expect(sanitizeItems(null)).toEqual([]);
    });
  });

  describe('parseFreeText', () => {
    const OLD = process.env.OPENAI_API_KEY;
    afterEach(() => { process.env.OPENAI_API_KEY = OLD; delete global.fetch; });

    it('lanza NO_KEY si no hay API key', async () => {
      delete process.env.OPENAI_API_KEY;
      await expect(parseFreeText('pan')).rejects.toMatchObject({ code: 'NO_KEY' });
    });

    it('parsea la respuesta del modelo', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"items":[{"name":"Pan tostado","grams":60,"kcal_per_100g":290}]}' } }],
          usage: { prompt_tokens: 80, completion_tokens: 30 },
        }),
      });
      const r = await parseFreeText('pan tostado 60 gramos');
      expect(r.items).toEqual([{ name: 'Pan tostado', grams: 60, kcal_per_100g: 290 }]);
      expect(r.usage.prompt_tokens).toBe(80);
    });

    it('lanza OPENAI_ERROR si la API responde mal', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });
      await expect(parseFreeText('pan')).rejects.toMatchObject({ code: 'OPENAI_ERROR' });
    });

    it('devuelve [] si el modelo devuelve JSON no parseable', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      global.fetch = jest.fn().mockResolvedValue({
        ok: true, json: async () => ({ choices: [{ message: { content: 'no es json' } }] }),
      });
      const r = await parseFreeText('pan');
      expect(r.items).toEqual([]);
    });
  });
});
