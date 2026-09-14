import type { AddressViewDto, GeoPinDto } from '../modules/locations/dto/address.dto';

/** Toạ độ đọc lên từ Prisma — `Decimal` hoặc `number`, cả hai đều `toString()` được. */
type DecimalLike = { toString(): string } | null | undefined;

export interface AddressColumns {
  displayAddress?: string | null;
  addressLine?: string | null;
  provinceCode?: string | null;
  provinceName?: string | null;
  wardCode?: string | null;
  wardName?: string | null;
  wardAdministrativeType?: string | null;
  placeId?: string | null;
  latitude?: DecimalLike;
  longitude?: DecimalLike;
  locationSource?: string | null;
}

/**
 * Bộ cột địa chỉ đọc lên từ DB → khối `AddressViewDto` cho client. `null` khi bản ghi KHÔNG có
 * địa chỉ nào (khách tự tới lấy xe, chuyến không có điểm đón).
 *
 * Vì sao là hàm dùng chung chứ không phải vài dòng lặp lại ở mỗi service: `needsAddressReview`
 * SUY RA từ việc thiếu mã xã, và quy tắc đó phải giống nhau ở yêu cầu thuê, đơn thuê, chi nhánh
 * và sổ khách. Viết lại bốn lần là bốn cơ hội để một màn hình nói "địa chỉ ổn" trong khi ba màn
 * còn lại nói ngược.
 *
 * **`provinceName`/`wardName` thường là `null` với dữ liệu SNAPSHOT** (yêu cầu thuê, đơn thuê):
 * ở đó địa chỉ đã đóng băng thành `displayAddress` — chuỗi đã chứa sẵn tên xã và tên tỉnh do
 * server ghép lúc tạo. Đó là chủ đích: đơn cũ phải đọc ra đúng địa chỉ tại thời điểm đặt, kể cả
 * khi danh mục hành chính về sau đổi tên đơn vị. Client cần tên hiện hành thì tra bằng mã
 * (`GET /wards/lookup`), không suy từ chuỗi.
 */
export function addressViewOf(columns: AddressColumns): AddressViewDto | null {
  const hasAnything =
    Boolean(columns.provinceCode) ||
    Boolean(columns.displayAddress) ||
    Boolean(columns.addressLine) ||
    columns.latitude != null;
  if (!hasAnything) return null;

  return {
    provinceCode: columns.provinceCode ?? null,
    provinceName: columns.provinceName ?? null,
    wardCode: columns.wardCode ?? null,
    wardName: columns.wardName ?? null,
    wardAdministrativeType: columns.wardAdministrativeType ?? null,
    addressLine: columns.addressLine ?? null,
    displayAddress: columns.displayAddress ?? null,
    placeId: columns.placeId ?? null,
    latitude: columns.latitude?.toString() ?? null,
    longitude: columns.longitude?.toString() ?? null,
    locationSource: columns.locationSource ?? null,
    needsAddressReview: !columns.wardCode,
  };
}

/**
 * Ghim trần (toạ độ + mã địa điểm) → DTO. `null` khi chưa ai ghim.
 *
 * Đòi CẢ hai toạ độ: một nửa cặp toạ độ không đặt được lên bản đồ, và trả về `{lat, null}` chỉ
 * đẩy việc kiểm tra sang phía client.
 */
export function pinOf(
  latitude: DecimalLike,
  longitude: DecimalLike,
  placeId: string | null | undefined,
): GeoPinDto | null {
  if (latitude == null || longitude == null) return null;
  return {
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    placeId: placeId ?? null,
  };
}
