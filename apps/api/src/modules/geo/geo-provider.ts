import { isValidGeoPoint, type GeoPoint } from '@xeprime/domain';

/**
 * Khớp nối bản đồ trung lập nhà cung cấp (24/08/2026).
 *
 * Cùng khuôn với `vehicles/documents/ocr-provider.ts`, và vì cùng một lý do: thứ đứng sau là
 * dịch vụ trả tiền của bên thứ ba, nên nó phải thay được mà không ai ngoài file provider biết.
 * Đổi sang Goong / OSRM tự host = viết thêm một file implement interface này rồi đổi `useClass`
 * ở `geo.module.ts`; phần cache, lọc trước bằng đường chim bay, tra bậc phí và toàn bộ giao
 * diện KHÔNG phải sửa.
 *
 * Chưa cấu hình key → `GeoNotConfiguredProvider` bên dưới, và luồng giao xe im lặng rơi về
 * cách cũ (hai bên tự thoả thuận phí). TUYỆT ĐỐI không bịa toạ độ hay khoảng cách khi không tra
 * được: một con số đoán ra ở đây sẽ thành tiền thật trên đơn của người khác.
 */
export const GEO_PROVIDER = 'GEO_PROVIDER';

/**
 * Nhà cung cấp từ chối gọi vì đã chạm trần lượt gọi trong ngày (ADR 0061 điều 3) — một trạng
 * thái CHỦ ĐÍCH, không phải sự cố. `GeoService` coi nó như mọi ca "không hỏi được" nhưng không
 * ghi cảnh báo cho từng lượt: dưới một trận quét endpoint đó là hàng nghìn dòng log giống hệt nhau.
 */
export class GeoQuotaExceededError extends Error {}

export interface GeocodeResult {
  point: GeoPoint;
  /** Địa chỉ nhà cung cấp hiểu ra — hiện lại cho người dùng xác nhận "đúng chỗ này chưa". */
  formattedAddress: string | null;
  /** Mã địa điểm của nhà cung cấp, nếu có. Ổn định hơn toạ độ khi lưu lâu. */
  placeId: string | null;
  /**
   * Tên cấp tỉnh nhà cung cấp hiểu ra, nếu có — chỉ để GỢI Ý bộ chọn tỉnh (xem
   * {@link PlaceDetail.administrativeArea}). Vắng mặt = nhà cung cấp không tách thành phần.
   */
  administrativeArea?: string | null;
}

/** Một gợi ý trong ô tìm địa điểm. */
export interface PlaceSuggestion {
  placeId: string;
  /** Dòng đậm: tên địa điểm hoặc số nhà + đường. */
  primaryText: string;
  /** Dòng nhạt: phần còn lại của địa chỉ. Có thể rỗng với địa điểm nổi tiếng. */
  secondaryText: string | null;
}

/**
 * Độ dài tối đa của một mã địa điểm khi LƯU — cột `place_id` ở mọi bảng là `VarChar(255)`.
 *
 * `ref_id` của Vietmap là một chuỗi mã hoá mà độ dài chạy theo địa chỉ, nên có thể vượt mức đó.
 * Nó vẫn đi trọn vẹn qua `/places/detail` (đó là cách duy nhất để tra), chỉ là không được ghi
 * xuống: toạ độ mới là thứ hệ thống dùng, còn mã chỉ để tham chiếu.
 */
export const PLACE_ID_STORAGE_MAX_LENGTH = 255;

/** Mã địa điểm nếu lưu được, ngược lại `null` — xem {@link PLACE_ID_STORAGE_MAX_LENGTH}. */
export function storablePlaceId(placeId: string | null | undefined): string | null {
  return placeId && placeId.length <= PLACE_ID_STORAGE_MAX_LENGTH ? placeId : null;
}

/**
 * Độ dài tối đa của một mã địa điểm khi TRA (`/places/detail`, `/places/map`) — rộng hơn hẳn cột
 * lưu ({@link PLACE_ID_STORAGE_MAX_LENGTH}), vẫn có trần để một query string khổng lồ không đi
 * thẳng tới nhà cung cấp tính tiền.
 */
export const PLACE_REF_MAX_LENGTH = 1024;

/** Mã địa điểm thời Geoapify (`gp1:<lat>,<lng>`, ADR 0037 điều 5) — còn nằm trong dữ liệu cũ. */
const LEGACY_PLACE_TOKEN_PREFIX = 'gp1:';

/**
 * Toạ độ nằm sẵn trong một mã `gp1:` cũ, hoặc `null` nếu không phải mã cũ. Định dạng của DỮ LIỆU
 * chứ không của nhà cung cấp nào, nên giải ở `GeoService` — gửi nó sang nhà cung cấp hiện hành
 * chỉ tốn một lượt để nhận "không có".
 */
