import type { ConfigService } from '@nestjs/config';
import { GoogleGeoProvider } from '../src/modules/geo/google-geo.provider';

/**
 * `GoogleGeoProvider` — phần DUY NHẤT của luồng bản đồ nói chuyện với bên ngoài (ADR 0059).
 *
 * Vì sao spec này tồn tại: mọi thứ khác trong luồng đã có test chạy trên PostgreSQL thật
 * (`geo-delivery-distance.spec.ts`), nhưng chúng dùng provider giả. Chỗ chưa ai kiểm là năm
 * request HTTP: URL đúng chưa, tham số và header đúng tên chưa, FieldMask có hẹp như đã định
 * không, và có đọc đúng response không. Đó chính là phần sẽ vỡ khi cắm key thật vào — nên nó phải
 * được khoá lại ở đây thay vì phát hiện bằng một hoá đơn và một màn hình trống.
 *
 * `fetch` bị chặn hoàn toàn: **không một byte nào rời khỏi máy**, kể cả khi ai đó lỡ để key
 * thật trong `.env`. Cái được kiểm là HÌNH của request và cách đọc response.
 */
const KEY = 'test-server-key';
const BEN_THANH = { lat: 10.7721, lng: 106.698 };
const NGUYEN_HUE = { lat: 10.7743, lng: 106.7038 };

const config = { get: () => KEY, getOrThrow: () => KEY } as unknown as ConfigService;
const emptyConfig = {
  get: () => undefined,
  getOrThrow: () => {
    throw new Error('missing');
  },
} as unknown as ConfigService;

/** Bắt lại request cuối cùng để assert, và trả về response đã dựng sẵn. */
let lastCall: { url: string; init?: RequestInit } | null = null;
const realFetch = global.fetch;

function stubFetch(body: unknown, ok = true, status = 200): void {
  global.fetch = ((url: string | URL, init?: RequestInit) => {
    lastCall = { url: String(url), init };
    return Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(body),
    } as Response);
  }) as typeof fetch;
}

const headersOf = (): Record<string, string> =>
  (lastCall?.init?.headers ?? {}) as Record<string, string>;

/** Một dòng `results[]` của Geocoding API đủ chi tiết để được nhận. */
const streetResult = {
  geometry: { location: { lat: 10.7743, lng: 106.7038 } },
  formatted_address: '12 Nguyễn Huệ, Bến Nghé, Quận 1, Hồ Chí Minh, Việt Nam',
  place_id: 'ChIJ_real_place_id',
  types: ['street_address'],
};

beforeEach(() => {
  lastCall = null;
});

afterAll(() => {
  global.fetch = realFetch;
});

const provider = new GoogleGeoProvider(config);

describe('cấu hình key', () => {
  it('thiếu key → enabled = false, GeoService sẽ không gọi tới đây', () => {
    expect(new GoogleGeoProvider(emptyConfig).enabled).toBe(false);
  });

  it('có key → enabled = true', () => {
    expect(provider.enabled).toBe(true);
  });

  /**
   * Tên provider đi vào khoá băm của `geocode_cache` và `geo_route_cache`. Nó đổi từ `geoapify`
   * sang `google` chính là thứ làm mọi bản ghi cache cũ trở nên vô hình — đúng ý muốn, vì toạ độ
   * của nhà cung cấp này không được lẫn với nhà cung cấp kia.
   */
  it('name = "google" — khoá cache cũ của Geoapify không bao giờ trúng lại', () => {
    expect(provider.name).toBe('google');
  });
});

