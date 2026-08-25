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

export interface GeoProvider {
  readonly name: string;
  readonly enabled: boolean;

  /**
   * Địa chỉ chữ → toạ độ. Trả `null` khi KHÔNG tìm thấy — đó là một câu trả lời hợp lệ.
   * Lỗi mạng/hết hạn mức thì ném, để `GeoService` phân biệt được "không có" với "không hỏi được".
   */
  geocode(address: string): Promise<GeocodeResult | null>;

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

  roadDistanceKm(): Promise<number | null> {
    return Promise.reject(new Error('Nhà cung cấp bản đồ chưa được cấu hình'));
  }
}
