import type { ConfigService } from '@nestjs/config';
import { GeoQuotaExceededError } from '../src/modules/geo/geo-provider';
import { VietmapGeoProvider } from '../src/modules/geo/vietmap-geo.provider';

/**
 * `VietmapGeoProvider` — phần DUY NHẤT của luồng bản đồ nói chuyện với bên ngoài (ADR 0061).
 *
 * Vì sao spec này tồn tại: mọi thứ khác trong luồng đã có test chạy trên PostgreSQL thật
 * (`geo-delivery-distance.spec.ts`), nhưng chúng dùng provider giả. Chỗ chưa ai kiểm là năm
 * request HTTP: URL đúng chưa, tham số đúng tên chưa, **thứ tự lat,lng đúng chưa**, có đọc đúng
 * response không, và có phân biệt "không có kết quả" với "không hỏi được" không. Đó chính là phần
 * sẽ vỡ khi cắm key thật vào, và ở đây vỡ là mất tiền.
 *
 * Hình response lấy từ tài liệu Vietmap Maps API v4. `fetch` bị chặn hoàn toàn: **không một byte
 * nào rời khỏi máy**, kể cả khi ai đó lỡ để key thật trong `.env`.
 */
const KEY = 'test-services-key';
const BEN_THANH = { lat: 10.7721, lng: 106.698 };
const NGUYEN_HUE = { lat: 10.7743, lng: 106.7038 };

const config = { get: () => KEY, getOrThrow: () => KEY } as unknown as ConfigService;
const emptyConfig = {
  get: () => undefined,
  getOrThrow: () => {
    throw new Error('missing');
  },
} as unknown as ConfigService;

/** Bắt lại các request để assert, và trả về response đã dựng sẵn theo đường dẫn. */
let urls: string[] = [];
const realFetch = global.fetch;

type Reply = { body: unknown; status?: number };

function stubFetch(byPath: Record<string, Reply> | Reply): void {
  global.fetch = ((url: string | URL) => {
    const href = String(url);
    urls.push(href);
    const reply: Reply =
      'body' in byPath
        ? (byPath as Reply)
        : (Object.entries(byPath as Record<string, Reply>).find(([path]) => href.includes(path))?.[1] ?? {
            body: null,
            status: 404,
          });
    const status = reply.status ?? 200;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(reply.body),
    } as Response);
  }) as typeof fetch;
}

const urlAt = (i: number): URL => new URL(urls[i]!);
const lastUrl = (): URL => urlAt(urls.length - 1);

/** Một dòng Autocomplete/Search v4 có số nhà — đủ chi tiết để được nhận. */
const houseItem = {
  ref_id: 'geocode:RAkPcicmZ3d',
  distance: 0.0691,
  address: 'Phường Chợ Quán,Thành Phố Hồ Chí Minh',
  name: '197 Trần Phú',
  display: '197 Trần Phú Phường Chợ Quán,Thành Phố Hồ Chí Minh',
  boundaries: [
    { type: 2, id: 18700, name: 'Chợ Quán', prefix: 'Phường', full_name: 'Phường Chợ Quán' },
    { type: 0, id: 12, name: 'Hồ Chí Minh', prefix: 'Thành Phố', full_name: 'Thành Phố Hồ Chí Minh' },
  ],
  categories: [],
  entry_points: [],
  data_old: null,
};

/** Place v4 của dòng trên. */
const housePlace = {
  display: '197 Đường Trần Phú,Phường Chợ Quán,Thành Phố Hồ Chí Minh',
  name: '',
  hs_num: '197',
  street: 'Đường Trần Phú',
  address: '197 Đường Trần Phú',
  city_id: 12,
  city: 'Thành Phố Hồ Chí Minh',
  district_id: 0,
  district: '',
  ward_id: 18700,
  ward: 'Phường Chợ Quán',
  lat: 10.759222947000069,
  lng: 106.67590269100003,
};

beforeEach(() => {
  urls = [];
});

afterAll(() => {
  global.fetch = realFetch;
});

const provider = new VietmapGeoProvider(config);

