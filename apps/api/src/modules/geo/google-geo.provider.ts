import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { haversineKm, isValidGeoPoint, type GeoPoint } from '@xeprime/domain';
import type { GeocodeResult, GeoProvider, PlaceDetail, PlaceSuggestion } from './geo-provider';

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const PLACES_AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const PLACE_DETAILS_URL = 'https://places.googleapis.com/v1/places';

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
 * hạn mức miễn phí hằng tháng của SKU Autocomplete.
 */
const PLACES_MAX_SUGGESTIONS = 6;

/** Bán kính ưu tiên quanh điểm gợi ý (mét) — đủ phủ một tỉnh mà không khoá cứng kết quả. */
const PLACES_BIAS_RADIUS_M = 50_000;

/** Chỉ tra trong Việt Nam: sản phẩm chỉ chạy ở đây, và giới hạn vùng làm geocode chính xác hơn. */
const COUNTRY_COMPONENT = 'country:VN';

/**
 * Ngôn ngữ của DỮ LIỆU trả về (tên đường, tên phường). Cố định `vi` chứ không theo giao diện:
 * chuỗi này được LƯU vào địa chỉ của chi nhánh/đơn và đọc bởi người ở cả hai ngôn ngữ — tên
 * địa danh Việt Nam viết bằng tiếng Việt là cách duy nhất tài xế tìm được tới nơi.
 */
const LANG = 'vi';

/**
 * Loại kết quả quá THÔ để máy tự chốt làm toạ độ một địa chỉ.
 *
 * Khi không khớp được số nhà/đường, Geocoding API không luôn trả `ZERO_RESULTS` — với
 * `components=country:VN` nó hay trả về TÂM của tỉnh hoặc thành phố kèm `partial_match`. Một
 * cái ghim ở tâm tỉnh nằm ngay dưới dòng địa chỉ đúng là kiểu sai thuyết phục nhất, và nó chảy
 * thẳng vào quãng đường giao xe rồi thành tiền trên đơn của người khác (ADR 0037 điều 6, giữ
 * nguyên ở ADR 0059).
 *
 * Kết quả bị loại khi MỌI `types` của nó nằm trong tập này. Cấp phường/xã
 * (`administrative_area_level_3`, `sublocality*`) và mọi thứ chi tiết hơn vẫn được nhận — đó là
 * nhóm khớp một phần mà người dùng tự chỉnh ghim, vì giao diện đã bắt họ nhìn ghim một lần.
 *
 * `political` có mặt vì Google gắn nó KÈM mọi đơn vị hành chính; một mình nó không nói gì.
 */
const COARSE_RESULT_TYPES: ReadonlySet<string> = new Set([
  'country',
  'administrative_area_level_1',
  'administrative_area_level_2',
  'locality',
  'colloquial_area',
  'postal_code',
  'political',
]);

/**
 * Kết quả KHỚP MỘT PHẦN mà vùng bao (`viewport`) rộng quá ngần này (đường chéo, km) thì cũng
 * bị loại.
 *
 * Đây là ca mà {@link COARSE_RESULT_TYPES} không bắt: số nhà không có trong dữ liệu, Google rơi
 * về TÂM của con đường (`route` + `partial_match`). Với một con đường ngắn, tâm đó lệch vài trăm
 * mét — người dùng tự chỉnh ghim, đúng nhóm ADR 0037 đã chủ ý giữ. Với Nguyễn Văn Linh hay Quốc
 * lộ 1, tâm đường có thể cách chỗ thật cả chục km, và con số đó đi thẳng vào phí giao tự động.
 *
 * Chỉ áp cho kết quả `partial_match`: một sân bay hay khu đô thị KHỚP ĐỦ có vùng bao rộng là vì
 * chính địa điểm đó rộng, không phải vì Google đang đoán.
 */
const MAX_PARTIAL_MATCH_VIEWPORT_KM = 2;

/**
 * Mã địa điểm hợp lệ của Places API — chữ, số, `_` và `-`.
 *
 * Kiểm TRƯỚC khi gọi mạng vì trong DB còn mã của nhà cung cấp cũ: `gp1:<lat>,<lng>` thời
 * Geoapify (ADR 0037 điều 5). Gửi chúng sang Google là một request tính tiền đổi lấy HTTP 400.
 * Trả `null` ngay là đúng nhánh giao diện đã biết xử: giữ nguyên ô địa chỉ, không có ghim mới.
 */
const GOOGLE_PLACE_ID = /^[A-Za-z0-9_-]+$/;

interface ApiLatLng {
  lat?: number;
  lng?: number;
}

interface GeocodeApiResult {
  geometry?: { location?: ApiLatLng; viewport?: { northeast?: ApiLatLng; southwest?: ApiLatLng } };
  formatted_address?: string;
  place_id?: string;
  types?: string[];
  partial_match?: boolean;
}

