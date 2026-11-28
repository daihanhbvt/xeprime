import { describe, expect, it } from 'vitest';
import {
  applyFilterPatch,
  FACET_FILTER_KEYS,
  filterQueryString,
  formatDateTimeParam,
  marketplaceSearchHref,
  parseDateTimeParam,
  parseFilters,
  toListingQueryParams,
} from './filter-params';

describe('parseFilters - URL searchParams → MarketplaceFilters', () => {
  it('đọc đủ kiểu: CSV → mảng, "1" → boolean, số → number, string giữ nguyên', () => {
    const params = new URLSearchParams(
      'vehicleType=car&serviceType=with_driver&bodyType=sedan,suv&brand=Toyota,Kia' +
        '&seats=4,8plus&fuelType=electric&features=bluetooth,gps&hourly=1&delivery=1' +
        '&priceMin=400000&priceMax=900000&province=TP.%20HCM&page=2&sort=price_asc',
    );
    expect(parseFilters(params)).toEqual({
      vehicleType: 'car',
      serviceType: 'with_driver',
      bodyType: ['sedan', 'suv'],
      brand: ['Toyota', 'Kia'],
      seats: ['4', '8plus'],
      fuelType: ['electric'],
      features: ['bluetooth', 'gps'],
      hourly: true,
      delivery: true,
      priceMin: 400000,
      priceMax: 900000,
      province: 'TP. HCM',
      page: 2,
      sort: 'price_asc',
    });
  });

  it('từ khoá `q` sống trên URL (09/10) - chia sẻ được, F5 không mất', () => {
    const params = new URLSearchParams('q=Nguy%E1%BB%85n%20VF8&provinceCode=48');
    expect(parseFilters(params)).toEqual({ q: 'Nguyễn VF8', provinceCode: '48' });
  });

  it('từ khoá: cắt khoảng trắng, toàn khoảng trắng = không có, quá trần thì cắt chứ không 400', () => {
    expect(parseFilters(new URLSearchParams('q=%20%20vios%20%20'))).toEqual({ q: 'vios' });
    expect(parseFilters(new URLSearchParams('q=%20%20%20'))).toEqual({});
    const long = 'x'.repeat(150);
    expect(parseFilters(new URLSearchParams(`q=${long}`)).q).toHaveLength(100);
  });

  it('bỏ giá trị rác: sort lạ, số không parse được, CSV toàn dấu phẩy, boolean khác "1"', () => {
    const params = new URLSearchParams('sort=hacked&page=abc&bodyType=,,&discount=true');
    expect(parseFilters(params)).toEqual({});
  });

  it('`provinceCode` là tham số địa điểm CHUẨN và sống qua reload/back-forward', () => {
    // Reload/back-forward = đọc lại đúng URL đó; parse phải ra đúng giá trị, không mất mã tỉnh.
    const params = new URLSearchParams('provinceCode=48&serviceType=long_term&page=3');
    expect(parseFilters(params)).toEqual({ provinceCode: '48', serviceType: 'long_term', page: 3 });
  });

  it('có mã thì BỎ tham số tên cũ - một URL không mang hai nguồn địa điểm mâu thuẫn', () => {
    const params = new URLSearchParams('provinceCode=48&province=TP.%20HCM');
    expect(parseFilters(params)).toEqual({ provinceCode: '48' });
  });

  it('link CŨ chỉ có tên vẫn đọc được (backend quy về mã qua bí danh)', () => {
    const params = new URLSearchParams('province=TP.%20HCM');
    expect(parseFilters(params)).toEqual({ province: 'TP. HCM' });
  });
});

describe('applyFilterPatch - đổi giữa giá ngày và giá tháng (dài hạn)', () => {
  const base = () => new URLSearchParams('serviceType=self_drive&priceMin=800000&priceMax=1500000');

  it('tự lái → dài hạn: khoảng giá NGÀY bị xoá (đặt lên giá tháng là danh sách rỗng)', () => {
    const params = base();
    applyFilterPatch(params, { serviceType: 'long_term' });
    expect(params.has('priceMin')).toBe(false);
    expect(params.has('priceMax')).toBe(false);
  });

  it('cùng đơn vị (tự lái → có tài xế) thì giữ; patch tự đặt giá thì dùng giá đó', () => {
    const sameUnit = base();
    applyFilterPatch(sameUnit, { serviceType: 'with_driver' });
    expect(sameUnit.get('priceMin')).toBe('800000');

    const withPrice = base();
    applyFilterPatch(withPrice, { serviceType: 'long_term', priceMin: 10_000_000 });
    expect(withPrice.get('priceMin')).toBe('10000000');
    expect(withPrice.get('priceMax')).toBe('1500000');
  });
});

