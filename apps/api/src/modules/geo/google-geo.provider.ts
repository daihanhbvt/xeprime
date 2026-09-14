import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isValidGeoPoint, type GeoPoint } from '@xeprime/domain';
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
 * Số gợi ý tối đa. Danh sách dài hơn không giúp ai chọn nhanh hơn, và mỗi dòng đều nằm trong
 * một request có tính tiền.
 */
const PLACES_MAX_SUGGESTIONS = 6;

/** Bán kính ưu tiên quanh điểm gợi ý (mét) — đủ phủ một tỉnh mà không khoá cứng kết quả. */
const PLACES_BIAS_RADIUS_M = 50_000;

/** Chỉ tra trong Việt Nam: sản phẩm chỉ chạy ở đây, và giới hạn vùng làm geocode chính xác hơn. */
const COUNTRY_COMPONENT = 'country:VN';

interface GeocodeApiResponse {
  status?: string;
  error_message?: string;
  results?: Array<{
    geometry?: { location?: { lat?: number; lng?: number } };
    formatted_address?: string;
    place_id?: string;
  }>;
}

interface RoutesApiResponse {
  routes?: Array<{ distanceMeters?: number }>;
  error?: { message?: string; status?: string };
}

interface AutocompleteApiResponse {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
      text?: { text?: string };
    };
  }>;
  error?: { message?: string; status?: string };
}

interface PlaceDetailsApiResponse {
  id?: string;
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: Array<{ longText?: string; types?: string[] }>;
  error?: { message?: string; status?: string };
}

