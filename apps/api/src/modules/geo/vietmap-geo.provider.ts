import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isValidGeoPoint, type GeoPoint } from '@xeprime/domain';
import { DailyCallBudget } from './daily-call-budget';
import type { GeocodeResult, GeoProvider, PlaceDetail, PlaceSuggestion } from './geo-provider';

/** Vietmap Maps API v4 — https://maps.vietmap.vn/docs/map-api/overview/ */
const API_BASE = 'https://maps.vietmap.vn/api';
const AUTOCOMPLETE_URL = `${API_BASE}/autocomplete/v4`;
const SEARCH_URL = `${API_BASE}/search/v4`;
const PLACE_URL = `${API_BASE}/place/v4`;
const REVERSE_URL = `${API_BASE}/reverse/v4`;
const ROUTE_URL = `${API_BASE}/route/v4`;
/** Static Map — POST multipart, trả PNG. Dùng services key (đo 15/10/2026). */
const STATIC_MAP_URL = `${API_BASE}/maps/statics/tm`;

/**
 * Ảnh tĩnh 2:1 ở mức phố. Một cỡ duy nhất cho mọi chỗ hiện: khung trên trang co theo bề ngang và
 * cắt `object-fit: cover` quanh tâm (nơi có ghim), nên một ảnh phục vụ được cả trang xe lẫn thẻ hồ
 * sơ xe — và một khoá cache cho mỗi chi nhánh thay vì một khoá cho mỗi cỡ.
 */
const STATIC_MAP_SIZE = '800x400';
const STATIC_MAP_ZOOM = '16';
/** Ảnh chỉ để xem, không nằm trên đường đặt xe — cho chậm hơn các lượt tra một chút. */
const STATIC_MAP_TIMEOUT_MS = 6_000;

/**
 * Định dạng hành chính MỚI, hai cấp (xã/phường → tỉnh) — đúng mô hình địa chỉ của hệ thống
 * (ADR 0035, 34 tỉnh từ 01/07/2025). Định dạng cũ ba cấp sẽ mang tên quận/huyện đã giải thể vào
 * ô địa chỉ của người dùng.
 */
const DISPLAY_TYPE_NEW = '1';

/**
 * Timeout ngắn có chủ đích. Đây là tiện ích ước lượng nằm giữa lúc khách đang điền form — thà
 * bỏ qua phần phí dự kiến còn hơn treo nút "Gửi yêu cầu" 10 giây vì bản đồ chậm.
 */
const GEOCODE_TIMEOUT_MS = 3_000;
const ROUTE_TIMEOUT_MS = 4_000;
/** Gợi ý chạy theo từng phím gõ (đã debounce) — chậm hơn 2,5s thì kết quả đã lỗi thời rồi. */
const PLACES_TIMEOUT_MS = 2_500;

/**
 * Số gợi ý tối đa hiển thị. Vietmap tính tiền theo LƯỢT gọi chứ không theo số dòng (tối đa 10),
 * nên con số này không đổi chi phí — nó giữ danh sách đủ ngắn để chọn nhanh.
 */
const PLACES_MAX_SUGGESTIONS = 6;

/** Phương tiện đo quãng đường giao xe: ô tô — đúng thứ chạy trên đường khi giao xe tận nơi. */
const ROUTE_VEHICLE = 'car';

const DEFAULT_DAILY_CALL_BUDGET = 3000;

/**
 * Mã địa điểm thời Geoapify (`gp1:<lat>,<lng>`, ADR 0037 điều 5) còn nằm trong dữ liệu cũ. Toạ độ
 * nằm sẵn trong mã nên giải ngay tại chỗ — gửi nó sang Vietmap chỉ tốn một lượt để nhận "không có".
 */
const LEGACY_PLACE_TOKEN_PREFIX = 'gp1:';

const latLng = (p: GeoPoint): string => `${p.lat},${p.lng}`;

function parseLegacyToken(token: string): GeoPoint | null {
  if (!token.startsWith(LEGACY_PLACE_TOKEN_PREFIX)) return null;
  const [lat, lng] = token.slice(LEGACY_PLACE_TOKEN_PREFIX.length).split(',');
  const point = { lat: Number(lat), lng: Number(lng) };
  return isValidGeoPoint(point) ? point : null;
}

interface VietmapBoundary {
  /** 0 = tỉnh/thành, 1 = quận/huyện (chỉ định dạng cũ), 2 = xã/phường. */
  type?: number;
  name?: string;
  full_name?: string;
}

