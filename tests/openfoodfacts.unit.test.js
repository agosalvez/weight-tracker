// Unit tests for utils/openfoodfacts (pure mapping + mocked network)
const { mapProduct, buildSearchUrl, buildBarcodeUrl, searchByName, getByBarcode } = require('../utils/openfoodfacts');

function mockFetchOnce(jsonBody, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    json: async () => jsonBody,
  });
}

describe('utils/openfoodfacts', () => {
  describe('mapProduct', () => {
    it('mapea un producto completo a nuestro schema', () => {
      const off = {
        code: '8410188012345',
        product_name: 'Tomate frito',
        brands: 'Orlando',
        nutriments: {
          'energy-kcal_100g': 86,
          proteins_100g: 1.5,
          carbohydrates_100g: 10,
          fat_100g: 4.2,
        },
      };
      const f = mapProduct(off);
      expect(f).toEqual({
        name: 'Tomate frito',
        brand: 'Orlando',
        barcode: '8410188012345',
        kcal_per_100g: 86,
        protein_g: 1.5,
        carbs_g: 10,
        fat_g: 4.2,
        source: 'barcode',
        confidence: 95,
      });
    });

    it('devuelve null si no hay nombre', () => {
      expect(mapProduct({ code: '1', nutriments: { 'energy-kcal_100g': 50 } })).toBeNull();
    });

    it('devuelve null si no hay kcal/100g', () => {
      expect(mapProduct({ code: '1', product_name: 'X', nutriments: {} })).toBeNull();
    });

    it('redondea kcal y usa product_name_es si existe', () => {
      const off = {
        code: '2',
        product_name: 'Milk',
        product_name_es: 'Leche entera',
        nutriments: { 'energy-kcal_100g': 64.4 },
      };
      const f = mapProduct(off);
      expect(f.name).toBe('Leche entera');
      expect(f.kcal_per_100g).toBe(64);
    });

    it('macros ausentes quedan a null', () => {
      const off = { code: '3', product_name: 'X', nutriments: { 'energy-kcal_100g': 100 } };
      const f = mapProduct(off);
      expect(f.protein_g).toBeNull();
      expect(f.carbs_g).toBeNull();
      expect(f.fat_g).toBeNull();
    });

    it('marca vacía queda a null y recorta nombres largos', () => {
      const off = { code: '4', product_name: 'A'.repeat(200), brands: '', nutriments: { 'energy-kcal_100g': 100 } };
      const f = mapProduct(off);
      expect(f.brand).toBeNull();
      expect(f.name.length).toBeLessThanOrEqual(120);
    });
  });

  describe('buildSearchUrl', () => {
    it('escapa el término de búsqueda', () => {
      const url = buildSearchUrl('jamón york');
      expect(url).toContain('search_terms=jam%C3%B3n+york');
      expect(url).toContain('json=1');
    });
  });

  describe('buildBarcodeUrl', () => {
    it('construye la URL del producto por código', () => {
      const url = buildBarcodeUrl('8410188012345');
      expect(url).toContain('/api/v2/product/8410188012345.json');
    });
  });

  describe('searchByName (fetch mockeado)', () => {
    afterEach(() => { delete global.fetch; });

    it('devuelve productos mapeados y filtra los inválidos', async () => {
      mockFetchOnce({ products: [
        { code: '1', product_name: 'Yogur natural', nutriments: { 'energy-kcal_100g': 60 } },
        { code: '2', product_name: 'Sin kcal', nutriments: {} },         // se filtra
        { code: '3', product_name: '', nutriments: { 'energy-kcal_100g': 5 } }, // se filtra
      ] });
      const res = await searchByName('yogur');
      expect(res).toHaveLength(1);
      expect(res[0].name).toBe('Yogur natural');
    });

    it('deduplica por nombre+marca', async () => {
      mockFetchOnce({ products: [
        { code: '1', product_name: 'Leche', brands: 'Pascual', nutriments: { 'energy-kcal_100g': 64 } },
        { code: '2', product_name: 'leche', brands: 'pascual', nutriments: { 'energy-kcal_100g': 65 } },
      ] });
      const res = await searchByName('leche');
      expect(res).toHaveLength(1);
    });

    it('devuelve [] si la respuesta no trae products', async () => {
      mockFetchOnce({});
      expect(await searchByName('x')).toEqual([]);
    });

    it('devuelve [] si fetch falla', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network'));
      expect(await searchByName('x')).toEqual([]);
    });

    it('respeta el límite', async () => {
      const products = Array.from({ length: 30 }, (_, i) => ({
        code: String(i), product_name: 'P' + i, nutriments: { 'energy-kcal_100g': 100 },
      }));
      mockFetchOnce({ products });
      const res = await searchByName('p', 5);
      expect(res).toHaveLength(5);
    });
  });

  describe('getByBarcode (fetch mockeado)', () => {
    afterEach(() => { delete global.fetch; });

    it('devuelve el producto cuando status=1', async () => {
      mockFetchOnce({ status: 1, code: '8410188012345', product: {
        product_name: 'Tomate frito', brands: 'Orlando', nutriments: { 'energy-kcal_100g': 86 },
      } });
      const f = await getByBarcode('8410188012345');
      expect(f.name).toBe('Tomate frito');
      expect(f.barcode).toBe('8410188012345');
    });

    it('devuelve null si status!=1 (no encontrado)', async () => {
      mockFetchOnce({ status: 0 });
      expect(await getByBarcode('0000')).toBeNull();
    });

    it('devuelve null si fetch falla', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network'));
      expect(await getByBarcode('123')).toBeNull();
    });
  });
});
