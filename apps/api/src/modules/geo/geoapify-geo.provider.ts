import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isValidGeoPoint, type GeoPoint } from '@xeprime/domain';
import type { GeocodeResult, GeoProvider, PlaceDetail, PlaceSuggestion } from './geo-provider';

const GEOCODE_URL = 'https://api.geoapify.com/v1/geocode/search';
const REVERSE_URL = 'https://api.geoapify.com/v1/geocode/reverse';
const AUTOCOMPLETE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete';
const ROUTING_URL = 'https://api.geoapify.com/v1/routing';

/**
 * Timeout ngắn có chủ đích. Đây là tiện ích ước lượng nằm giữa lúc khách đang điền form — thà
 * bỏ qua phần phí dự kiến còn hơn treo nút "Gửi yêu cầu" 10 giây vì bản đồ chậm.
 */
const GEOCODE_TIMEOUT_MS = 3_000;
const ROUTES_TIMEOUT_MS = 4_000;
/** Gợi ý chạy theo từng phím gõ (đã debounce) — chậm hơn 2,5s thì kết quả đã lỗi thời rồi. */
const PLACES_TIMEOUT_MS = 2_500;

/**
 * Số gợi ý tối đa. Danh sách dài hơn không giúp ai chọn nhanh hơn, và mỗi request đều trừ vào
 * hạn mức 3.000 credit/ngày của gói miễn phí.
 */
const PLACES_MAX_SUGGESTIONS = 6;

/** Bán kính ưu tiên quanh điểm gợi ý (mét) — đủ phủ một tỉnh mà không khoá cứng kết quả. */
const PLACES_BIAS_RADIUS_M = 50_000;

/** Chỉ tra trong Việt Nam: sản phẩm chỉ chạy ở đây, và giới hạn vùng làm geocode chính xác hơn. */
const COUNTRY_FILTER = 'countrycode:vn';

/** Ngôn ngữ kết quả. Tên địa danh Việt Nam trong OSM vốn đã là tiếng Việt, đây là để chắc chắn. */
const LANG = 'vi';

/**
 * Ngưỡng tin cậy tối thiểu để CHẤP NHẬN một kết quả geocode.
 *
 * Đây là khác biệt lớn nhất so với Google và là lý do hằng số này tồn tại. Google trả
 * `ZERO_RESULTS` khi không tra được; Geoapify/OSM thì gần như luôn trả về **một thứ gì đó** —
 * thường là tâm của xã hoặc của tỉnh khi không khớp được số nhà. Một cái ghim ở tâm tỉnh nằm
 * ngay dưới dòng địa chỉ đúng là kiểu sai thuyết phục nhất, và nó chảy thẳng vào quãng đường
 * giao xe rồi thành tiền trên đơn của người khác.
 *
 * `rank.confidence` chạy 0..1. Mức 0,25 loại được nhóm khớp-theo-tỉnh mà vẫn giữ các địa chỉ
 * khớp một phần (số nhà lạ trên một con đường có thật) — đúng nhóm mà người dùng sẽ tự chỉnh
 * ghim, vì giao diện đã bắt họ nhìn cái ghim một lần trước khi lưu.
 */
const MIN_GEOCODE_CONFIDENCE = 0.25;

/**
 * Thứ tự toạ độ của Geoapify KHÔNG nhất quán giữa các API, và đó là bẫy đắt nhất ở file này:
 * `bias=proximity:` nhận **lon,lat**, còn `waypoints=` của Routing nhận **lat,lon**. Đảo nhầm
 * hai con số ở Việt Nam cho ra một điểm giữa Ấn Độ Dương — vẫn là toạ độ hợp lệ, vẫn tính ra
 * được một khoảng cách, và không có gì báo lỗi. Hai helper dưới đây để không ai phải nhớ.
 */
const lonLat = (p: GeoPoint): string => `${p.lng},${p.lat}`;
const latLon = (p: GeoPoint): string => `${p.lat},${p.lng}`;