/** Một dòng của Autocomplete / Search / Reverse v4. Autocomplete và Search KHÔNG có toạ độ. */
interface VietmapItem {
  ref_id?: string;
  name?: string;
  /** Phần hành chính, ngăn bằng dấu phẩy không cách: `"Phường Chợ Quán,Thành Phố Hồ Chí Minh"`. */
  address?: string;
  display?: string;
  boundaries?: VietmapBoundary[];
  lat?: number;
  lng?: number;
}

/** Place v4 — chi tiết một `ref_id`. */
interface VietmapPlace {
  display?: string;
  name?: string;
  address?: string;
  city?: string;
  ward?: string;
  lat?: number;
  lng?: number;
}

interface VietmapRoute {
  code?: string;
  messages?: unknown;
  paths?: Array<{ distance?: number }>;
}

/** Chuỗi nhận diện lỗi trong một body Vietmap (các API v4 không cùng một phong bì lỗi). */
function errorDetail(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '';
  const b = body as Record<string, unknown>;
  return [b.code, b.message, b.messages, b.error]
    .filter((v) => v != null && v !== '')
    .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
    .join(' ');
}

/**
 * Ghép các phần địa chỉ thành MỘT dòng `"a, b, c"`: tách cả những phần Vietmap đã nối sẵn bằng dấu
 * phẩy không cách, bỏ phần rỗng và phần trùng lặp (tên POI trùng tên đường…).
 */
function joinAddress(...parts: Array<string | null | undefined>): string {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    for (const piece of (part ?? '').split(',')) {
      const text = piece.trim();
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
  }
  return out.join(', ');
}

/**
 * Kết quả chỉ ở mức đơn vị hành chính (tên dòng = tên một xã/phường/tỉnh trong `boundaries`) là
 * quá thô để máy tự chốt toạ độ một địa chỉ: khi không khớp được số nhà/đường, nhà cung cấp trả về
 * TÂM của phường/tỉnh. Một cái ghim ở tâm tỉnh nằm ngay dưới dòng địa chỉ đúng là kiểu sai thuyết
 * phục nhất, và nó chảy thẳng vào quãng đường giao xe rồi thành tiền trên đơn của người khác (ý
 * định của ADR 0037 điều 6, giữ ở ADR 0061 điều 5).
 */
function isAdministrativeOnly(item: VietmapItem): boolean {
  const name = item.name?.trim().toLowerCase();
  if (!name) return true;
  return (item.boundaries ?? []).some(
    (b) => b.full_name?.trim().toLowerCase() === name || b.name?.trim().toLowerCase() === name,
  );
}