describe('cấu hình key', () => {
  it('thiếu key → enabled = false, GeoService sẽ không gọi tới đây', () => {
    expect(new VietmapGeoProvider(emptyConfig).enabled).toBe(false);
  });

  it('có key → enabled = true', () => {
    expect(provider.enabled).toBe(true);
  });

  /** Tên provider đi vào khoá băm của cache — đổi tên là mọi bản ghi cũ trở nên vô hình. */
  it('name = "vietmap"', () => {
    expect(provider.name).toBe('vietmap');
  });
});

describe('Autocomplete v4 — gõ chữ → gợi ý', () => {
  it('dựng đúng request: text, focus (lat,lng), định dạng hành chính MỚI, apikey', async () => {
    stubFetch({ body: [houseItem] });

    await provider.searchPlaces('197 Trần Phú', BEN_THANH);

    expect(lastUrl().origin + lastUrl().pathname).toBe('https://maps.vietmap.vn/api/autocomplete/v4');
    expect(lastUrl().searchParams.get('text')).toBe('197 Trần Phú');
    // Vietmap đọc lat TRƯỚC lng — đảo nhầm ở Việt Nam là một điểm giữa Ấn Độ Dương.
    expect(lastUrl().searchParams.get('focus')).toBe('10.7721,106.698');
    // 2 cấp xã → tỉnh (ADR 0035): định dạng cũ mang tên quận đã giải thể vào ô địa chỉ.
    expect(lastUrl().searchParams.get('display_type')).toBe('1');
    expect(lastUrl().searchParams.get('apikey')).toBe(KEY);
  });

  it('không có điểm ưu tiên thì không gửi tham số thừa', async () => {
    stubFetch({ body: [] });

    await provider.searchPlaces('Nguyễn Huệ');

    expect(lastUrl().searchParams.has('focus')).toBe(false);
  });

  it('mã địa điểm là ref_id; dòng nhạt là phần hành chính, ngăn bằng ", "', async () => {
    stubFetch({ body: [houseItem] });

    await expect(provider.searchPlaces('197 Trần Phú')).resolves.toEqual([
      {
        placeId: 'geocode:RAkPcicmZ3d',
        primaryText: '197 Trần Phú',
        secondaryText: 'Phường Chợ Quán, Thành Phố Hồ Chí Minh',
      },
    ]);
  });

  it('dòng không có tên thì lấy phần hành chính làm dòng đậm', async () => {
    stubFetch({ body: [{ ...houseItem, name: '' }] });

    await expect(provider.searchPlaces('Chợ Quán')).resolves.toEqual([
      {
        placeId: 'geocode:RAkPcicmZ3d',
        primaryText: 'Phường Chợ Quán, Thành Phố Hồ Chí Minh',
        secondaryText: null,
      },
    ]);
  });

  it('bỏ dòng thiếu ref_id hoặc thiếu chữ; ref_id trùng chỉ giữ dòng đầu', async () => {
    stubFetch({
      body: [
        houseItem,
        { ...houseItem, ref_id: undefined },
        { ...houseItem, ref_id: 'auto:2', name: '', address: '', display: '' },
        { ...houseItem, name: 'Bản trùng mã' },
      ],
    });

    const res = await provider.searchPlaces('197 Trần Phú');

    expect(res).toHaveLength(1);
    expect(res[0]!.primaryText).toBe('197 Trần Phú');
  });

  it('tối đa 6 gợi ý', async () => {
    stubFetch({
      body: Array.from({ length: 10 }, (_, i) => ({ ...houseItem, ref_id: `auto:${i}` })),
    });

    await expect(provider.searchPlaces('Trần Phú')).resolves.toHaveLength(6);
  });

  /**
   * Body không phải danh sách là body LỖI (hết hạn mức, tham số sai). Coi nó là "không có gợi ý"
   * là bắt khách chọn từ một danh sách không bao giờ có gì — ném để ô địa chỉ mở cho nhập tay.
   */
  it('HTTP lỗi hoặc body không phải danh sách → NÉM kèm chi tiết', async () => {
    stubFetch({ body: { code: 'OVER_DAILY_LIMIT', message: 'Daily limit' } });
    await expect(provider.searchPlaces('Nguyễn')).rejects.toThrow(/OVER_DAILY_LIMIT/);

    // Tilemap key gọi Map API trả 423 — cấu hình nhầm key phải lộ ra ở log, không im lặng.
    stubFetch({ body: { message: 'Locked' }, status: 423 });
    await expect(provider.searchPlaces('Nguyễn')).rejects.toThrow(/HTTP 423/);
  });
});