/**
 * Tiền tố của MÃ ĐỊA ĐIỂM do provider này phát ra. Có số phiên bản để đổi định dạng sau này mà
 * không hiểu nhầm mã cũ đang nằm trong `branches.place_id` của khách.
 */
const PLACE_TOKEN_PREFIX = 'gp1:';

/**
 * Mã địa điểm của Geoapify là toạ độ, KHÔNG phải `place_id` thô của họ. Đây là điều bất ngờ nhất
 * ở file này nên nó phải được giải thích ở đúng chỗ.
 *
 * `place_id` của Geoapify **không giải được ngược** cho kết quả loại `building` — tức là địa chỉ
 * CÓ SỐ NHÀ, đúng thứ một đơn giao xe cần. `/v2/place-details` trả HTTP 200 với
 * `{"features":[]}` cho mọi tổ hợp tham số (đã kiểm chứng trên dữ liệu thật ở Huế và Đà Nẵng).
 * Nó chỉ giải được `street` và POI.
 *
 * Nhưng autocomplete đã kèm sẵn toạ độ cho mọi kết quả. Nên mã địa điểm gói chính toạ độ đó lại,
 * và {@link GeoapifyGeoProvider.placeDetails} giải nó bằng reverse geocode — thứ trả lời được ở
 * bất kỳ điểm nào trên đất liền.
 *
 * `place_id` thô bị BỎ hẳn: nó không giải được, không dùng ở đâu khác, và nhét thêm ~140 ký tự
 * vào một cột `VarChar(255)` chỉ để làm kỷ niệm là tự chuốc lấy rủi ro tràn cột.
 */
function placeToken(point: GeoPoint): string {
  return `${PLACE_TOKEN_PREFIX}${latLon(point)}`;
}

/** `null` = không phải mã của provider này (mã Google cũ, hoặc chuỗi bịa). */
function parsePlaceToken(token: string): GeoPoint | null {
  if (!token.startsWith(PLACE_TOKEN_PREFIX)) return null;
  const [lat, lng] = token.slice(PLACE_TOKEN_PREFIX.length).split(',').map(Number);
  const point = { lat: Number(lat), lng: Number(lng) };
  return isValidGeoPoint(point) ? point : null;
}

/** Một phần tử `results[]` của nhóm API geocoding (`format=json`). */
interface GeoapifyAddress {
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  lat?: number;
  lon?: number;
  state?: string;
  county?: string;
  city?: string;
  district?: string;
  suburb?: string;
  village?: string;
  rank?: { confidence?: number };
}

/**
 * Tên cấp TỈNH theo dữ liệu nhà cung cấp.
 *
 * `state ?? city` chứ không chỉ `state`, vì OpenStreetMap không nhất quán ở Việt Nam — đã đo
 * trên dữ liệu thật:
 *
 * | Nơi     | `state`                 | `city`                  |
 * | ------- | ----------------------- | ----------------------- |
 * | Hà Nội  | *(không có)*            | `Hà Nội`                |
 * | Đà Nẵng | `Đà Nẵng`               | `Thành phố Đà Nẵng`     |
 * | Nghệ An | `Tỉnh Nghệ An`          | `Phường Vinh Hưng` (xã) |
 *
 * Chỉ đọc `state` là Hà Nội mất tỉnh. Giá trị này đi tiếp vào `ProvincesService.resolveCode`
 * qua bảng bí danh, nên "Đà Nẵng" hay "Thành phố Đà Nẵng" đều về đúng một mã; quy không được
 * thì trả `null` và người dùng tự chọn — không bao giờ đoán bừa.
 */
const provinceNameOf = (p: GeoapifyAddress): string | null => p.state ?? p.city ?? null;

/**
 * Tên cấp DƯỚI tỉnh. `suburb` trước vì đó là chỗ OSM để tên phường ở đô thị Việt Nam; `county`
 * hay là tên quận/huyện cũ (`Hoa Vang`, `Quan 8`), để sau cùng với `district`/`village`.
 */
const localityNameOf = (p: GeoapifyAddress): string | null =>
  p.suburb ?? p.district ?? p.county ?? p.village ?? null;

