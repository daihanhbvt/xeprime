import type { ConfigService } from '@nestjs/config';
import { GeoapifyGeoProvider } from '../src/modules/geo/geoapify-geo.provider';

/**
 * `GeoapifyGeoProvider` — phần DUY NHẤT của luồng bản đồ nói chuyện với bên ngoài.
 *
 * Vì sao spec này tồn tại: mọi thứ khác trong luồng đã có test chạy trên PostgreSQL thật
 * (`geo-delivery-distance.spec.ts`), nhưng chúng dùng provider giả. Chỗ chưa ai kiểm là năm
 * request HTTP: URL đúng chưa, tham số đúng tên chưa, **thứ tự lat/lon đúng chưa**, và có đọc
 * đúng response không. Đó chính là phần sẽ vỡ khi cắm key thật vào — nên nó phải được khoá lại
 * ở đây thay vì phát hiện bằng một cái ghim giữa Ấn Độ Dương.
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

/** Một dòng `results[]` đủ tốt để được chấp nhận — test nào cần xấu thì tự hạ `confidence`. */
const goodResult = {
  formatted: '12 Nguyễn Huệ, Bến Nghé, TP.HCM',
  address_line1: '12 Nguyễn Huệ',
  address_line2: 'Bến Nghé, TP.HCM',
  lat: 10.7743,
  lon: 106.7038,
  rank: { confidence: 0.95 },
};

beforeEach(() => {
  lastCall = null;
});

afterAll(() => {
  global.fetch = realFetch;
});

const provider = new GeoapifyGeoProvider(config);

describe('cấu hình key', () => {
  it('thiếu key → enabled = false, GeoService sẽ không gọi tới đây', () => {
    expect(new GeoapifyGeoProvider(emptyConfig).enabled).toBe(false);
  });

  it('có key → enabled = true', () => {
    expect(provider.enabled).toBe(true);
  });

  /**
   * Tên provider đi vào khoá băm của `geocode_cache` và `geo_route_cache`. Nó đổi từ `google`
   * sang `geoapify` chính là thứ làm mọi bản ghi cache cũ trở nên vô hình — đúng ý muốn, vì
   * toạ độ của nhà cung cấp này không thể lẫn với nhà cung cấp kia.
   */
  it('name = "geoapify" — khoá cache cũ của Google không bao giờ trúng lại', () => {
    expect(provider.name).toBe('geoapify');
  });
});