interface GeocodeApiResponse {
  status?: string;
  error_message?: string;
  results?: GeocodeApiResult[];
}

/** Lỗi của nhóm API "New" (Places, Routes) — `{ error: { code, message, status } }`. */
interface GoogleApiError {
  error?: { code?: number; message?: string; status?: string };
}

interface RoutesApiResponse extends GoogleApiError {
  routes?: Array<{ distanceMeters?: number }>;
}

interface AutocompleteApiResponse extends GoogleApiError {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
      text?: { text?: string };
    };
  }>;
}

interface PlaceDetailsApiResponse extends GoogleApiError {
  id?: string;
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: Array<{ longText?: string; types?: string[] }>;
}

/**
 * Google Maps Platform — Geocoding API · Places API (New) · Routes API (ADR 0059).
 *
 * Gọi bằng `fetch` trần, không SDK: năm request REST không đáng đánh đổi bằng một dependency
 * nặng kéo theo cả cây `google-auth-library`.
 *
 * Key ở đây là **key server** (`GOOGLE_MAPS_SERVER_KEY`), khoá theo IP trên Cloud Console và
 * KHÔNG BAO GIỜ đi qua `NEXT_PUBLIC_*`. Key vẽ bản đồ của web là một key khác, khoá theo HTTP
 * referrer — trộn hai key lại là mở hạn mức tính tiền cho bất kỳ ai xem trang.
 *
 * **Về dữ liệu hành chính.** Google ở Việt Nam còn dùng tên tỉnh/quận/phường TRƯỚC sắp xếp
 * 01/07/2025. Đó là lý do luồng nhập địa chỉ không lấy thẳng chuỗi của Google làm địa chỉ: nó chỉ
 * cho toạ độ và phần "số nhà, đường", còn tỉnh người dùng chọn từ danh mục (ADR 0035 · 0042).
 */