describe('Geocoding API — địa chỉ chữ → toạ độ', () => {
  it('dựng đúng request: giới hạn Việt Nam, ngôn ngữ vi, key ở query', async () => {
    stubFetch({ status: 'OK', results: [streetResult] });

    const res = await provider.geocode('12 Nguyễn Huệ, Quận 1, TP.HCM');

    const url = new URL(lastCall!.url);
    expect(url.origin + url.pathname).toBe('https://maps.googleapis.com/maps/api/geocode/json');
    expect(url.searchParams.get('address')).toBe('12 Nguyễn Huệ, Quận 1, TP.HCM');
    // Khoá vùng: sản phẩm chỉ chạy ở Việt Nam, và giới hạn quốc gia làm geocode chính xác hơn.
    expect(url.searchParams.get('components')).toBe('country:VN');
    expect(url.searchParams.get('region')).toBe('vn');
    expect(url.searchParams.get('language')).toBe('vi');
    expect(url.searchParams.get('key')).toBe(KEY);

    expect(res).toEqual({
      point: NGUYEN_HUE,
      formattedAddress: '12 Nguyễn Huệ, Bến Nghé, Quận 1, Hồ Chí Minh, Việt Nam',
      placeId: 'ChIJ_real_place_id',
    });
  });

  it('ZERO_RESULTS là CÂU TRẢ LỜI, không phải lỗi → null', async () => {
    stubFetch({ status: 'ZERO_RESULTS', results: [] });

    await expect(provider.geocode('địa chỉ không có thật')).resolves.toBeNull();
  });

  /**
   * Phép kiểm đáng giá nhất của khối này. Không khớp được số nhà/đường, Google hay trả về TÂM
   * tỉnh hoặc thành phố kèm `partial_match` thay vì `ZERO_RESULTS`. Ghim ở tâm tỉnh nằm ngay dưới
   * dòng địa chỉ đúng, rồi chảy thẳng vào quãng đường giao xe và thành tiền trên đơn người khác.
   */
  it('kết quả chỉ ở mức tỉnh/thành phố bị LOẠI — thà không có ghim còn hơn ghim ở tâm tỉnh', async () => {
    stubFetch({
      status: 'OK',
      results: [
        {
          ...streetResult,
          formatted_address: 'Hồ Chí Minh, Việt Nam',
          types: ['administrative_area_level_1', 'political'],
          partial_match: true,
        },
      ],
    });
    await expect(provider.geocode('12 Nguyễn Huệ sai chính tả')).resolves.toBeNull();

    stubFetch({
      status: 'OK',
      results: [{ ...streetResult, types: ['locality', 'political'] }],
    });
    await expect(provider.geocode('đường không có thật, Huế')).resolves.toBeNull();
  });

  /**
   * Cấp phường và đường vẫn được nhận: đó là nhóm khớp một phần mà người dùng tự chỉnh ghim,
   * vì giao diện đã bắt họ nhìn ghim một lần trước khi lưu. Chặn cả nhóm này là biến "phí giao
   * dự kiến" thành tính năng gần như không bao giờ hiện.
   */
  it('kết quả cấp đường và cấp phường vẫn được nhận', async () => {
    stubFetch({ status: 'OK', results: [{ ...streetResult, types: ['route'] }] });
    await expect(provider.geocode('Nguyễn Huệ, Quận 1')).resolves.not.toBeNull();

    stubFetch({
      status: 'OK',
      results: [{ ...streetResult, types: ['administrative_area_level_3', 'political'] }],
    });
    await expect(provider.geocode('Phường Bến Nghé')).resolves.not.toBeNull();
  });

  /**
   * Số nhà không có trong dữ liệu → Google rơi về TÂM con đường kèm `partial_match`. Tâm của một
   * con đường dài 20 km có thể cách chỗ thật cả chục km — và nó đi thẳng vào phí giao tự động.
   */
  describe('khớp một phần: đo độ rộng vùng bao', () => {
    /** Vùng bao ±`halfDeg` độ quanh Nguyễn Huệ (0,009° ≈ 1 km ở vĩ độ này). */
    const viewport = (halfDeg: number) => ({
      northeast: { lat: 10.7743 + halfDeg, lng: 106.7038 + halfDeg },
      southwest: { lat: 10.7743 - halfDeg, lng: 106.7038 - halfDeg },
    });
    const routeResult = (halfDeg: number, partial: boolean) => ({
      ...streetResult,
      types: ['route'],
      partial_match: partial,
      geometry: { location: { lat: 10.7743, lng: 106.7038 }, viewport: viewport(halfDeg) },
    });

    it('tâm của một con đường DÀI khi khớp một phần → loại', async () => {
      // ±0,05° ≈ đường chéo ~15 km.
      stubFetch({ status: 'OK', results: [routeResult(0.05, true)] });
      await expect(provider.geocode('999 Nguyễn Văn Linh, Quận 7')).resolves.toBeNull();
    });

    it('con đường NGẮN khớp một phần → vẫn nhận, người dùng tự chỉnh ghim', async () => {
      // ±0,003° ≈ đường chéo ~0,9 km.
      stubFetch({ status: 'OK', results: [routeResult(0.003, true)] });
      await expect(provider.geocode('99 Nguyễn Huệ, Quận 1')).resolves.not.toBeNull();
    });

    it('vùng bao rộng nhưng KHỚP ĐỦ (sân bay, khu đô thị) → nhận', async () => {
      stubFetch({ status: 'OK', results: [routeResult(0.05, false)] });
      await expect(provider.geocode('Sân bay Tân Sơn Nhất')).resolves.not.toBeNull();
    });
  });

  /**
   * Hết hạn mức / key sai là chuyện của người vận hành, KHÔNG phải của khách. Ném lên để
   * `GeoService` nuốt thành `unavailable` + một dòng log, thay vì báo khách "địa chỉ sai".
   */
  it('OVER_QUERY_LIMIT và REQUEST_DENIED thì NÉM, không trả null', async () => {
    stubFetch({ status: 'OVER_QUERY_LIMIT', error_message: 'quota' });
    await expect(provider.geocode('12 Nguyễn Huệ, Quận 1')).rejects.toThrow(/OVER_QUERY_LIMIT/);

    stubFetch({ status: 'REQUEST_DENIED', error_message: 'key sai' });
    await expect(provider.geocode('12 Nguyễn Huệ, Quận 1')).rejects.toThrow(/REQUEST_DENIED/);
  });

  it('HTTP lỗi thì ném kèm mã', async () => {
    stubFetch({}, false, 403);

    await expect(provider.geocode('12 Nguyễn Huệ, Quận 1')).rejects.toThrow(/HTTP 403/);
  });

  it('toạ độ trong response hỏng → null, TUYỆT ĐỐI không trả một cái ghim bịa', async () => {
    stubFetch({ status: 'OK', results: [{ ...streetResult, geometry: { location: {} } }] });

    await expect(provider.geocode('12 Nguyễn Huệ, Quận 1')).resolves.toBeNull();
  });
});