describe('Geocoding API — địa chỉ chữ → toạ độ', () => {
  it('dựng đúng request: giới hạn Việt Nam, ngôn ngữ vi, key ở query', async () => {
    stubFetch({ results: [goodResult] });

    const res = await provider.geocode('12 Nguyễn Huệ, Quận 1, TP.HCM');

    const url = new URL(lastCall!.url);
    expect(url.origin + url.pathname).toBe('https://api.geoapify.com/v1/geocode/search');
    expect(url.searchParams.get('text')).toBe('12 Nguyễn Huệ, Quận 1, TP.HCM');
    // Khoá vùng: sản phẩm chỉ chạy ở Việt Nam, và giới hạn quốc gia làm geocode chính xác hơn.
    expect(url.searchParams.get('filter')).toBe('countrycode:vn');
    expect(url.searchParams.get('lang')).toBe('vi');
    expect(url.searchParams.get('format')).toBe('json');
    expect(url.searchParams.get('apiKey')).toBe(KEY);

    expect(res).toEqual({
      point: NGUYEN_HUE,
      formattedAddress: '12 Nguyễn Huệ, Bến Nghé, TP.HCM',
      placeId: 'gp1:10.7743,106.7038',
    });
  });

  it('không tìm thấy là CÂU TRẢ LỜI, không phải lỗi → null', async () => {
    stubFetch({ results: [] });

    await expect(provider.geocode('địa chỉ không có thật')).resolves.toBeNull();
  });

  /**
   * Phép kiểm đáng giá nhất của file, và là lý do `MIN_GEOCODE_CONFIDENCE` tồn tại.
   *
   * Google trả `ZERO_RESULTS` khi không khớp. Geoapify/OSM thì trả về tâm xã hoặc tâm tỉnh —
   * một cái ghim sai cách chỗ thật vài km, nằm ngay dưới dòng địa chỉ đúng, rồi chảy thẳng vào
   * quãng đường giao xe và thành tiền trên đơn của người khác.
   */
  it('kết quả độ tin cậy thấp bị LOẠI — thà không có ghim còn hơn ghim ở tâm tỉnh', async () => {
    stubFetch({
      results: [{ ...goodResult, formatted: 'Thành phố Hồ Chí Minh', rank: { confidence: 0.1 } }],
    });

    await expect(provider.geocode('12 Nguyễn Huệ, Quận 1')).resolves.toBeNull();
  });

  it('thiếu hẳn rank → coi như 0 và loại, không đoán là tốt', async () => {
    stubFetch({ results: [{ ...goodResult, rank: undefined }] });

    await expect(provider.geocode('12 Nguyễn Huệ, Quận 1')).resolves.toBeNull();
  });

  /**
   * Hết hạn mức / key sai là chuyện của người vận hành, KHÔNG phải của khách. Ném lên để
   * `GeoService` nuốt thành `unavailable` + một dòng log, thay vì báo khách "địa chỉ sai".
   */
  it('HTTP lỗi thì NÉM kèm mã và câu của nhà cung cấp, không trả null', async () => {
    stubFetch({ message: 'Invalid apiKey' }, false, 401);
    await expect(provider.geocode('12 Nguyễn Huệ')).rejects.toThrow(/HTTP 401.*Invalid apiKey/);

    stubFetch({ message: 'Out of credits' }, false, 429);
    await expect(provider.geocode('12 Nguyễn Huệ')).rejects.toThrow(/HTTP 429/);
  });

  it('toạ độ trong response hỏng → null, TUYỆT ĐỐI không trả một cái ghim bịa', async () => {
    stubFetch({ results: [{ ...goodResult, lat: undefined, lon: undefined }] });

    await expect(provider.geocode('12 Nguyễn Huệ, Quận 1')).resolves.toBeNull();
  });
});

describe('Address Autocomplete — gõ chữ → gợi ý', () => {
  it('tách sẵn dòng đậm/nhạt từ address_line1/2', async () => {
    stubFetch({ results: [goodResult] });

    const res = await provider.searchPlaces('12 Nguyễn Huệ');

    const url = new URL(lastCall!.url);
    expect(url.origin + url.pathname).toBe('https://api.geoapify.com/v1/geocode/autocomplete');
    expect(url.searchParams.get('filter')).toBe('countrycode:vn');
    expect(url.searchParams.get('limit')).toBe('6');

    expect(res).toEqual([
      {
        // Mã địa điểm là TOẠ ĐỘ, không phải `place_id` thô của Geoapify — xem `placeToken`.
        placeId: 'gp1:10.7743,106.7038',
        primaryText: '12 Nguyễn Huệ',
        secondaryText: 'Bến Nghé, TP.HCM',
      },
    ]);
  });

  /**
   * Bẫy đắt nhất của Geoapify: `bias=proximity:` nhận **lon,lat**, còn `waypoints=` của Routing
   * nhận **lat,lon**. Đảo nhầm ở Việt Nam cho ra một điểm giữa Ấn Độ Dương — vẫn hợp lệ, vẫn
   * tính ra được số, và không có gì báo lỗi.
   */
  it('bias dùng thứ tự LON,LAT — ngược với waypoints của Routing', async () => {
    stubFetch({ results: [] });

    await provider.searchPlaces('Nguyễn Huệ', BEN_THANH);

    const bias = new URL(lastCall!.url).searchParams.get('bias');
    expect(bias).toContain('proximity:106.698,10.7721');
  });

  it('không có bias thì không gửi tham số thừa', async () => {
    stubFetch({ results: [] });

    await provider.searchPlaces('Nguyễn Huệ');

    expect(new URL(lastCall!.url).searchParams.get('bias')).toBeNull();
  });

  /**
   * Mã địa điểm CHÍNH LÀ toạ độ, nên một dòng không có toạ độ là một dòng bấm vào không ra gì.
   * Bỏ nó đi còn hơn để người dùng chọn rồi ngồi nhìn form đứng im.
   */
  it('bỏ dòng thiếu toạ độ — mã địa điểm dựng từ toạ độ nên không có thì vô dụng', async () => {
    stubFetch({ results: [goodResult, { ...goodResult, lat: undefined, lon: undefined }] });

    await expect(provider.searchPlaces('Nguyễn Huệ')).resolves.toHaveLength(1);
  });

  /**
   * KHÔNG áp ngưỡng tin cậy ở đây, khác hẳn `geocode()`: gợi ý là thứ người dùng ĐỌC rồi tự
   * chọn, còn `geocode()` là chỗ máy tự chốt.
   */
  it('giữ cả gợi ý độ tin cậy thấp — người dùng là người chọn, không phải máy', async () => {
    stubFetch({ results: [{ ...goodResult, rank: { confidence: 0.05 } }] });

    await expect(provider.searchPlaces('Nguyễn')).resolves.toHaveLength(1);
  });
});