describe('Place v4 — chọn một gợi ý → toạ độ', () => {
  it('dựng đúng request và đọc toạ độ, địa chỉ đầy đủ, tỉnh, xã', async () => {
    stubFetch({ body: housePlace });

    const res = await provider.placeDetails('geocode:RAkPcicmZ3d');

    expect(lastUrl().origin + lastUrl().pathname).toBe('https://maps.vietmap.vn/api/place/v4');
    expect(lastUrl().searchParams.get('refid')).toBe('geocode:RAkPcicmZ3d');
    expect(res).toEqual({
      placeId: 'geocode:RAkPcicmZ3d',
      point: { lat: 10.759222947000069, lng: 106.67590269100003 },
      formattedAddress: '197 Đường Trần Phú, Phường Chợ Quán, Thành Phố Hồ Chí Minh',
      administrativeArea: 'Thành Phố Hồ Chí Minh',
      locality: 'Phường Chợ Quán',
    });
  });

  it('không có toạ độ dùng được → null, TUYỆT ĐỐI không trả một cái ghim bịa', async () => {
    stubFetch({ body: { ...housePlace, lat: undefined, lng: undefined } });
    await expect(provider.placeDetails('auto:1')).resolves.toBeNull();

    stubFetch({ body: null });
    await expect(provider.placeDetails('auto:1')).resolves.toBeNull();
  });

  /** Đo trên key thật 15/10/2026: `refid` không ra gì → HTTP 404, body rỗng. Là "không có". */
  it('HTTP 404 (mã không ra gì) → null, KHÔNG phải sự cố', async () => {
    stubFetch({ body: null, status: 404 });

    await expect(provider.placeDetails('auto:khongcothat')).resolves.toBeNull();
  });

  it('body mang mã lỗi hoặc HTTP lỗi → NÉM (không phải "không có")', async () => {
    stubFetch({ body: { code: 'INVALID_REQUEST', message: 'refid' } });
    await expect(provider.placeDetails('auto:1')).rejects.toThrow(/INVALID_REQUEST/);

    stubFetch({ body: {}, status: 401 });
    await expect(provider.placeDetails('auto:1')).rejects.toThrow(/HTTP 401/);
  });

  it('mã gp1: thời Geoapify (dữ liệu cũ) giải tại chỗ, KHÔNG gọi mạng', async () => {
    stubFetch({ body: housePlace });

    const res = await provider.placeDetails('gp1:10.7743,106.7038');

    expect(res!.point).toEqual(NGUYEN_HUE);
    expect(urls).toHaveLength(0);
  });
});