@Injectable()
export class GoogleGeoProvider implements GeoProvider {
  readonly name = 'google';
  private readonly logger = new Logger(GoogleGeoProvider.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.get<string>('GOOGLE_MAPS_SERVER_KEY'));
  }

  private get key(): string {
    return this.config.getOrThrow<string>('GOOGLE_MAPS_SERVER_KEY');
  }

  /**
   * Gom lỗi của nhóm API "New" về một kiểu câu, để `GeoService` chỉ có một thứ phải nuốt và log
   * nói được VÌ SAO (`PERMISSION_DENIED` = API chưa bật cho key, `RESOURCE_EXHAUSTED` = hết hạn
   * mức) thay vì chỉ một mã HTTP.
   */
  private static failure(api: string, status: number, body: GoogleApiError): Error {
    const detail = [body.error?.status, body.error?.message].filter(Boolean).join(' ');
    return new Error(`${api} trả HTTP ${status} ${detail}`.trim());
  }

  /**
   * Một lượt Geocoding API (xuôi hoặc ngược). `null` = `ZERO_RESULTS` — câu trả lời hợp lệ.
   *
   * Geocoding báo phần lớn lỗi bằng HTTP 200 kèm `status` (`OVER_QUERY_LIMIT`, `REQUEST_DENIED`,
   * `INVALID_REQUEST`), nên phải đọc cả hai tầng. Cả hai đều NÉM: hết hạn mức / key sai là
   * chuyện của người vận hành, không phải của khách — đừng đổ lỗi cho địa chỉ.
   */
  private async geocodeRequest(
    api: string,
    params: Record<string, string>,
  ): Promise<GeocodeApiResult[] | null> {
    const url = new URL(GEOCODE_URL);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('language', LANG);
    url.searchParams.set('key', this.key);

    const res = await fetch(url, { signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`${api} trả HTTP ${res.status}`);

    const body = (await res.json().catch(() => ({}))) as GeocodeApiResponse;
    if (body.status === 'ZERO_RESULTS') return null;
    if (body.status !== 'OK') {
      throw new Error(`${api}: ${body.status ?? 'không rõ'} ${body.error_message ?? ''}`.trim());
    }
    return body.results ?? [];
  }

  private static latLng(raw: ApiLatLng | undefined): GeoPoint | null {
    const point: GeoPoint = { lat: Number(raw?.lat), lng: Number(raw?.lng) };
    return isValidGeoPoint(point) ? point : null;
  }

  private static toPoint(raw: GeocodeApiResult | undefined): GeoPoint | null {
    return GoogleGeoProvider.latLng(raw?.geometry?.location);
  }

  /** Quá thô để máy tự chốt — xem {@link COARSE_RESULT_TYPES} và {@link MAX_PARTIAL_MATCH_VIEWPORT_KM}. */
  private static isCoarse(result: GeocodeApiResult): boolean {
    const types = result.types ?? [];
    if (types.length > 0 && types.every((t) => COARSE_RESULT_TYPES.has(t))) return true;
    if (!result.partial_match) return false;
    const ne = GoogleGeoProvider.latLng(result.geometry?.viewport?.northeast);
    const sw = GoogleGeoProvider.latLng(result.geometry?.viewport?.southwest);
    // Thiếu vùng bao thì không đo được độ rộng — giữ, giống bản không có luật này.
    return ne !== null && sw !== null && haversineKm(ne, sw) > MAX_PARTIAL_MATCH_VIEWPORT_KM;
  }

  async geocode(address: string): Promise<GeocodeResult | null> {
    const results = await this.geocodeRequest('Geocoding API', {
      address,
      components: COUNTRY_COMPONENT,
      region: 'vn',
    });
    const top = results?.[0];
    if (!top) return null;

    if (GoogleGeoProvider.isCoarse(top)) {
      this.logger.debug(`Bỏ kết quả geocode quá thô (${top.types?.join(',')}) cho "${address}"`);
      return null;
    }

    const point = GoogleGeoProvider.toPoint(top);
    if (!point) {
      this.logger.warn(`Geocoding trả toạ độ không dùng được cho "${address}"`);
      return null;
    }

    return {
      point,
      formattedAddress: top.formatted_address ?? null,
      placeId: top.place_id ?? null,
    };
  }

  /**
   * Gõ chữ → gợi ý địa điểm (Places API New, `places:autocomplete`).
   *
   * Khoá cứng `includedRegionCodes: ['vn']`: sản phẩm chỉ chạy ở Việt Nam, và ràng buộc vùng
   * ngay trong request vừa rẻ hơn vừa chính xác hơn lọc kết quả về sau.
   *
   * KHÔNG áp {@link COARSE_RESULT_TYPES} ở đây. Gợi ý là thứ người dùng ĐỌC rồi tự chọn — một
   * dòng "Phường Bến Nghé, TP.HCM" kém chính xác vẫn hữu ích khi họ đang gõ dở, còn ở
   * `geocode()` thì máy tự chốt nên mới phải khắt khe.
   */
  async searchPlaces(query: string, biasPoint?: GeoPoint | null): Promise<PlaceSuggestion[]> {
    const res = await fetch(PLACES_AUTOCOMPLETE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.key,
        // Chỉ xin đúng ba mảnh cần để vẽ một dòng gợi ý. Xin thêm là tự lên bậc tính tiền.
        'X-Goog-FieldMask':
          'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
      },
      body: JSON.stringify({
        input: query,
        languageCode: LANG,
        regionCode: 'VN',
        includedRegionCodes: ['vn'],
        ...(biasPoint && isValidGeoPoint(biasPoint)
          ? {
              locationBias: {
                circle: {
                  center: { latitude: biasPoint.lat, longitude: biasPoint.lng },
                  radius: PLACES_BIAS_RADIUS_M,
                },
              },
            }
          : {}),
      }),
      signal: AbortSignal.timeout(PLACES_TIMEOUT_MS),
    });

    const body = (await res.json().catch(() => ({}))) as AutocompleteApiResponse;
    if (!res.ok || body.error) {
      throw GoogleGeoProvider.failure('Places Autocomplete', res.status, body);
    }

    return (body.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> & { placeId: string } => Boolean(p?.placeId))
      .slice(0, PLACES_MAX_SUGGESTIONS)
      .map((p) => ({
        placeId: p.placeId,
        // `structuredFormat` vắng mặt với một số loại kết quả — rơi về chuỗi đầy đủ thay vì
        // hiện một dòng trống, vì một gợi ý không đọc được thì thà không có còn hơn.
        primaryText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
        secondaryText: p.structuredFormat?.secondaryText?.text ?? null,
      }))
      .filter((s) => s.primaryText.length > 0);
  }

  /** Một gợi ý đã chọn → toạ độ + địa chỉ + thành phần hành chính theo dữ liệu Google. */
  async placeDetails(placeId: string): Promise<PlaceDetail | null> {
    // Mã của nhà cung cấp cũ hoặc chuỗi bịa — xem `GOOGLE_PLACE_ID`. Không gọi mạng.
    if (!GOOGLE_PLACE_ID.test(placeId)) return null;

    const url = new URL(`${PLACE_DETAILS_URL}/${placeId}`);
    url.searchParams.set('languageCode', LANG);
    url.searchParams.set('regionCode', 'VN');
    const res = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': this.key,
        // Bốn trường đều thuộc bậc Essentials. Thêm `displayName`… là tự lên bậc Pro.
        'X-Goog-FieldMask': 'id,formattedAddress,location,addressComponents',
      },
      signal: AbortSignal.timeout(PLACES_TIMEOUT_MS),
    });

    // 404 = mã địa điểm đã hết hạn hoặc bịa. Là câu trả lời ("không còn"), không phải sự cố.
    if (res.status === 404) return null;
    const body = (await res.json().catch(() => ({}))) as PlaceDetailsApiResponse;
    if (!res.ok || body.error) throw GoogleGeoProvider.failure('Place Details', res.status, body);

    const point: GeoPoint = {
      lat: Number(body.location?.latitude),
      lng: Number(body.location?.longitude),
    };
    if (!isValidGeoPoint(point)) return null;

    const component = (type: string): string | null =>
      body.addressComponents?.find((c) => c.types?.includes(type))?.longText ?? null;

    return {
      placeId: body.id ?? placeId,
      point,
      formattedAddress: body.formattedAddress ?? null,
      administrativeArea: component('administrative_area_level_1'),
      // `locality` rồi mới tới `administrative_area_level_2`: với đô thị Việt Nam Google hay
      // để tên quận ở `locality`, còn tỉnh nông thôn thì để huyện ở cấp 2.
      locality: component('locality') ?? component('administrative_area_level_2'),
    };
  }

  /**
   * Toạ độ → địa chỉ chữ. Dùng ngay sau khi người dùng kéo ghim, để họ đọc lại xem "chỗ này là
   * đâu" trước khi lưu.
   */
  async reverseGeocode(point: GeoPoint): Promise<GeocodeResult | null> {
    const results = await this.geocodeRequest('Reverse geocoding', {
      latlng: `${point.lat},${point.lng}`,
    });
    /*
     * Bỏ dòng `plus_code`: ở chỗ chưa có địa chỉ, Google đặt nó ĐẦU danh sách với chuỗi dạng
     * "QFGW+X2 Bến Nghé…" — đúng về kỹ thuật, nhưng đổ nó vào ô địa chỉ là đưa cho tài xế một
     * mã họ không đọc được. Dòng kế tiếp (đường, phường) mới là thứ người ta dùng.
     */
    const top = results?.find((r) => !r.types?.includes('plus_code'));
    if (!top) return null;
    return {
      // Giữ NGUYÊN toạ độ người dùng vừa ghim, không thay bằng toạ độ Google gợi ý: cái ghim là
      // thứ họ chủ động đặt, còn địa chỉ chữ chỉ là chú thích cho nó.
      point,
      formattedAddress: top.formatted_address ?? null,
      placeId: top.place_id ?? null,
    };
  }

  async roadDistanceKm(origin: GeoPoint, destination: GeoPoint): Promise<number | null> {
    const res = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.key,
        // FieldMask hẹp nhất có thể: chỉ xin quãng đường. Ngoài chuyện nhẹ hơn, nó là thứ giữ
        // request nằm ở bậc Essentials — xin thêm trường (polyline, chặng, thời gian có kẹt xe)
        // là tự đẩy mình lên bậc tính tiền cao hơn.
        'X-Goog-FieldMask': 'routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: {
          location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
        },
        travelMode: 'DRIVE',
        // Không hỏi tình trạng giao thông: phí giao là bảng bậc theo KM, không theo thời gian
        // chạy. `TRAFFIC_UNAWARE` vừa rẻ nhất vừa cho kết quả ổn định giữa các lần hỏi.
        routingPreference: 'TRAFFIC_UNAWARE',
        units: 'METRIC',
      }),
      signal: AbortSignal.timeout(ROUTES_TIMEOUT_MS),
    });

    const body = (await res.json().catch(() => ({}))) as RoutesApiResponse;
    if (!res.ok || body.error) throw GoogleGeoProvider.failure('Routes API', res.status, body);

    const route = body.routes?.[0];
    // Không có tuyến = không có đường bộ nối hai điểm (đảo, toạ độ rơi xuống biển). Là câu trả lời.
    if (!route) return null;
    /*
     * Thiếu `distanceMeters` trong một tuyến CÓ THẬT nghĩa là 0 m, không phải "không biết": JSON
     * của API này theo proto3, nơi trường mang giá trị mặc định bị lược khỏi response. Hai điểm
     * trùng nhau (giao xe tại chính điểm nhận) rơi đúng vào ca đó.
     */
    const meters = route.distanceMeters ?? 0;
    if (!Number.isFinite(meters)) return null;

    // Làm tròn 2 số lẻ: khớp `Decimal(8,2)` ở `geo_route_cache` để giá trị ghi xuống và giá trị
    // đọc lên là một, không lệch ở chữ số thứ ba giữa lần đầu và lần trúng cache.
    return Math.round((meters / 1000) * 100) / 100;
  }
}