/**
 * Đây là khối test đắt giá nhất của file, vì nó khoá lại một quyết định thiết kế đã phải trả giá
 * một lần bằng một màn hình hỏng.
 *
 * `/v2/place-details` của Geoapify **không giải được** `place_id` của kết quả loại `building` —
 * tức là địa chỉ CÓ SỐ NHÀ, đúng thứ một đơn giao xe cần. Nó trả HTTP 200 với `{"features":[]}`
 * ở mọi tổ hợp tham số. Vì vậy mã địa điểm ở đây gói TOẠ ĐỘ, và giải bằng reverse geocode.
 */
describe('Place Details — mã địa điểm gói toạ độ, giải bằng reverse geocode', () => {
  it('KHÔNG gọi /v2/place-details, mà gọi /v1/geocode/reverse ở toạ độ trong mã', async () => {
    stubFetch({ results: [{ ...goodResult, state: 'Thành phố Hồ Chí Minh', suburb: 'Bến Nghé' }] });

    const res = await provider.placeDetails('gp1:10.7743,106.7038');

    const url = new URL(lastCall!.url);
    expect(url.origin + url.pathname).toBe('https://api.geoapify.com/v1/geocode/reverse');
    expect(url.searchParams.get('lat')).toBe('10.7743');
    expect(url.searchParams.get('lon')).toBe('106.7038');

    expect(res).toEqual({
      placeId: 'gp1:10.7743,106.7038',
      point: NGUYEN_HUE,
      formattedAddress: '12 Nguyễn Huệ, Bến Nghé, TP.HCM',
      administrativeArea: 'Thành phố Hồ Chí Minh',
      locality: 'Bến Nghé',
    });
  });

  /**
   * Toạ độ trong MÃ đến từ gợi ý người dùng đã chọn (đúng số nhà); toạ độ reverse trả về hay bị
   * kéo về tim đường gần nhất. Lấy nhầm cái sau là ghim lệch sang giữa đường.
   */
  it('giữ toạ độ TRONG MÃ, không lấy toạ độ reverse gợi ý', async () => {
    stubFetch({ results: [{ ...goodResult, lat: 99, lon: 99 }] });

    const res = await provider.placeDetails('gp1:10.7743,106.7038');

    expect(res!.point).toEqual(NGUYEN_HUE);
  });

  /**
   * OSM không nhất quán ở Việt Nam: Hà Nội không có `state`, tên tỉnh nằm ở `city`. Chỉ đọc
   * `state` là Hà Nội mất tỉnh và bộ chọn tỉnh không được gợi ý gì.
   */
  it('tỉnh đọc từ state, thiếu thì rơi về city — ca Hà Nội', async () => {
    stubFetch({ results: [{ ...goodResult, state: undefined, city: 'Hà Nội', suburb: 'Phường Hoàn Kiếm' }] });

    const res = await provider.placeDetails('gp1:21.0287,105.8524');

    expect(res!.administrativeArea).toBe('Hà Nội');
    expect(res!.locality).toBe('Phường Hoàn Kiếm');
  });

  it('mã của nhà cung cấp KHÁC (dữ liệu cũ thời Google) → null, không gọi mạng', async () => {
    stubFetch({ results: [goodResult] });

    await expect(provider.placeDetails('ChIJ_mã_google_cũ')).resolves.toBeNull();
    expect(lastCall).toBeNull();
  });

  it('mã đúng tiền tố nhưng toạ độ hỏng → null', async () => {
    await expect(provider.placeDetails('gp1:không,phải-số')).resolves.toBeNull();
    // (0,0) là toạ độ "rỗng" kinh điển — ngoài khơi vịnh Guinea, không phải một địa điểm.
    await expect(provider.placeDetails('gp1:0,0')).resolves.toBeNull();
  });

  it('HTTP lỗi thì ném để GeoService rơi về unavailable', async () => {
    stubFetch({ message: 'quota' }, false, 429);

    await expect(provider.placeDetails('gp1:10.7743,106.7038')).rejects.toThrow(/HTTP 429/);
  });
});

