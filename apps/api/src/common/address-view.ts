import { isValidGeoPoint, type GeoPoint } from '@xeprime/domain';
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

export interface BranchMapSource {
  address: string | null;
  latitude: DecimalLike;
  longitude: DecimalLike;
}

/**
 * Điểm ghim của một chi nhánh trên bản đồ, kèm dòng địa chỉ in lên ảnh — `null` khi không có gì
 * để ghim. MỘT quy tắc cho toạ độ trên trang xe công khai, ảnh điểm nhận xe và ảnh chi nhánh ở hồ
 * sơ xe (ADR 0061 điều 1); ba bản chép tay đã từng lệch nhau.
 *
 * Chỉ khi chi nhánh có ĐỊA CHỈ của chính nó: trang xe rơi về địa chỉ hồ sơ gian hàng khi chi
 * nhánh chưa điền, và ghim toạ độ chi nhánh dưới một dòng địa chỉ khác là chỉ khách tới sai chỗ.
 * Thiếu một trong hai toạ độ cũng là không có điểm — `Number(null)` là 0, không phải "chưa biết".
 */
export function branchMapTarget(
  branch: BranchMapSource | null | undefined,
): { point: GeoPoint; label: string } | null {
  const address = branch?.address?.trim();
  if (!address || branch?.latitude == null || branch.longitude == null) return null;
  const point = { lat: Number(branch.latitude.toString()), lng: Number(branch.longitude.toString()) };
  return isValidGeoPoint(point) ? { point, label: address } : null;
}
