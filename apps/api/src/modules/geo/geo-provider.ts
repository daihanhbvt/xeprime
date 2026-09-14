import type { GeoPoint } from '@xeprime/domain';

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

export interface GeocodeResult {
  point: GeoPoint;
  /** Địa chỉ nhà cung cấp hiểu ra — hiện lại cho người dùng xác nhận "đúng chỗ này chưa". */
  formattedAddress: string | null;
  /** Mã địa điểm của nhà cung cấp, nếu có. Ổn định hơn toạ độ khi lưu lâu. */
  placeId: string | null;
}

/** Một gợi ý trong ô tìm địa điểm. Chưa có toạ độ — toạ độ lấy ở bước chọn ({@link PlaceDetail}). */
export interface PlaceSuggestion {
  placeId: string;
  /** Dòng đậm: tên địa điểm hoặc số nhà + đường. */
  primaryText: string;
  /** Dòng nhạt: phần còn lại của địa chỉ. Có thể rỗng với địa điểm nổi tiếng. */
  secondaryText: string | null;
}

/**
 * Địa điểm đã chọn, kèm toạ độ và các thành phần hành chính nhà cung cấp hiểu ra.
 *
 * `administrativeArea`/`locality` là thứ Google TRẢ VỀ, không phải thứ hệ thống tin. Sau sắp
 * xếp 01/07/2025 dữ liệu của họ còn đầy tên tỉnh/quận CŨ, nên hai trường này chỉ dùng để GỢI Ý
 * bộ chọn nhảy tới đúng tỉnh — người dùng vẫn là người chốt. KHÔNG bao giờ lưu thẳng.
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
}