/** Chữ → dạng so khớp: bỏ dấu, `đ` → `d`, chữ thường, mọi thứ không phải chữ/số thành khoảng trắng. */
function fold(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Từ chỉ LOẠI đường/ngõ — người gõ hay bỏ, Vietmap hay thêm ("133 Đường Trung Lương 11" so với
 * "133 Trung Lương 11"); chúng không nói gì về chỗ nào nên không tính khi so tên.
 */
const GENERIC_ADDRESS_WORDS = new Set(['duong', 'd', 'pho', 'p', 'ngo', 'ngach', 'hem', 'kiet', 'so', 'sn']);

/**
 * Một dòng Search có thật sự là địa chỉ được hỏi không.
 *
 * Search v4 gần như không bao giờ trả "không có" — nó khớp mờ theo TỪ. Đo trên key thật
 * 15/10/2026: một chuỗi vô nghĩa kèm ", Hà Nội, Việt Nam" ra "Du Lịch Hà Nội Việt Nam" (Kim Liên) và
 * "Cửa Hàng Hà Nội Việt Nam" ở NGHỆ AN — chỉ vì chúng chứa chữ "Hà Nội Việt Nam". Nhận dòng đầu là
 * chốt một toạ độ sai mà trông hợp lý, rồi nó thành phí giao trên đơn của người khác. Nên một dòng
 * chỉ được nhận khi:
 *
 *   1. mọi từ mang nghĩa trong TÊN của nó có mặt trong chuỗi hỏi — và có ít nhất một từ chữ (một
 *      số nhà trơ trọi khớp với mọi con đường);
 *   2. TỈNH của nó (`boundaries` loại 0) có mặt trong chuỗi hỏi. Chuỗi hỏi luôn kèm tỉnh
 *      (`addressGeocodeQuery`); chuỗi không có tỉnh thì không dòng nào qua — không biết vùng thì
 *      không đoán.
 *
 * Kết quả mức ĐƯỜNG (tên dòng thiếu số nhà) vẫn qua, đúng như ADR 0061 điều 5.
 */
function matchesQuery(item: VietmapItem, foldedQuery: string): boolean {
  const query = ` ${foldedQuery} `;
  const words = fold(item.name)
    .split(' ')
    .filter((w) => w && !GENERIC_ADDRESS_WORDS.has(w));
  if (!words.some((w) => /[a-z]/.test(w))) return false;
  if (!words.every((w) => query.includes(` ${w} `))) return false;
  const province = fold(item.boundaries?.find((b) => b.type === 0)?.name);
  return province !== '' && query.includes(` ${province} `);
}

function toPoint(src: { lat?: number; lng?: number } | null | undefined): GeoPoint | null {
  const point = { lat: Number(src?.lat), lng: Number(src?.lng) };
  return isValidGeoPoint(point) ? point : null;
}

/**
 * Vietmap — gợi ý địa chỉ, geocode và quãng đường trên dữ liệu bản đồ Việt Nam (ADR 0061).
 *
 * Gọi bằng `fetch` trần, không SDK: năm request REST không đáng một dependency.
 *
 * Key ở đây là **services key** (`VIETMAP_API_KEY`) — giữ ở backend, giới hạn theo IP của máy chạy
 * API trên Vietmap console. Web KHÔNG có key bản đồ nào: bản đồ để xem là ảnh tĩnh do chính API
 * vẽ hộ ({@link VietmapGeoProvider.staticMapPng}, ADR 0061 điều 1), nên không có thứ gì nằm lộ thiên
 * trong bundle để người khác tiêu tiền của mình.
 *
 * **Chi phí là ràng buộc thiết kế.** Vietmap tính theo GIAO DỊCH: autocomplete / search / place /
 * reverse = 1 giao dịch/lượt, route 2 điểm = 1 giao dịch. Gợi ý KHÔNG kèm toạ độ, nên
 * bước "chọn gợi ý" là một lượt Place thật — `GeoService` cache nó theo `ref_id`.
 */
@Injectable()
export class VietmapGeoProvider implements GeoProvider {
  readonly name = 'vietmap';
  private readonly logger = new Logger(VietmapGeoProvider.name);
  private readonly budget: DailyCallBudget;

  constructor(private readonly config: ConfigService) {
    this.budget = new DailyCallBudget(
      () => Number(this.config.get('GEO_DAILY_CALL_BUDGET')) || DEFAULT_DAILY_CALL_BUDGET,
      this.logger,
      'Vietmap',
    );
  }

  get enabled(): boolean {
    return Boolean(this.config.get<string>('VIETMAP_API_KEY'));
  }

  private get key(): string {
    return this.config.getOrThrow<string>('VIETMAP_API_KEY');
  }

  /**
   * Một lượt GET tới Vietmap — trả body đã parse. Ném khi HTTP lỗi: key sai, hết giao dịch, sai
   * loại key (tilemap key gọi Map API trả 423) là chuyện của người vận hành, không phải của khách;
   * `GeoService` nuốt thành `unavailable` + log.
   */
  private async request(
    api: string,
    base: string,
    params: Record<string, string | string[]>,
    timeoutMs: number,
    /** HTTP 404 là "không có" (body rỗng) chứ không phải sự cố — Place trả vậy cho mã không ra gì. */
    notFoundAsNull = false,
  ): Promise<unknown> {
    const url = new URL(base);
    for (const [k, v] of Object.entries(params)) {
      // `point` của Route lặp lại nhiều lần — `set` sẽ chỉ giữ điểm cuối.
      for (const value of Array.isArray(v) ? v : [v]) url.searchParams.append(k, value);
    }
    url.searchParams.set('apikey', this.key);

    this.budget.take(api);
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const body: unknown = await res.json().catch(() => null);
    if (notFoundAsNull && res.status === 404) return null;
    // Key sai trả 401 (đo 15/10/2026), Key Tilemap gọi Map API trả 423.
    if (!res.ok) throw new Error(`${api} trả HTTP ${res.status} ${errorDetail(body)}`.trim());
    return body;
  }

  /**
   * Autocomplete/Search/Reverse trả MẢNG. Thứ khác mảng là một body lỗi (hết hạn mức, tham số sai)
   * — ném chứ không coi là "không có kết quả": báo khách "không tìm thấy" lúc đó là đổ lỗi cho họ
   * về một sự cố của mình.
   */
  private async list(
    api: string,
    base: string,
    params: Record<string, string>,
    timeoutMs: number,
  ): Promise<VietmapItem[]> {
    const body = await this.request(api, base, params, timeoutMs);
    if (!Array.isArray(body)) {
      throw new Error(`${api} trả body không phải danh sách ${errorDetail(body)}`.trim());
    }
    return body as VietmapItem[];
  }

  /** Một lượt Place v4: `ref_id` → toạ độ + địa chỉ đầy đủ. `null` = mã không còn ra gì. */
  private async place(refId: string): Promise<PlaceDetail | null> {
    const body = (await this.request(
      'Place',
      PLACE_URL,
      { refid: refId },
      GEOCODE_TIMEOUT_MS,
      true,
    )) as (VietmapPlace & Record<string, unknown>) | null;
    const point = toPoint(body);
    if (!point) {
      const detail = errorDetail(body);
      if (detail) throw new Error(`Place trả lỗi ${detail}`);
      return null;
    }
    const formattedAddress =
      joinAddress(body?.display) || joinAddress(body?.address || body?.name, body?.ward, body?.city);
    return {
      placeId: refId,
      point,
      formattedAddress: formattedAddress || null,
      administrativeArea: body?.city?.trim() || null,
      locality: body?.ward?.trim() || null,
    };
  }

  /**
   * Địa chỉ chữ → toạ độ: Search v4 (không có toạ độ) rồi Place v4 cho dòng KHỚP ĐẦU TIÊN — hai
   * giao dịch; không dòng nào khớp thì chỉ một. Chỉ chạy khi người dùng không chọn gợi ý nào (lưu
   * địa chỉ gõ tay, báo giá cho địa chỉ gõ tay), và luôn qua cache của `GeoService`.
   *
   * Duyệt cả danh sách (tối đa 10 dòng, cùng một giao dịch) chứ không chỉ dòng đầu: Search xếp
   * hạng mờ, nên dòng đúng có thể nằm sau vài dòng sai — xem {@link matchesQuery}.
   */
  async geocode(address: string): Promise<GeocodeResult | null> {
    const results = await this.list(
      'Search',
      SEARCH_URL,
      { text: address, display_type: DISPLAY_TYPE_NEW },
      GEOCODE_TIMEOUT_MS,
    );
    const folded = fold(address);
    const hit = results.find(
      (item) => Boolean(item.ref_id) && !isAdministrativeOnly(item) && matchesQuery(item, folded),
    );
    if (!hit?.ref_id) {
      this.logger.debug(
        `Không dòng Search nào khớp "${address}" (dòng đầu: "${results[0]?.name ?? '—'}", ${results.length} dòng)`,
      );
      return null;
    }

    const detail = await this.place(hit.ref_id);
    if (!detail) return null;
    return {
      point: detail.point,
      formattedAddress: detail.formattedAddress,
      placeId: hit.ref_id,
      administrativeArea: detail.administrativeArea,
    };
  }

  /**
   * Gõ chữ → gợi ý (Autocomplete v4). `focus` chỉ KÉO thứ tự kết quả về gần điểm đó (tâm tỉnh
   * người dùng vừa chọn), không loại bỏ — một địa điểm ở tỉnh khác vẫn ra nếu nó khớp nhất.
   *
   * KHÔNG áp phép loại "chỉ mức hành chính" ở đây: gợi ý là thứ người dùng ĐỌC rồi tự chọn, còn
   * `geocode()` là chỗ máy tự chốt.
   */
  async searchPlaces(query: string, biasPoint?: GeoPoint | null): Promise<PlaceSuggestion[]> {
    const params: Record<string, string> = { text: query, display_type: DISPLAY_TYPE_NEW };
    if (biasPoint && isValidGeoPoint(biasPoint)) params.focus = latLng(biasPoint);

    const results = await this.list('Autocomplete', AUTOCOMPLETE_URL, params, PLACES_TIMEOUT_MS);

    const suggestions: PlaceSuggestion[] = [];
    const seen = new Set<string>();
    for (const item of results) {
      const placeId = item.ref_id?.trim();
      const name = item.name?.trim() ?? '';
      const area = joinAddress(item.address);
      const primaryText = name || area || joinAddress(item.display);
      // Không mã thì bấm vào không tra được gì; không chữ thì không có gì để đọc. Bỏ cả hai.
      if (!placeId || !primaryText || seen.has(placeId)) continue;
      seen.add(placeId);
      suggestions.push({
        placeId,
        primaryText,
        secondaryText: name && area ? area : null,
      });
      if (suggestions.length === PLACES_MAX_SUGGESTIONS) break;
    }
    return suggestions;
  }

  /** Một gợi ý đã chọn → toạ độ (Place v4). Mã `gp1:` cũ giải tại chỗ, không gọi mạng. */
  placeDetails(placeId: string): Promise<PlaceDetail | null> {
    const legacy = parseLegacyToken(placeId);
    if (legacy) {
      return Promise.resolve({
        placeId,
        point: legacy,
        formattedAddress: null,
        administrativeArea: null,
        locality: null,
      });
    }
    return this.place(placeId);
  }

  /**
   * Toạ độ → địa chỉ chữ (Reverse v4). Web không còn ghim để kéo; người gọi là app native (đoán
   * tỉnh từ vị trí thiết bị, kéo ghim trên bản đồ của app).
   */
  async reverseGeocode(point: GeoPoint): Promise<GeocodeResult | null> {
    const results = await this.list(
      'Reverse',
      REVERSE_URL,
      { lat: String(point.lat), lng: String(point.lng), display_type: DISPLAY_TYPE_NEW },
      GEOCODE_TIMEOUT_MS,
    );
    const top = results[0];
    const formattedAddress = joinAddress(top?.name, top?.address) || joinAddress(top?.display);
    if (!top || !formattedAddress) return null;
    return {
      // Giữ NGUYÊN toạ độ đã gửi lên: cái ghim là thứ người dùng chủ động đặt, còn địa chỉ chữ
      // chỉ là chú thích cho nó.
      point,
      formattedAddress,
      /*
       * Không phát mã địa điểm cho một toạ độ: kết quả này được cache theo ô lưới ~110m và trả cho
       * NGƯỜI KHÁC ở gần đó — mã của dòng gần nhất lúc người đầu tiên hỏi sẽ nói sai về điểm của
       * người sau.
       */
      placeId: null,
      administrativeArea: top.boundaries?.find((b) => b.type === 0)?.full_name?.trim() || null,
    };
  }

  /**
   * Ảnh bản đồ tĩnh (Static Map) — POST multipart, trả PNG có ghim ở tâm và khung địa chỉ `label`.
   *
   * Gửi kèm `address` thay vì để Vietmap tự tra ngược toạ độ ra chữ: dòng đó nơi gọi đã có sẵn.
   * Gọi qua `GeoService.staticMap` — có cache theo điểm, nên mỗi chi nhánh chỉ tốn một lượt cho
   * mỗi lần tiến trình API khởi động.
   */
  async staticMapPng(point: GeoPoint, label: string): Promise<Buffer> {
    const form = new FormData();
    form.set('apikey', this.key);
    form.set('lat', String(point.lat));
    form.set('lng', String(point.lng));
    form.set('zoom', STATIC_MAP_ZOOM);
    form.set('size', STATIC_MAP_SIZE);
    form.set('address', label);

    this.budget.take('Static map');
    const res = await fetch(STATIC_MAP_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(STATIC_MAP_TIMEOUT_MS),
    });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/png')) {
      const detail = type.includes('json') ? errorDetail(await res.json().catch(() => null)) : '';
      throw new Error(`Static map trả HTTP ${res.status} ${type} ${detail}`.trim());
    }
    return Buffer.from(await res.arrayBuffer());
  }

  /**
   * Khoảng cách ĐƯỜNG BỘ một chiều (km) bằng Route v4 hai điểm — một giao dịch, bằng Matrix 1×1,
   * và là API duy nhất tài liệu ghi rõ đơn vị lẫn mã "không có đường" (`ZERO_RESULTS`).
   */
  async roadDistanceKm(origin: GeoPoint, destination: GeoPoint): Promise<number | null> {
    const body = (await this.request(
      'Route',
      ROUTE_URL,
      {
        point: [latLng(origin), latLng(destination)],
        vehicle: ROUTE_VEHICLE,
        // Hình học tuyến đường không dùng tới — dạng mã hoá giữ response nhỏ nhất.
        points_encoded: 'true',
      },
      ROUTE_TIMEOUT_MS,
    )) as VietmapRoute | null;

    const code = body?.code?.toUpperCase();
    // Không có tuyến đường bộ nối hai điểm (đảo không có phà…) — là câu trả lời, không phải lỗi.
    if (code === 'ZERO_RESULTS') return null;
    if (code !== 'OK') throw new Error(`Route trả lỗi ${errorDetail(body) || 'không có mã'}`);

    const meters = body?.paths?.[0]?.distance;
    if (typeof meters !== 'number' || !Number.isFinite(meters)) return null;

    // Làm tròn 2 số lẻ: khớp `Decimal(8,2)` ở `geo_route_cache` để giá trị ghi xuống và giá trị
    // đọc lên là một, không lệch ở chữ số thứ ba giữa lần đầu và lần trúng cache.
    return Math.round((meters / 1000) * 100) / 100;
  }
}