interface GeocodeApiResponse {
  results?: GeoapifyAddress[];
  error?: string;
  message?: string;
}

interface RoutingApiResponse {
  results?: Array<{ distance?: number }>;
  error?: string;
  message?: string;
}

/**
 * Geoapify — geocoding, gợi ý địa điểm và định tuyến trên dữ liệu OpenStreetMap.
 *
 * Gọi bằng `fetch` trần, không SDK: năm request REST không đáng đánh đổi bằng một dependency.
 *
 * Key ở đây là **key server** (`GEOAPIFY_API_KEY`), khoá theo IP trong Geoapify Projects và
 * KHÔNG BAO GIỜ đi qua `NEXT_PUBLIC_*`. Key vẽ bản đồ của web là một key khác, khoá theo HTTP
 * referrer — trộn hai key lại là mở hạn mức của mình cho bất kỳ ai xem trang.
 *
 * **Về chất lượng dữ liệu.** OSM ở Việt Nam phủ tốt tên đường ở đô thị lớn nhưng thưa ở số nhà
 * và hẻm. Toàn bộ luồng nhập địa chỉ đã được thiết kế quanh đúng giả định đó từ trước: tỉnh/xã
 * lấy từ danh mục của mình, nhà cung cấp chỉ cho toạ độ và phần "số nhà, đường", và người dùng
 * phải nhìn ghim một lần trước khi lưu. Xem thêm {@link MIN_GEOCODE_CONFIDENCE}.
 */