describe('Geocode — địa chỉ chữ → toạ độ (Search v4 rồi Place v4)', () => {
  it('hai lượt: search địa chỉ đầy đủ, rồi place của dòng đầu', async () => {
    stubFetch({ '/search/v4': { body: [houseItem] }, '/place/v4': { body: housePlace } });

    const res = await provider.geocode('197 Trần Phú, Phường Chợ Quán, Thành phố Hồ Chí Minh');

    expect(urls).toHaveLength(2);
    expect(urlAt(0).pathname).toBe('/api/search/v4');
    expect(urlAt(0).searchParams.get('text')).toBe('197 Trần Phú, Phường Chợ Quán, Thành phố Hồ Chí Minh');
    expect(urlAt(0).searchParams.get('display_type')).toBe('1');
    expect(urlAt(1).searchParams.get('refid')).toBe('geocode:RAkPcicmZ3d');
    expect(res).toEqual({
      point: { lat: 10.759222947000069, lng: 106.67590269100003 },
      formattedAddress: '197 Đường Trần Phú, Phường Chợ Quán, Thành Phố Hồ Chí Minh',
      placeId: 'geocode:RAkPcicmZ3d',
      administrativeArea: 'Thành Phố Hồ Chí Minh',
    });
  });

  it('không có kết quả là CÂU TRẢ LỜI → null, và không tốn lượt Place', async () => {
    stubFetch({ '/search/v4': { body: [] } });

    await expect(provider.geocode('địa chỉ không có thật')).resolves.toBeNull();
    expect(urls).toHaveLength(1);
  });

  /**
   * Phép kiểm đáng giá nhất của khối này: không khớp được số nhà/đường, nhà cung cấp trả về TÂM
   * phường/tỉnh. Ghim ở tâm tỉnh nằm ngay dưới dòng địa chỉ đúng, rồi chảy thẳng vào quãng đường
   * giao xe và thành tiền trên đơn người khác.
   */
  it('dòng đầu chỉ là một đơn vị hành chính → LOẠI, không tốn lượt Place', async () => {
    stubFetch({
      '/search/v4': { body: [{ ...houseItem, name: 'Phường Chợ Quán' }] },
      '/place/v4': { body: housePlace },
    });
    await expect(provider.geocode('999 Đường Không Có, Phường Chợ Quán')).resolves.toBeNull();

    stubFetch({ '/search/v4': { body: [{ ...houseItem, name: 'Hồ Chí Minh' }] } });
    await expect(provider.geocode('Thành phố Hồ Chí Minh')).resolves.toBeNull();

    expect(urls.some((u) => u.includes('/place/v4'))).toBe(false);
  });

  /**
   * Search v4 gần như không bao giờ trả rỗng — hai dòng đầu dưới đây là response THẬT đo 15/10/2026
   * cho một chuỗi vô nghĩa kèm ", Hà Nội, Việt Nam": khớp theo chữ "Hà Nội Việt Nam", một dòng còn
   * ở Nghệ An. Dòng thứ ba là khớp mờ sang một con phố KHÁC cùng số nhà. Nhận dòng đầu là chốt một
   * toạ độ sai mà trông hợp lý; nó thành phí giao trên đơn của người khác.
   */
  it('khớp mờ sang chỗ khác (tên khác hoặc tỉnh khác) → null, không tốn lượt Place', async () => {
    const hanoi = [{ type: 0, name: 'Hà Nội', full_name: 'Thành phố Hà Nội' }];
    const garbage = [
      {
        ...houseItem,
        ref_id: 'geocode:dulich',
        name: 'Du Lịch Hà Nội Việt Nam',
        address: 'Phường Kim Liên, Thành phố Hà Nội',
        boundaries: hanoi,
      },
      {
        ...houseItem,
        ref_id: 'geocode:cuahang',
        name: 'Cửa Hàng Hà Nội Việt Nam',
        address: 'Phường Thành Vinh, Tỉnh Nghệ An',
        boundaries: [{ type: 0, name: 'Nghệ An', full_name: 'Tỉnh Nghệ An' }],
      },
      {
        ...houseItem,
        ref_id: 'geocode:trungphung',
        name: '120 Trung Phụng',
        address: 'Phường Văn Miếu-Quốc Tử Giám, Thành phố Hà Nội',
        boundaries: hanoi,
      },
    ];
    stubFetch({ '/search/v4': { body: garbage }, '/place/v4': { body: housePlace } });

    await expect(provider.geocode('dia chi khong co that, Hà Nội, Việt Nam')).resolves.toBeNull();
    await expect(provider.geocode('Ngõ 120 Trường Chinh, Hà Nội, Việt Nam')).resolves.toBeNull();
    expect(urls.some((u) => u.includes('/place/v4'))).toBe(false);
  });

  it('cùng tên đường nhưng ở tỉnh KHÁC tỉnh trong chuỗi hỏi → loại', async () => {
    stubFetch({ '/search/v4': { body: [houseItem] }, '/place/v4': { body: housePlace } });

    await expect(provider.geocode('197 Trần Phú, Đà Nẵng, Việt Nam')).resolves.toBeNull();
    // Không biết vùng thì không đoán: chuỗi không mang tỉnh nào thì không dòng nào qua.
    await expect(provider.geocode('197 Trần Phú')).resolves.toBeNull();
  });

  it('dòng đúng nằm SAU vài dòng sai → vẫn chọn nó (duyệt cả danh sách, cùng một giao dịch)', async () => {
    stubFetch({
      '/search/v4': {
        body: [
          { ...houseItem, ref_id: 'geocode:wrong', name: '197 Trần Phú Thôn Xa Vệ' },
          // "Đường" là từ chỉ loại đường — người gõ hay bỏ, không tính khi so tên.
          { ...houseItem, ref_id: 'geocode:right', name: '197 Đường Trần Phú' },
        ],
      },
      '/place/v4': { body: housePlace },
    });

    const res = await provider.geocode('197 Trần Phú, Phường Chợ Quán, Hồ Chí Minh, Việt Nam');

    expect(res?.placeId).toBe('geocode:right');
    expect(urlAt(1).searchParams.get('refid')).toBe('geocode:right');
  });

  it('lỗi ở bất kỳ lượt nào → ném để GeoService rơi về unavailable', async () => {
    stubFetch({ '/search/v4': { body: { code: 'OVER_DAILY_LIMIT' } } });
    await expect(provider.geocode('197 Trần Phú')).rejects.toThrow(/OVER_DAILY_LIMIT/);

    stubFetch({ '/search/v4': { body: [houseItem] }, '/place/v4': { body: {}, status: 500 } });
    await expect(provider.geocode('197 Trần Phú, Hồ Chí Minh')).rejects.toThrow(/HTTP 500/);
  });
});

