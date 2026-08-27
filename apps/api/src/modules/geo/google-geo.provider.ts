import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isValidGeoPoint, type GeoPoint } from '@xeprime/domain';
import type { GeocodeResult, GeoProvider } from './geo-provider';

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

/**
 * Timeout ngắn có chủ đích. Đây là tiện ích ước lượng nằm giữa lúc khách đang điền form — thà
 * bỏ qua phần phí dự kiến còn hơn treo nút "Gửi yêu cầu" 10 giây vì bản đồ chậm.
 */
const GEOCODE_TIMEOUT_MS = 3_000;
const ROUTES_TIMEOUT_MS = 4_000;

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