describe('Reverse geocoding — toạ độ vừa kéo → địa chỉ chữ', () => {
  it('gửi lat/lon rời và GIỮ NGUYÊN toạ độ người dùng ghim', async () => {
    stubFetch({ results: [{ ...goodResult, lat: 99, lon: 99 }] });

    const res = await provider.reverseGeocode(BEN_THANH);

    const url = new URL(lastCall!.url);
    expect(url.origin + url.pathname).toBe('https://api.geoapify.com/v1/geocode/reverse');
    expect(url.searchParams.get('lat')).toBe('10.7721');
    expect(url.searchParams.get('lon')).toBe('106.698');

    // Cái ghim là thứ người dùng CHỦ ĐỘNG đặt; địa chỉ chữ chỉ là chú thích cho nó. Toạ độ trong
    // response (99,99 ở trên) không được phép thay thế nó.
    expect(res!.point).toEqual(BEN_THANH);
    expect(res!.formattedAddress).toBe('12 Nguyễn Huệ, Bến Nghé, TP.HCM');
    // Mã địa điểm dựng từ toạ độ NGƯỜI DÙNG ghim, nên tra lại nó sau này ra đúng chỗ này.
    expect(res!.placeId).toBe('gp1:10.7721,106.698');
  });

  it('không có địa chỉ nào ở đó → null', async () => {
    stubFetch({ results: [] });

    await expect(provider.reverseGeocode(BEN_THANH)).resolves.toBeNull();
  });
});

describe('Routing API — khoảng cách đường bộ một chiều', () => {
  it('waypoints dùng thứ tự LAT,LON — ngược với bias của Autocomplete', async () => {
    stubFetch({ results: [{ distance: 3421 }] });

    const km = await provider.roadDistanceKm(BEN_THANH, NGUYEN_HUE);

    const url = new URL(lastCall!.url);
    expect(url.origin + url.pathname).toBe('https://api.geoapify.com/v1/routing');
    expect(url.searchParams.get('waypoints')).toBe('10.7721,106.698|10.7743,106.7038');
    expect(url.searchParams.get('mode')).toBe('drive');
    expect(url.searchParams.get('units')).toBe('metric');
    // `format=json` cho `results[].distance` phẳng; mặc định GeoJSON kèm cả hình học tuyến đường
    // — thứ bảng bậc phí giao không dùng tới.
    expect(url.searchParams.get('format')).toBe('json');

    // 3421 m → 3.42 km: làm tròn 2 số lẻ để khớp `Decimal(8,2)` của `geo_route_cache`, nếu không
    // giá trị ghi xuống và giá trị đọc lên sẽ lệch nhau ở lần trúng cache.
    expect(km).toBe(3.42);
  });

  it('không có đường bộ nối hai điểm → null', async () => {
    stubFetch({ results: [] });

    await expect(provider.roadDistanceKm(BEN_THANH, NGUYEN_HUE)).resolves.toBeNull();
  });

  it('HTTP lỗi → ném để GeoService rơi về unavailable', async () => {
    stubFetch({ message: 'Out of credits' }, false, 429);

    await expect(provider.roadDistanceKm(BEN_THANH, NGUYEN_HUE)).rejects.toThrow(/HTTP 429/);
  });
});