describe('Reverse v4 — toạ độ → địa chỉ chữ (app native)', () => {
  it('giữ NGUYÊN toạ độ đã gửi; trả kèm tỉnh; KHÔNG phát mã địa điểm', async () => {
    stubFetch({ body: [{ ...houseItem, lat: 99, lng: 99 }] });

    const res = await provider.reverseGeocode(BEN_THANH);

    expect(lastUrl().pathname).toBe('/api/reverse/v4');
    expect(lastUrl().searchParams.get('lat')).toBe('10.7721');
    expect(lastUrl().searchParams.get('lng')).toBe('106.698');
    expect(res).toEqual({
      point: BEN_THANH,
      formattedAddress: '197 Trần Phú, Phường Chợ Quán, Thành Phố Hồ Chí Minh',
      // Kết quả được cache theo ô lưới ~110m và trả cho người khác — mã của dòng gần nhất lúc
      // người đầu tiên hỏi sẽ nói sai về điểm của người sau.
      placeId: null,
      administrativeArea: 'Thành Phố Hồ Chí Minh',
    });
  });

  it('không có địa chỉ nào ở đó → null', async () => {
    stubFetch({ body: [] });

    await expect(provider.reverseGeocode(BEN_THANH)).resolves.toBeNull();
  });
});

describe('Route v4 — quãng đường đường bộ một chiều', () => {
  it('hai tham số point (lat,lng) theo đúng thứ tự, vehicle car, hình học mã hoá', async () => {
    stubFetch({ body: { code: 'OK', paths: [{ distance: 3421, time: 600000 }] } });

    const km = await provider.roadDistanceKm(BEN_THANH, NGUYEN_HUE);

    expect(lastUrl().origin + lastUrl().pathname).toBe('https://maps.vietmap.vn/api/route/v4');
    expect(lastUrl().searchParams.getAll('point')).toEqual(['10.7721,106.698', '10.7743,106.7038']);
    expect(lastUrl().searchParams.get('vehicle')).toBe('car');
    expect(lastUrl().searchParams.get('points_encoded')).toBe('true');
    // 3421 m → 3.42 km: làm tròn 2 số lẻ để khớp `Decimal(8,2)` của `geo_route_cache`.
    expect(km).toBe(3.42);
  });

  it('ZERO_RESULTS → không có đường bộ (null), là câu trả lời', async () => {
    stubFetch({ body: { code: 'ZERO_RESULTS', messages: null, paths: [] } });

    await expect(provider.roadDistanceKm(BEN_THANH, NGUYEN_HUE)).resolves.toBeNull();
  });

  it('mã lỗi khác hoặc HTTP lỗi → ném để GeoService rơi về unavailable', async () => {
    stubFetch({ body: { code: 'OVER_DAILY_LIMIT', messages: 'limit' } });
    await expect(provider.roadDistanceKm(BEN_THANH, NGUYEN_HUE)).rejects.toThrow(/OVER_DAILY_LIMIT/);

    stubFetch({ body: { code: 'INVALID_REQUEST' }, status: 400 });
    await expect(provider.roadDistanceKm(BEN_THANH, NGUYEN_HUE)).rejects.toThrow(/HTTP 400/);
  });
});

