/**
 * Địa chỉ VẬT LÝ có cấu trúc — hợp đồng dùng chung của web, app native và API.
 *
 * Một địa chỉ thật ở Việt Nam gồm hai phần KHÁC BẢN CHẤT, và đó là lý do shape này tồn tại:
 *
 *   1. **Phần hành chính** (`provinceCode` + `wardCode`) — có danh mục nhà nước, có mã bất biến,
 *      tra được, lọc được, so sánh được. Luôn CHỌN, không bao giờ gõ.
 *   2. **Phần chi tiết** (`addressLine`: số nhà, tên đường, toà nhà, ngõ/hẻm) — KHÔNG có danh
 *      mục nào phát hành, nên bắt người dùng chọn từ dropdown là bịa ra một danh mục không tồn
 *      tại. Luôn GÕ.
 *
 * Cộng thêm phần **vị trí** (`placeId` + `latitude`/`longitude`): cái ghim trên bản đồ. Nó không
 * thay được hai phần trên — Google thường trả tên đơn vị hành chính CŨ (trước 01/07/2025) và đôi
 * khi ghim lệch cả cây số — nên toạ độ là thứ để TÍNH (khoảng cách, chỉ đường), còn mã hành
 * chính mới là thứ để LỌC. Hai đường độc lập, không suy ra nhau.
 */
import type { WardAdministrativeType } from './ward';

/**
 * Cái ghim toạ độ đến từ đâu — quyết định mức độ tin cậy khi hiển thị và khi tính phí giao xe.
 *
 * Lưu nguồn thay vì một cờ `isVerified` vì ba ca dưới đây cần ba cách xử lý khác nhau, và một
 * boolean thì gộp mất `google_place` (chính xác) với `geocoded` (máy đoán từ chuỗi chữ).
 */
export const LOCATION_SOURCE = {
  /** Người dùng chọn một địa điểm từ Google Places — toạ độ và `placeId` của chính địa điểm đó. */
  GOOGLE_PLACE: 'google_place',
  /** Người dùng tự kéo ghim trên bản đồ — toạ độ do CHÍNH CHỦ xác nhận, đáng tin nhất. */
  MAP_PIN: 'map_pin',
  /** Server tra từ chuỗi địa chỉ (geocoding). Gần đúng — phải cho người dùng soát lại. */
  GEOCODED: 'geocoded',
  /** Không có toạ độ: người dùng chỉ gõ chữ và bỏ qua bước ghim. */
  MANUAL: 'manual',
} as const;

export type LocationSource = (typeof LOCATION_SOURCE)[keyof typeof LOCATION_SOURCE];

export const LOCATION_SOURCE_VALUES = Object.values(LOCATION_SOURCE) as readonly LocationSource[];

/** Nguồn toạ độ được coi là đã có người xác nhận bằng mắt — không cần nhắc "kiểm lại ghim". */
export const LOCATION_SOURCE_CONFIRMED: readonly LocationSource[] = [
  LOCATION_SOURCE.GOOGLE_PLACE,
  LOCATION_SOURCE.MAP_PIN,
];

/** Giới hạn độ dài phần chi tiết — khớp `@MaxLength` ở DTO và `.max()` ở Yup. */
export const ADDRESS_LINE_MAX_LENGTH = 255;
/** Địa chỉ hiển thị đã ghép (chi tiết + xã + tỉnh) — dài hơn vì chứa cả ba phần. */
export const ADDRESS_DISPLAY_MAX_LENGTH = 500;

/**
 * Địa chỉ có cấu trúc mà client GỬI LÊN.
 *
 * `displayAddress` KHÔNG nằm ở đây có chủ đích: server tự ghép từ ba phần rồi lưu, để một chuỗi
 * hiển thị không bao giờ mâu thuẫn với mã hành chính bên cạnh nó.
 */
export interface AddressInput {
  /** Mã tỉnh 2 chữ số — BẮT BUỘC với mọi địa chỉ vật lý. */
  provinceCode: string;
  /** Mã xã/phường/đặc khu 5 chữ số. Server kiểm nó THUỘC `provinceCode`. */
  wardCode: string;
  /** Số nhà, đường, toà nhà — chữ tự do, không có danh mục. */
  addressLine: string;
  /** Mã địa điểm Google, nếu người dùng chọn từ gợi ý. */
  placeId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationSource?: LocationSource | null;
}

/** Địa chỉ có cấu trúc mà API TRẢ VỀ. Tiền/toạ độ là chuỗi thập phân (ADR 0007). */
export interface AddressView {
  provinceCode: string | null;
  provinceName: string | null;
  wardCode: string | null;
  wardName: string | null;
  wardAdministrativeType: WardAdministrativeType | null;
  addressLine: string | null;
  /** Chuỗi hiển thị đã ghép sẵn — dùng thẳng, đừng ghép lại ở client. */
  displayAddress: string | null;
  placeId: string | null;
  latitude: string | null;
  longitude: string | null;
  locationSource: LocationSource | null;
  /**
   * Địa chỉ CŨ dạng chữ tự do chưa quy được về mã hành chính. Khác `null` nghĩa là bản ghi đang
   * chờ chủ sở hữu xác nhận — hệ thống KHÔNG tự đoán hộ (xem `needsAddressReview`).
   */
  legacyAddress: string | null;
  /** Cần người dùng mở ra chọn lại tỉnh/xã và xác nhận ghim. */
  needsAddressReview: boolean;
}