describe('Places Autocomplete (New) — gõ chữ → gợi ý', () => {
  const prediction = {
    placePrediction: {
      placeId: 'ChIJ_suggestion',
      text: { text: '12 Nguyễn Huệ, Bến Nghé, Quận 1' },
      structuredFormat: {
        mainText: { text: '12 Nguyễn Huệ' },
        secondaryText: { text: 'Bến Nghé, Quận 1, Hồ Chí Minh' },
      },
    },
  };

  it('POST, key ở header, FieldMask chỉ ba mảnh, khoá vùng VN, tách dòng đậm/nhạt', async () => {
    stubFetch({ suggestions: [prediction] });

    const res = await provider.searchPlaces('12 Nguyễn Huệ');

    expect(lastCall!.url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(lastCall!.init?.method).toBe('POST');
    expect(headersOf()['X-Goog-Api-Key']).toBe(KEY);
    // FieldMask hẹp không chỉ để nhẹ: xin thêm trường là tự đẩy request lên bậc tính tiền cao hơn.
    expect(headersOf()['X-Goog-FieldMask']).toBe(
      'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
    );

    const body = JSON.parse(lastCall!.init?.body as string) as Record<string, unknown>;
    expect(body.input).toBe('12 Nguyễn Huệ');
    expect(body.includedRegionCodes).toEqual(['vn']);
    expect(body.languageCode).toBe('vi');
    expect(body.locationBias).toBeUndefined();

    expect(res).toEqual([
      {
        placeId: 'ChIJ_suggestion',
        primaryText: '12 Nguyễn Huệ',
        secondaryText: 'Bến Nghé, Quận 1, Hồ Chí Minh',
      },
    ]);
  });

  it('có điểm ưu tiên → locationBias hình tròn quanh đúng điểm đó', async () => {
    stubFetch({ suggestions: [] });

    await provider.searchPlaces('Nguyễn Huệ', BEN_THANH);

    const body = JSON.parse(lastCall!.init?.body as string) as {
      locationBias?: { circle?: { center?: unknown; radius?: number } };
    };
    expect(body.locationBias?.circle?.center).toEqual({ latitude: 10.7721, longitude: 106.698 });
    expect(body.locationBias?.circle?.radius).toBe(50_000);
  });

  it('thiếu structuredFormat thì rơi về chuỗi đầy đủ; dòng thiếu mã bị bỏ', async () => {
    stubFetch({
      suggestions: [
        { placePrediction: { placeId: 'ChIJ_plain', text: { text: 'Chợ Bến Thành' } } },
        { placePrediction: { text: { text: 'không có mã' } } },
      ],
    });

    await expect(provider.searchPlaces('Chợ Bến')).resolves.toEqual([
      { placeId: 'ChIJ_plain', primaryText: 'Chợ Bến Thành', secondaryText: null },
    ]);
  });

  it('lỗi của API → ném kèm status để log nói được vì sao', async () => {
    stubFetch(
      { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Places API (New) chưa bật' } },
      false,
      403,
    );

    await expect(provider.searchPlaces('Nguyễn')).rejects.toThrow(/HTTP 403 PERMISSION_DENIED/);
  });
});

describe('Place Details (New) — một gợi ý đã chọn → toạ độ + thành phần hành chính', () => {
  it('GET đúng URL, FieldMask Essentials, đọc tỉnh từ administrative_area_level_1', async () => {
    stubFetch({
      id: 'ChIJ_real_place_id',
      formattedAddress: '12 Nguyễn Huệ, Bến Nghé, Quận 1, Hồ Chí Minh',
      location: { latitude: 10.7743, longitude: 106.7038 },
      addressComponents: [
        { longText: 'Quận 1', types: ['administrative_area_level_2', 'political'] },
        { longText: 'Hồ Chí Minh', types: ['administrative_area_level_1', 'political'] },
      ],
    });

    const res = await provider.placeDetails('ChIJ_real_place_id');

    const url = new URL(lastCall!.url);
    expect(url.origin + url.pathname).toBe(
      'https://places.googleapis.com/v1/places/ChIJ_real_place_id',
    );
    expect(url.searchParams.get('languageCode')).toBe('vi');
    expect(headersOf()['X-Goog-Api-Key']).toBe(KEY);
    expect(headersOf()['X-Goog-FieldMask']).toBe('id,formattedAddress,location,addressComponents');

    expect(res).toEqual({
      placeId: 'ChIJ_real_place_id',
      point: NGUYEN_HUE,
      formattedAddress: '12 Nguyễn Huệ, Bến Nghé, Quận 1, Hồ Chí Minh',
      administrativeArea: 'Hồ Chí Minh',
      // Không có `locality` → rơi về cấp 2 (quận/huyện).
      locality: 'Quận 1',
    });
  });

  /**
   * Trong DB còn mã thời Geoapify (`gp1:<lat>,<lng>`, ADR 0037 điều 5). Gửi chúng sang Google là
   * một request tính tiền đổi lấy HTTP 400.
   */
  it('mã của nhà cung cấp cũ hoặc chuỗi bịa → null, KHÔNG gọi mạng', async () => {
    stubFetch({});

    await expect(provider.placeDetails('gp1:10.7743,106.7038')).resolves.toBeNull();
    await expect(provider.placeDetails('../../etc/passwd')).resolves.toBeNull();
    expect(lastCall).toBeNull();
  });

  it('404 = mã đã hết hạn → null, không phải sự cố', async () => {
    stubFetch({ error: { code: 404, status: 'NOT_FOUND' } }, false, 404);

    await expect(provider.placeDetails('ChIJ_expired')).resolves.toBeNull();
  });

  it('lỗi khác → ném để GeoService rơi về unavailable', async () => {
    stubFetch({ error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }, false, 429);

    await expect(provider.placeDetails('ChIJ_real_place_id')).rejects.toThrow(
      /HTTP 429 RESOURCE_EXHAUSTED/,
    );
  });
});

describe('Reverse geocoding — toạ độ vừa kéo → địa chỉ chữ', () => {
  it('gửi latlng và GIỮ NGUYÊN toạ độ người dùng ghim', async () => {
    stubFetch({
      status: 'OK',
      results: [{ ...streetResult, geometry: { location: { lat: 99, lng: 99 } } }],
    });

    const res = await provider.reverseGeocode(BEN_THANH);

    const url = new URL(lastCall!.url);
    expect(url.origin + url.pathname).toBe('https://maps.googleapis.com/maps/api/geocode/json');
    expect(url.searchParams.get('latlng')).toBe('10.7721,106.698');
    expect(url.searchParams.get('language')).toBe('vi');

    // Cái ghim là thứ người dùng CHỦ ĐỘNG đặt; địa chỉ chữ chỉ là chú thích cho nó. Toạ độ trong
    // response (99,99 ở trên) không được phép thay thế nó.
    expect(res!.point).toEqual(BEN_THANH);
    expect(res!.formattedAddress).toBe('12 Nguyễn Huệ, Bến Nghé, Quận 1, Hồ Chí Minh, Việt Nam');
  });

  /** Đổ "QFGW+X2 Bến Nghé…" vào ô địa chỉ là đưa cho tài xế một mã họ không đọc được. */
  it('bỏ dòng plus_code đứng đầu, lấy dòng địa chỉ kế tiếp', async () => {
    stubFetch({
      status: 'OK',
      results: [
        { ...streetResult, formatted_address: 'QFGW+X2 Bến Nghé', types: ['plus_code'] },
        streetResult,
      ],
    });

    const res = await provider.reverseGeocode(BEN_THANH);

    expect(res!.formattedAddress).toBe('12 Nguyễn Huệ, Bến Nghé, Quận 1, Hồ Chí Minh, Việt Nam');
  });

  it('không có địa chỉ nào ở đó → null', async () => {
    stubFetch({ status: 'ZERO_RESULTS', results: [] });

    await expect(provider.reverseGeocode(BEN_THANH)).resolves.toBeNull();
  });
});

describe('Routes API — khoảng cách đường bộ một chiều', () => {
  it('dựng đúng request: POST, key ở header, FieldMask hẹp nhất, DRIVE + TRAFFIC_UNAWARE', async () => {
    stubFetch({ routes: [{ distanceMeters: 3421 }] });

    const km = await provider.roadDistanceKm(BEN_THANH, NGUYEN_HUE);

    expect(lastCall!.url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    expect(lastCall!.init?.method).toBe('POST');
    // Key đi ở HEADER với Routes API (khác Geocoding vốn nhận key ở query).
    expect(headersOf()['X-Goog-Api-Key']).toBe(KEY);
    // Xin thêm trường (polyline, thời gian có kẹt xe) là tự đẩy request lên bậc tính tiền cao hơn.
    expect(headersOf()['X-Goog-FieldMask']).toBe('routes.distanceMeters');

    const body = JSON.parse(lastCall!.init?.body as string) as Record<string, unknown>;
    expect(body.travelMode).toBe('DRIVE');
    expect(body.routingPreference).toBe('TRAFFIC_UNAWARE');
    expect(body.units).toBe('METRIC');
    expect(body.origin).toEqual({
      location: { latLng: { latitude: 10.7721, longitude: 106.698 } },
    });
    expect(body.destination).toEqual({
      location: { latLng: { latitude: 10.7743, longitude: 106.7038 } },
    });

    // 3421 m → 3.42 km: làm tròn 2 số lẻ để khớp `Decimal(8,2)` của `geo_route_cache`, nếu không
    // giá trị ghi xuống và giá trị đọc lên sẽ lệch nhau ở lần trúng cache.
    expect(km).toBe(3.42);
  });

  it('không có tuyến nào nối hai điểm → null', async () => {
    stubFetch({});
    await expect(provider.roadDistanceKm(BEN_THANH, NGUYEN_HUE)).resolves.toBeNull();

    stubFetch({ routes: [] });
    await expect(provider.roadDistanceKm(BEN_THANH, NGUYEN_HUE)).resolves.toBeNull();
  });

  /**
   * JSON của Routes API theo proto3: trường mang giá trị mặc định bị lược. Một tuyến 0 m về dưới
   * dạng `{}` — đọc nó thành "không có đường" là báo khách "ngoài phạm vi" khi họ đứng ngay
   * cạnh điểm nhận xe.
   */
  it('tuyến có thật nhưng thiếu distanceMeters = 0 km, không phải "không có đường"', async () => {
    stubFetch({ routes: [{}] });

    await expect(provider.roadDistanceKm(BEN_THANH, BEN_THANH)).resolves.toBe(0);
  });

  it('Routes API trả error → ném để GeoService rơi về unavailable', async () => {
    stubFetch({ error: { status: 'PERMISSION_DENIED', message: 'API chưa bật' } }, false, 403);

    await expect(provider.roadDistanceKm(BEN_THANH, NGUYEN_HUE)).rejects.toThrow(
      /PERMISSION_DENIED/,
    );
  });
});