export function parseLegacyPlaceToken(placeId: string): GeoPoint | null {
  if (!placeId.startsWith(LEGACY_PLACE_TOKEN_PREFIX)) return null;
  const [lat, lng] = placeId.slice(LEGACY_PLACE_TOKEN_PREFIX.length).split(',');
  const point = { lat: Number(lat), lng: Number(lng) };
  return isValidGeoPoint(point) ? point : null;
}

/**
 * Địa điểm đã chọn, kèm toạ độ và các thành phần hành chính nhà cung cấp hiểu ra.
 *
 * `administrativeArea`/`locality` là thứ nhà cung cấp TRẢ VỀ, không phải thứ hệ thống tin. Sau
 * sắp xếp 01/07/2025 dữ liệu bản đồ còn có thể mang tên tỉnh/quận CŨ, nên hai trường này chỉ dùng
 * để GỢI Ý bộ chọn nhảy tới đúng tỉnh — người dùng vẫn là người chốt. KHÔNG bao giờ lưu thẳng.
 */
export interface PlaceDetail {
  placeId: string;
  point: GeoPoint;
  formattedAddress: string | null;
  /** Tên cấp tỉnh theo dữ liệu nhà cung cấp (có thể là tên TRƯỚC sắp xếp). */
  administrativeArea: string | null;
  /** Tên cấp dưới tỉnh theo dữ liệu nhà cung cấp (quận/huyện/phường cũ). */
  locality: string | null;
}

export interface GeoProvider {
  readonly name: string;
  readonly enabled: boolean;

  /**
   * Địa chỉ chữ → toạ độ. Trả `null` khi KHÔNG tìm thấy — đó là một câu trả lời hợp lệ.
   * Lỗi mạng/hết hạn mức thì ném, để `GeoService` phân biệt được "không có" với "không hỏi được".
   */
  geocode(address: string): Promise<GeocodeResult | null>;

  /**
   * Gõ chữ → danh sách gợi ý địa điểm. Trả mảng RỖNG khi không có gợi ý nào (là câu trả lời).
   *
   * `biasPoint` kéo kết quả về gần một điểm — truyền toạ độ trung tâm tỉnh người dùng vừa chọn
   * để "Nguyễn Huệ" ra đúng tỉnh đó thay vì ra TP.HCM mọi lúc.
   */
  searchPlaces(query: string, biasPoint?: GeoPoint | null): Promise<PlaceSuggestion[]>;

  /** Một gợi ý đã chọn → toạ độ + địa chỉ đầy đủ. `null` = mã địa điểm không còn hợp lệ. */
  placeDetails(placeId: string): Promise<PlaceDetail | null>;

  /** Toạ độ (người dùng vừa kéo ghim) → địa chỉ chữ. `null` = không có địa chỉ nào ở đó. */
  reverseGeocode(point: GeoPoint): Promise<GeocodeResult | null>;

  /**
   * Khoảng cách ĐƯỜNG BỘ MỘT CHIỀU (km) giữa hai điểm. `null` = không có đường đi.
   *
   * Một chiều là quy ước của bậc phí giao (`rental_policies.delivery_tiers_json`) — đổi sang
   * khứ hồi ở đây sẽ làm sai toàn bộ cấu hình các gian hàng đã nhập.
   */
  roadDistanceKm(origin: GeoPoint, destination: GeoPoint): Promise<number | null>;

  /**
   * Ảnh bản đồ TĨNH (PNG) quanh một điểm, có ghim — để XEM, không tương tác (ADR 0061 điều 1).
   * `label` là dòng địa chỉ in lên ảnh; truyền vào để nhà cung cấp không phải tự tra ngược (thêm
   * một lượt tính tiền). Ném khi không vẽ được.
   */
  staticMapPng(point: GeoPoint, label: string): Promise<Buffer>;
}

/** Mặc định khi chưa cấu hình key — nói thẳng là không dùng được, không giả kết quả. */
export class GeoNotConfiguredProvider implements GeoProvider {
  readonly name = 'not_configured';
  readonly enabled = false;

  geocode(): Promise<GeocodeResult | null> {
    return Promise.reject(new Error('Nhà cung cấp bản đồ chưa được cấu hình'));
  }

  searchPlaces(): Promise<PlaceSuggestion[]> {
    return Promise.reject(new Error('Nhà cung cấp bản đồ chưa được cấu hình'));
  }

  placeDetails(): Promise<PlaceDetail | null> {
    return Promise.reject(new Error('Nhà cung cấp bản đồ chưa được cấu hình'));
  }

  reverseGeocode(): Promise<GeocodeResult | null> {
    return Promise.reject(new Error('Nhà cung cấp bản đồ chưa được cấu hình'));
  }

  roadDistanceKm(): Promise<number | null> {
    return Promise.reject(new Error('Nhà cung cấp bản đồ chưa được cấu hình'));
  }

  staticMapPng(): Promise<Buffer> {
    return Promise.reject(new Error('Nhà cung cấp bản đồ chưa được cấu hình'));
  }
}
