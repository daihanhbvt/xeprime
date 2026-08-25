import type { ConfigService } from '@nestjs/config';
import { GoogleGeoProvider } from '../src/modules/geo/google-geo.provider';

/**
 * `GoogleGeoProvider` — phần DUY NHẤT của luồng bản đồ nói chuyện với bên ngoài.
 *
 * Vì sao spec này tồn tại: mọi thứ khác trong luồng đã có test chạy trên PostgreSQL thật
 * (`geo-delivery-distance.spec.ts`), nhưng chúng dùng provider giả. Chỗ chưa ai kiểm là hai
 * request HTTP: URL đúng chưa, tham số đúng tên chưa, body Routes API đúng hình chưa, và có đọc
 * đúng response không. Đó chính là phần sẽ vỡ khi cắm key thật vào — nên nó phải được khoá lại
 * ở đây thay vì phát hiện bằng một hoá đơn và một màn hình trống.
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
});

describe('Geocoding API — địa chỉ chữ → toạ độ', () => {
  it('dựng đúng request: giới hạn Việt Nam, ngôn ngữ vi, key ở query', async () => {
    stubFetch({
      status: 'OK',
      results: [
        {
          geometry: { location: { lat: 10.7743, lng: 106.7038 } },
          formatted_address: '12 Nguyễn Huệ, Bến Nghé, Quận 1, TP.HCM',
          place_id: 'ChIJ_real_place_id',
        },
      ],
    });

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
      formattedAddress: '12 Nguyễn Huệ, Bến Nghé, Quận 1, TP.HCM',
      placeId: 'ChIJ_real_place_id',
    });
  });

  it('ZERO_RESULTS là CÂU TRẢ LỜI, không phải lỗi → null', async () => {
    stubFetch({ status: 'ZERO_RESULTS', results: [] });

    await expect(provider.geocode('địa chỉ không có thật')).resolves.toBeNull();
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
    stubFetch({
      status: 'OK',
      results: [{ geometry: { location: {} }, formatted_address: 'x' }],
    });

    await expect(provider.geocode('12 Nguyễn Huệ, Quận 1')).resolves.toBeNull();
  });
});

describe('Routes API — khoảng cách đường bộ một chiều', () => {
  it('dựng đúng request: POST, key ở header, FieldMask hẹp nhất, DRIVE + TRAFFIC_UNAWARE', async () => {
    stubFetch({ routes: [{ distanceMeters: 3421 }] });

    const km = await provider.roadDistanceKm(BEN_THANH, NGUYEN_HUE);

    expect(lastCall!.url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    expect(lastCall!.init?.method).toBe('POST');

    const headers = lastCall!.init?.headers as Record<string, string>;
    // Key đi ở HEADER với Routes API (khác Geocoding vốn nhận key ở query).
    expect(headers['X-Goog-Api-Key']).toBe(KEY);
    // FieldMask hẹp không chỉ để nhẹ: xin thêm trường là tự đẩy request lên bậc tính tiền cao hơn.
    expect(headers['X-Goog-FieldMask']).toBe('routes.distanceMeters');

    const body = JSON.parse(lastCall!.init?.body as string) as Record<string, unknown>;
    expect(body.travelMode).toBe('DRIVE');
    // Không hỏi tình trạng giao thông: bậc phí tính theo KM chứ không theo thời gian chạy, và
    // đây là mức rẻ nhất, cho kết quả ổn định giữa các lần hỏi.
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

  it('không có đường bộ nối hai điểm → null', async () => {
    stubFetch({ routes: [] });

    await expect(provider.roadDistanceKm(BEN_THANH, NGUYEN_HUE)).resolves.toBeNull();
  });

  it('Routes API trả error → ném để GeoService rơi về unavailable', async () => {
    stubFetch({ error: { status: 'PERMISSION_DENIED', message: 'API chưa bật' } });

    await expect(provider.roadDistanceKm(BEN_THANH, NGUYEN_HUE)).rejects.toThrow(
      /PERMISSION_DENIED/,
    );
  });
});