describe('Static map — ảnh bản đồ tĩnh để XEM (ADR 0061 điều 1)', () => {
  let lastInit: RequestInit | undefined;

  function stubImage(status: number, contentType: string, body: unknown): void {
    global.fetch = ((url: string | URL, init?: RequestInit) => {
      urls.push(String(url));
      lastInit = init;
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers({ 'content-type': contentType }),
        arrayBuffer: () => Promise.resolve(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer),
        json: () => Promise.resolve(body),
      } as Response);
    }) as typeof fetch;
  }

  /** Đo 15/10/2026: POST multipart, services key, trả `image/png`. Nhãn gửi kèm để Vietmap không tự tra ngược. */
  it('POST multipart: toạ độ, cỡ, mức phóng, NHÃN địa chỉ, apikey; trả bytes PNG', async () => {
    stubImage(200, 'image/png', null);

    const png = await provider.staticMapPng(BEN_THANH, '12 Lê Lợi, Bến Thành, Hồ Chí Minh');

    expect(urls[0]).toBe('https://maps.vietmap.vn/api/maps/statics/tm');
    expect(lastInit?.method).toBe('POST');
    const form = lastInit?.body as FormData;
    expect(form.get('lat')).toBe('10.7721');
    expect(form.get('lng')).toBe('106.698');
    expect(form.get('size')).toBe('800x400');
    expect(form.get('address')).toBe('12 Lê Lợi, Bến Thành, Hồ Chí Minh');
    expect(form.get('apikey')).toBe(KEY);
    expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('HTTP lỗi hoặc không phải ảnh PNG → NÉM (không cache một trang lỗi làm ảnh)', async () => {
    stubImage(401, 'text/plain', null);
    await expect(provider.staticMapPng(BEN_THANH, 'x')).rejects.toThrow(/HTTP 401/);

    stubImage(200, 'application/json', { code: 'OVER_DAILY_LIMIT' });
    await expect(provider.staticMapPng(BEN_THANH, 'x')).rejects.toThrow(/OVER_DAILY_LIMIT/);
  });
});

/**
 * Cầu dao chi phí (ADR 0061 điều 3): `/places/*` là endpoint công khai. Chạm trần thì KHÔNG gọi
 * mạng nữa — bản đồ coi như "không hỏi được" tới hết ngày. Mỗi REQUEST HTTP là một lượt: một lần
 * geocode gồm search + place là hai lượt.
 */
describe('Trần lượt gọi trong ngày', () => {
  const budgetConfig = {
    get: (name: string) => (name === 'GEO_DAILY_CALL_BUDGET' ? 3 : KEY),
    getOrThrow: () => KEY,
  } as unknown as ConfigService;

  it('chạm trần → ném GeoQuotaExceededError và KHÔNG gọi mạng', async () => {
    const limited = new VietmapGeoProvider(budgetConfig);
    stubFetch({ '/autocomplete/v4': { body: [] }, '/search/v4': { body: [houseItem] }, '/place/v4': { body: housePlace } });

    await limited.searchPlaces('Lê Lợi');
    await limited.geocode('197 Trần Phú, Hồ Chí Minh');
    expect(urls).toHaveLength(3);

    await expect(limited.roadDistanceKm(BEN_THANH, NGUYEN_HUE)).rejects.toBeInstanceOf(
      GeoQuotaExceededError,
    );
    expect(urls).toHaveLength(3);
  });

  it('ngày mới (giờ Việt Nam) thì đếm lại từ đầu', async () => {
    const limited = new VietmapGeoProvider(budgetConfig);
    stubFetch({ body: [] });
    const now = jest.spyOn(Date, 'now');
    try {
      // 23:30 ngày 14/10 giờ VN = 16:30Z.
      now.mockReturnValue(Date.parse('2026-10-14T16:30:00Z'));
      await limited.searchPlaces('a1');
      await limited.searchPlaces('a2');
      await limited.searchPlaces('a3');
      await expect(limited.searchPlaces('a4')).rejects.toBeInstanceOf(GeoQuotaExceededError);

      // 00:30 ngày 15/10 giờ VN = 17:30Z cùng ngày UTC — vẫn là NGÀY MỚI theo giờ Việt Nam.
      now.mockReturnValue(Date.parse('2026-10-14T17:30:00Z'));
      await expect(limited.searchPlaces('a5')).resolves.toEqual([]);
    } finally {
      now.mockRestore();
    }
  });
});