/**
 * Google Maps Platform — Geocoding API + Routes API.
 *
 * Gọi bằng `fetch` trần, không SDK: hai request REST không đáng đánh đổi bằng một dependency
 * nặng kéo theo cả cây `google-auth-library`.
 *
 * Key ở đây là **server key** (`GOOGLE_MAPS_SERVER_KEY`), khoá theo IP trên Cloud Console và
 * KHÔNG BAO GIỜ đi qua `NEXT_PUBLIC_*`. Key nhúng bản đồ của web là một key khác, chỉ bật Maps
 * Embed API — trộn hai key lại là mở hạn mức tính tiền cho bất kỳ ai xem trang.
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

  async geocode(address: string): Promise<GeocodeResult | null> {
    const url = new URL(GEOCODE_URL);
    url.searchParams.set('address', address);
    url.searchParams.set('components', COUNTRY_COMPONENT);
    url.searchParams.set('region', 'vn');
    url.searchParams.set('language', 'vi');
    url.searchParams.set('key', this.key);

    const res = await fetch(url, { signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Geocoding API trả HTTP ${res.status}`);

    const body = (await res.json()) as GeocodeApiResponse;
    // `ZERO_RESULTS` là câu trả lời, không phải lỗi: địa chỉ đó thật sự không tra được.
    if (body.status === 'ZERO_RESULTS') return null;
    if (body.status !== 'OK') {
      // `OVER_QUERY_LIMIT` / `REQUEST_DENIED` là chuyện của người vận hành, không phải của khách
      // — ném lên để GeoService nuốt thành `unavailable` và ghi log, đừng đổ lỗi cho địa chỉ.
      throw new Error(`Geocoding API: ${body.status ?? 'không rõ'} ${body.error_message ?? ''}`);
    }

    const top = body.results?.[0];
    const point: GeoPoint = {
      lat: Number(top?.geometry?.location?.lat),
      lng: Number(top?.geometry?.location?.lng),
    };
    if (!isValidGeoPoint(point)) {
      this.logger.warn(`Geocoding trả toạ độ không dùng được cho "${address}"`);
      return null;
    }

    return {
      point,
      formattedAddress: top?.formatted_address ?? null,
      placeId: top?.place_id ?? null,
    };
  }

  /**
   * Gõ chữ → gợi ý địa điểm (Places API New, `places:autocomplete`).
   *
   * Khoá cứng `includedRegionCodes: ['vn']` và `languageCode: 'vi'`: sản phẩm chỉ chạy ở Việt
   * Nam, và ràng buộc vùng ngay trong request vừa rẻ hơn vừa chính xác hơn lọc kết quả về sau.
   *
   * Lưu ý về DỮ LIỆU: gợi ý của Google còn dùng tên đơn vị hành chính TRƯỚC sắp xếp 01/07/2025
   * ("Quận 1", "Phường Bến Nghé"). Đó là lý do luồng nhập địa chỉ không lấy thẳng chuỗi này làm
   * địa chỉ — nó chỉ cho toạ độ và phần "số nhà, đường", còn tỉnh/xã người dùng chọn từ danh mục.
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
        languageCode: 'vi',
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

    if (!res.ok) throw new Error(`Places Autocomplete trả HTTP ${res.status}`);

    const body = (await res.json()) as AutocompleteApiResponse;
    if (body.error) {
      throw new Error(`Places Autocomplete: ${body.error.status ?? body.error.message ?? ''}`);
    }

    return (body.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
      .slice(0, PLACES_MAX_SUGGESTIONS)
      .map((p) => ({
        placeId: p.placeId!,
        // `structuredFormat` vắng mặt với một số loại kết quả — rơi về chuỗi đầy đủ thay vì
        // hiện một dòng trống, vì một gợi ý không đọc được thì thà không có còn hơn.
        primaryText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
        secondaryText: p.structuredFormat?.secondaryText?.text ?? null,
      }))
      .filter((s) => s.primaryText.length > 0);
  }

  /** Một gợi ý đã chọn → toạ độ + địa chỉ + thành phần hành chính theo dữ liệu Google. */
  async placeDetails(placeId: string): Promise<PlaceDetail | null> {
    const url = `${PLACE_DETAILS_URL}/${encodeURIComponent(placeId)}?languageCode=vi&regionCode=VN`;
    const res = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': this.key,
        'X-Goog-FieldMask': 'id,formattedAddress,location,addressComponents',
      },
      signal: AbortSignal.timeout(PLACES_TIMEOUT_MS),
    });

    // 404 = mã địa điểm đã hết hạn hoặc bịa. Là câu trả lời ("không còn"), không phải sự cố.
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Place Details trả HTTP ${res.status}`);

    const body = (await res.json()) as PlaceDetailsApiResponse;
    if (body.error) throw new Error(`Place Details: ${body.error.status ?? body.error.message ?? ''}`);

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
    const url = new URL(GEOCODE_URL);
    url.searchParams.set('latlng', `${point.lat},${point.lng}`);
    url.searchParams.set('language', 'vi');
    url.searchParams.set('key', this.key);

    const res = await fetch(url, { signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Reverse geocoding trả HTTP ${res.status}`);

    const body = (await res.json()) as GeocodeApiResponse;
    if (body.status === 'ZERO_RESULTS') return null;
    if (body.status !== 'OK') {
      throw new Error(`Reverse geocoding: ${body.status ?? 'không rõ'} ${body.error_message ?? ''}`);
    }

    const top = body.results?.[0];
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

    if (!res.ok) throw new Error(`Routes API trả HTTP ${res.status}`);

    const body = (await res.json()) as RoutesApiResponse;
    if (body.error) throw new Error(`Routes API: ${body.error.status ?? body.error.message ?? ''}`);

    const meters = body.routes?.[0]?.distanceMeters;
    // Mảng rỗng = không có đường bộ nối hai điểm (đảo, toạ độ rơi xuống biển). Là câu trả lời.
    if (typeof meters !== 'number' || !Number.isFinite(meters)) return null;

    // Làm tròn 2 số lẻ: khớp `Decimal(8,2)` ở `geo_route_cache` để giá trị ghi xuống và giá trị
    // đọc lên là một, không lệch ở chữ số thứ ba giữa lần đầu và lần trúng cache.
    return Math.round((meters / 1000) * 100) / 100;
  }
}