@Injectable()
export class GeoapifyGeoProvider implements GeoProvider {
  readonly name = 'geoapify';
  private readonly logger = new Logger(GeoapifyGeoProvider.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.get<string>('GEOAPIFY_API_KEY'));
  }

  private get key(): string {
    return this.config.getOrThrow<string>('GEOAPIFY_API_KEY');
  }

  /**
   * Geoapify báo lỗi bằng HTTP status kèm `{ error, message }` trong thân — gom một chỗ để mọi
   * method ném ra cùng một kiểu câu, và để `GeoService` chỉ có một thứ phải nuốt.
   */
  private static failure(api: string, status: number, body: { error?: string; message?: string }): Error {
    const detail = body.message ?? body.error ?? '';
    return new Error(`${api} trả HTTP ${status} ${detail}`.trim());
  }

  private toPoint(raw: GeoapifyAddress | undefined): GeoPoint | null {
    const point: GeoPoint = { lat: Number(raw?.lat), lng: Number(raw?.lon) };
    return isValidGeoPoint(point) ? point : null;
  }

  async geocode(address: string): Promise<GeocodeResult | null> {
    const url = new URL(GEOCODE_URL);
    url.searchParams.set('text', address);
    url.searchParams.set('filter', COUNTRY_FILTER);
    url.searchParams.set('lang', LANG);
    // Chỉ cần kết quả tốt nhất — xin thêm dòng không làm nó đúng hơn, chỉ làm phản hồi nặng hơn.
    url.searchParams.set('limit', '1');
    url.searchParams.set('format', 'json');
    url.searchParams.set('apiKey', this.key);

    const res = await fetch(url, { signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS) });
    const body = (await res.json().catch(() => ({}))) as GeocodeApiResponse;
    if (!res.ok) {
      // Hết hạn mức / key sai là chuyện của người vận hành, không phải của khách — ném lên để
      // GeoService nuốt thành `unavailable` và ghi log, đừng đổ lỗi cho địa chỉ.
      throw GeoapifyGeoProvider.failure('Geocoding API', res.status, body);
    }

    const top = body.results?.[0];
    // Mảng rỗng = địa chỉ đó thật sự không tra được. Là câu trả lời, không phải lỗi.
    if (!top) return null;

    const confidence = top.rank?.confidence ?? 0;
    if (confidence < MIN_GEOCODE_CONFIDENCE) {
      this.logger.debug(`Bỏ kết quả geocode confidence ${confidence} cho "${address}"`);
      return null;
    }

    const point = this.toPoint(top);
    if (!point) {
      this.logger.warn(`Geocoding trả toạ độ không dùng được cho "${address}"`);
      return null;
    }

    return {
      point,
      formattedAddress: top.formatted ?? null,
      placeId: placeToken(point),
    };
  }

  /**
   * Gõ chữ → gợi ý địa điểm (Address Autocomplete API).
   *
   * Khoá cứng `filter=countrycode:vn`: sản phẩm chỉ chạy ở Việt Nam, và ràng buộc vùng ngay
   * trong request vừa rẻ hơn vừa chính xác hơn lọc kết quả về sau.
   *
   * KHÔNG áp {@link MIN_GEOCODE_CONFIDENCE} ở đây. Gợi ý là thứ người dùng ĐỌC rồi tự chọn —
   * một dòng "Phường Bến Nghé, TP.HCM" kém chính xác vẫn hữu ích khi họ đang gõ dở, còn ở
   * `geocode()` thì máy tự chốt nên mới phải khắt khe.
   */
  async searchPlaces(query: string, biasPoint?: GeoPoint | null): Promise<PlaceSuggestion[]> {
    const url = new URL(AUTOCOMPLETE_URL);
    url.searchParams.set('text', query);
    url.searchParams.set('filter', COUNTRY_FILTER);
    url.searchParams.set('lang', LANG);
    url.searchParams.set('limit', String(PLACES_MAX_SUGGESTIONS));
    url.searchParams.set('format', 'json');
    if (biasPoint && isValidGeoPoint(biasPoint)) {
      // `proximity` nhận lon,lat — xem ghi chú ở `lonLat`. `bias` chỉ KÉO thứ tự kết quả, không
      // loại bỏ, nên một địa điểm ngoài bán kính vẫn ra nếu nó là thứ khớp nhất.
      url.searchParams.set('bias', `proximity:${lonLat(biasPoint)}|circle:${lonLat(biasPoint)},${PLACES_BIAS_RADIUS_M}`);
    }
    url.searchParams.set('apiKey', this.key);

    const res = await fetch(url, { signal: AbortSignal.timeout(PLACES_TIMEOUT_MS) });
    const body = (await res.json().catch(() => ({}))) as GeocodeApiResponse;
    if (!res.ok) throw GeoapifyGeoProvider.failure('Address Autocomplete', res.status, body);

    return (body.results ?? [])
      .map((r) => {
        // Gợi ý KHÔNG có toạ độ dùng được là gợi ý không chọn được (mã địa điểm chính là toạ độ
        // — xem `placeToken`). Bỏ nó đi còn hơn để người dùng bấm vào một dòng rồi không có gì
        // xảy ra.
        const point = this.toPoint(r);
        if (!point) return null;
        return {
          placeId: placeToken(point),
          // `address_line1`/`address_line2` là đúng cặp đậm/nhạt mà ô gợi ý cần, Geoapify đã
          // tách sẵn. Thiếu thì rơi về chuỗi đầy đủ — một gợi ý không đọc được thì thà không có.
          primaryText: r.address_line1 ?? r.formatted ?? '',
          secondaryText: r.address_line2 ?? null,
        };
      })
      .filter((s): s is PlaceSuggestion => s !== null && s.primaryText.length > 0);
  }

  /**
   * Một gợi ý đã chọn → toạ độ + địa chỉ + thành phần hành chính.
   *
   * **KHÔNG gọi `/v2/place-details`.** Endpoint đó không giải được `place_id` của kết quả loại
   * `building` — tức địa chỉ CÓ SỐ NHÀ, đúng thứ một đơn giao xe cần — xem {@link placeToken}.
   * Dùng nó nghĩa là mỗi lần khách chọn đúng số nhà của mình thì luồng đứng im.
   *
   * Thay vào đó, mã địa điểm đã gói sẵn toạ độ, và ở đây chỉ còn một việc: tra ngược toạ độ đó
   * lấy phần chữ. Reverse geocode trả lời được ở mọi điểm trên đất liền, nên đường này không có
   * ca "không giải được".
   *
   * Toạ độ trả về là toạ độ TRONG MÃ, không phải toạ độ reverse gợi ý: mã đến từ gợi ý người
   * dùng đã chọn (đúng số nhà), còn reverse hay kéo về tim đường gần nhất.
   */
  async placeDetails(placeId: string): Promise<PlaceDetail | null> {
    const point = parsePlaceToken(placeId);
    // Mã của nhà cung cấp KHÁC (dữ liệu cũ thời Google) — không giải được là câu trả lời hợp lệ,
    // và giao diện đã biết xử: giữ nguyên ô địa chỉ, không có ghim.
    if (!point) return null;

    const props = await this.reverseLookup(point);
    if (!props) return null;

    return {
      placeId,
      point,
      formattedAddress: props.formatted ?? null,
      administrativeArea: provinceNameOf(props),
      locality: localityNameOf(props),
    };
  }

  /** Một lượt `/v1/geocode/reverse`. Dùng chung bởi `placeDetails` và `reverseGeocode`. */
  private async reverseLookup(point: GeoPoint): Promise<GeoapifyAddress | null> {
    const url = new URL(REVERSE_URL);
    url.searchParams.set('lat', String(point.lat));
    url.searchParams.set('lon', String(point.lng));
    url.searchParams.set('lang', LANG);
    url.searchParams.set('limit', '1');
    url.searchParams.set('format', 'json');
    url.searchParams.set('apiKey', this.key);

    const res = await fetch(url, { signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS) });
    const body = (await res.json().catch(() => ({}))) as GeocodeApiResponse;
    if (!res.ok) throw GeoapifyGeoProvider.failure('Reverse geocoding', res.status, body);
    return body.results?.[0] ?? null;
  }

  /**
   * Toạ độ → địa chỉ chữ. Dùng ngay sau khi người dùng kéo ghim, để họ đọc lại xem "chỗ này là
   * đâu" trước khi lưu.
   */
  async reverseGeocode(point: GeoPoint): Promise<GeocodeResult | null> {
    const top = await this.reverseLookup(point);
    if (!top) return null;

    return {
      // Giữ NGUYÊN toạ độ người dùng vừa ghim, không thay bằng toạ độ nhà cung cấp gợi ý: cái
      // ghim là thứ họ chủ động đặt, còn địa chỉ chữ chỉ là chú thích cho nó.
      point,
      formattedAddress: top.formatted ?? null,
      placeId: placeToken(point),
    };
  }

  async roadDistanceKm(origin: GeoPoint, destination: GeoPoint): Promise<number | null> {
    const url = new URL(ROUTING_URL);
    // `waypoints` nhận lat,lon — ngược với `bias` ở trên. Xem ghi chú ở `lonLat`/`latLon`.
    url.searchParams.set('waypoints', `${latLon(origin)}|${latLon(destination)}`);
    url.searchParams.set('mode', 'drive');
    url.searchParams.set('units', 'metric');
    // `format=json` cho `results[].distance` phẳng. Mặc định là GeoJSON, nặng hơn vì kèm cả hình
    // học tuyến đường — thứ bảng bậc phí giao không dùng tới.
    url.searchParams.set('format', 'json');
    url.searchParams.set('apiKey', this.key);

    const res = await fetch(url, { signal: AbortSignal.timeout(ROUTES_TIMEOUT_MS) });
    const body = (await res.json().catch(() => ({}))) as RoutingApiResponse;
    if (!res.ok) throw GeoapifyGeoProvider.failure('Routing API', res.status, body);

    const meters = body.results?.[0]?.distance;
    // Rỗng = không có đường bộ nối hai điểm (đảo, toạ độ rơi xuống biển). Là câu trả lời.
    if (typeof meters !== 'number' || !Number.isFinite(meters)) return null;

    // Làm tròn 2 số lẻ: khớp `Decimal(8,2)` ở `geo_route_cache` để giá trị ghi xuống và giá trị
    // đọc lên là một, không lệch ở chữ số thứ ba giữa lần đầu và lần trúng cache.
    return Math.round((meters / 1000) * 100) / 100;
  }
}
