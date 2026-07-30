import { describe, expect, it } from 'vitest';
import { applyFilterPatch, parseFilters, toListingQueryParams } from './filter-params';

describe('parseFilters — URL searchParams → MarketplaceFilters', () => {
  it('đọc đủ kiểu: CSV → mảng, "1" → boolean, số → number, string giữ nguyên', () => {
    const params = new URLSearchParams(
      'vehicleType=car&bodyType=sedan,suv&brand=Toyota,Kia&seats=4,8plus&fuelType=electric' +
        '&features=bluetooth,gps&hourly=1&delivery=1&priceMin=400000&priceMax=900000' +
        '&q=vios&province=TP.%20HCM&page=2&sort=price_asc',
    );
    expect(parseFilters(params)).toEqual({
      vehicleType: 'car',
      bodyType: ['sedan', 'suv'],
      brand: ['Toyota', 'Kia'],
      seats: ['4', '8plus'],
      fuelType: ['electric'],
      features: ['bluetooth', 'gps'],
      hourly: true,
      delivery: true,
      priceMin: 400000,
      priceMax: 900000,
      q: 'vios',
      province: 'TP. HCM',
      page: 2,
      sort: 'price_asc',
    });
  });

  it('bỏ giá trị rác: sort lạ, số không parse được, CSV toàn dấu phẩy, boolean khác "1"', () => {
    const params = new URLSearchParams('sort=hacked&page=abc&bodyType=,,&discount=true');
    expect(parseFilters(params)).toEqual({});
  });
});

describe('applyFilterPatch — patch → searchParams', () => {
  it('mảng join CSV; mảng rỗng / false / undefined xoá param', () => {
    const params = new URLSearchParams('bodyType=sedan&hourly=1&q=vios');
    applyFilterPatch(params, {
      bodyType: ['suv', 'mpv'],
      brand: [],
      hourly: false,
      delivery: true,
      priceMin: undefined,
    });
    expect(params.get('bodyType')).toBe('suv,mpv');
    expect(params.has('brand')).toBe(false);
    expect(params.has('hourly')).toBe(false);
    expect(params.get('delivery')).toBe('1');
    // Key không nằm trong patch giữ nguyên.
    expect(params.get('q')).toBe('vios');
  });

  it('đổi filter thì reset page; đổi chính page thì giữ', () => {
    const params = new URLSearchParams('page=3');
    applyFilterPatch(params, { bodyType: ['suv'] });
    expect(params.has('page')).toBe(false);

    const params2 = new URLSearchParams('bodyType=suv&page=3');
    applyFilterPatch(params2, { page: 4 });
    expect(params2.get('page')).toBe('4');
    expect(params2.get('bodyType')).toBe('suv');
  });
});

describe('toListingQueryParams — filter → query API', () => {
  it('mảng → CSV, boolean → "1", thiếu → null (api-client tự bỏ null)', () => {
    const q = toListingQueryParams({
      bodyType: ['sedan', 'suv'],
      noCollateral: true,
      priceMin: 500000,
    });
    expect(q.bodyType).toBe('sedan,suv');
    expect(q.noCollateral).toBe('1');
    expect(q.priceMin).toBe(500000);
    expect(q.brand).toBeNull();
    expect(q.hourly).toBeNull();
  });

  it('round-trip với parseFilters: URL → filters → query khớp wire format', () => {
    const filters = parseFilters(new URLSearchParams('features=gps,map&delivery=1'));
    const q = toListingQueryParams(filters);
    expect(q.features).toBe('gps,map');
    expect(q.delivery).toBe('1');
  });
});