describe('applyFilterPatch - patch → searchParams', () => {
  it('mảng join CSV; mảng rỗng / false / undefined xoá param', () => {
    const params = new URLSearchParams('bodyType=sedan&hourly=1&serviceType=self_drive');
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
    expect(params.get('serviceType')).toBe('self_drive');
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

describe('toListingQueryParams - filter → query API', () => {
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

  it('dài hạn: ngày nhận + gói trên URL → hỏi API xe rảnh trong phần LÕI của khoảng đó', () => {
    const filters = parseFilters(
      new URLSearchParams('serviceType=long_term&ltFrom=2099-01-15&ltMonths=2'),
    );
    expect(filters).toEqual({ serviceType: 'long_term', ltFrom: '2099-01-15', ltMonths: 2 });

    const q = toListingQueryParams(filters);
    // Hết ngày nhận (00:00 16/01 giờ VN) → đầu ngày trả (00:00 15/03 giờ VN).
    expect(q.pickupAt).toBe('2099-01-15T17:00:00.000Z');
    expect(q.returnAt).toBe('2099-03-14T17:00:00.000Z');
    // Hai khoá của URL không đi thẳng lên API.
    expect(q).not.toHaveProperty('ltFrom');
    expect(q).not.toHaveProperty('ltMonths');
    // Là ngữ cảnh tìm kiếm, không phải facet: "Xoá bộ lọc" giữ nguyên.
    expect(FACET_FILTER_KEYS as readonly string[]).not.toContain('ltFrom');

    // Tự lái không đọc hai khoá đó.
    expect(toListingQueryParams({ ...filters, serviceType: 'self_drive' }).pickupAt).toBeNull();
  });

  it('hoá đơn VAT (ADR 0059): sống trên URL, gửi đúng tham số, "Xoá bộ lọc" xoá được', () => {
    const filters = parseFilters(new URLSearchParams('vatInvoice=1&provinceCode=48'));
    expect(filters).toEqual({ vatInvoice: true, provinceCode: '48' });
    expect(toListingQueryParams(filters).vatInvoice).toBe('1');
    expect(toListingQueryParams({}).vatInvoice).toBeNull();
    // Chỉ "1" là bật — giống mọi toggle tiện ích khác.
    expect(parseFilters(new URLSearchParams('vatInvoice=true'))).toEqual({});

    expect(FACET_FILTER_KEYS).toContain('vatInvoice');
    const params = new URLSearchParams('vatInvoice=1&provinceCode=48');
    applyFilterPatch(params, { vatInvoice: false });
    expect(params.has('vatInvoice')).toBe(false);
    expect(params.get('provinceCode')).toBe('48');
  });

  it('round-trip với parseFilters: URL → filters → query khớp wire format', () => {
    const filters = parseFilters(new URLSearchParams('features=gps,map&delivery=1'));
    const q = toListingQueryParams(filters);
    expect(q.features).toBe('gps,map');
    expect(q.delivery).toBe('1');
  });

  it('từ khoá gửi NGUYÊN VĂN - gấp chuỗi là việc của server', () => {
    expect(toListingQueryParams({ q: 'Nguyễn VF8' }).q).toBe('Nguyễn VF8');
    expect(toListingQueryParams({}).q).toBeNull();
  });

  it('gửi `provinceCode` khi có mã, và KHÔNG gửi kèm tên cũ', () => {
    const q = toListingQueryParams({ provinceCode: '79', province: 'TP. HCM' });
    expect(q.provinceCode).toBe('79');
    expect(q.province).toBeNull();
  });

  it('chỉ có tên (link cũ) thì vẫn gửi tên để backend quy về mã', () => {
    const q = toListingQueryParams({ province: 'Bà Rịa - Vũng Tàu' });
    expect(q.provinceCode).toBeNull();
    expect(q.province).toBe('Bà Rịa - Vũng Tàu');
  });

  it('"Không cần xác nhận" và mức sao: sống trên URL, gửi đúng tham số, "Xoá bộ lọc" xoá được', () => {
    const filters = parseFilters(new URLSearchParams('instantBook=1&minRating=4.5'));
    expect(filters).toMatchObject({ instantBook: true, minRating: 4.5 });
    const q = toListingQueryParams(filters);
    expect(q.instantBook).toBe('1');
    expect(q.minRating).toBe(4.5);
    expect(FACET_FILTER_KEYS).toEqual(expect.arrayContaining(['instantBook', 'minRating']));
  });

  it('mức sao ngoài các mốc API nhận thì bị bỏ, không thành lỗi 400', () => {
    expect(parseFilters(new URLSearchParams('minRating=3.7')).minRating).toBeUndefined();
    expect(parseFilters(new URLSearchParams('minRating=abc')).minRating).toBeUndefined();
    expect(parseFilters(new URLSearchParams('instantBook=0')).instantBook).toBeUndefined();
  });
});

describe('ngày giờ thuê trên URL - giờ Việt Nam tới phút', () => {
  it('ISO UTC → giờ VN gọn (14:00Z = 21:00 giờ VN)', () => {
    expect(formatDateTimeParam('2026-10-26T14:00:00.000Z')).toBe('2026-10-26T21:00');
    // Qua nửa đêm UTC vẫn đúng ngày lịch Việt Nam.
    expect(formatDateTimeParam('2026-10-26T18:30:00.000Z')).toBe('2026-10-27T01:30');
  });

  it('giờ VN → ISO UTC, và đọc được link CŨ dạng ISO có Z/offset', () => {
    expect(parseDateTimeParam('2026-10-26T21:00')).toBe('2026-10-26T14:00:00.000Z');
    expect(parseDateTimeParam('2026-10-26T14:00:00.000Z')).toBe('2026-10-26T14:00:00.000Z');
    expect(parseDateTimeParam('2026-10-26T21:00:00+07:00')).toBe('2026-10-26T14:00:00.000Z');
  });

  it('chuỗi rác hoặc ngày không có thật ⇒ undefined (bỏ tham số, không gửi API mốc sai)', () => {
    for (const raw of ['', 'abc', '2026-02-30T10:00', '2026-13-01T10:00', '2026-10-26T25:00', '1793023200000']) {
      expect(parseDateTimeParam(raw)).toBeUndefined();
    }
  });

  it('parseFilters đổi sang ISO UTC; tham số hỏng thì bị bỏ', () => {
    const filters = parseFilters(
      new URLSearchParams('pickupAt=2026-10-26T21:00&returnAt=khong-phai-ngay'),
    );
    expect(filters.pickupAt).toBe('2026-10-26T14:00:00.000Z');
    expect(filters).not.toHaveProperty('returnAt');
  });

  it('link dựng ra gọn, giữ dấu hai chấm, và đọc ngược lại đúng mốc', () => {
    const href = marketplaceSearchHref({
      vehicleType: 'car',
      provinceCode: '79',
      pickupAt: '2026-10-26T14:00:00.000Z',
      returnAt: '2026-10-27T14:00:00.000Z',
    });
    expect(href).toBe(
      '/search?vehicleType=car&provinceCode=79&pickupAt=2026-10-26T21:00&returnAt=2026-10-27T21:00',
    );
    const back = parseFilters(new URLSearchParams(href.split('?')[1]));
    expect(back.pickupAt).toBe('2026-10-26T14:00:00.000Z');
    expect(back.returnAt).toBe('2026-10-27T14:00:00.000Z');
  });

  it('filterQueryString chỉ bỏ mã hoá dấu hai chấm, các ký tự khác vẫn được mã hoá', () => {
    const params = new URLSearchParams({ q: 'mazda & kia', pickupAt: '2026-10-26T21:00' });
    expect(filterQueryString(params)).toBe('q=mazda+%26+kia&pickupAt=2026-10-26T21:00');
  });
});
