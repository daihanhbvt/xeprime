import { BadRequestException, Injectable } from '@nestjs/common';
import { addressGeocodeQuery, formatAddress } from '@xeprime/domain';
import { API_ERROR_CODE, LOCATION_SOURCE, type LocationSource } from '@xeprime/types';
import { GeoService } from '../geo/geo.service';
import { ProvincesService } from './provinces.service';
import { WardsService } from './wards.service';

/**
 * Địa chỉ như client gửi lên — các trường PHẲNG đã gỡ tiền tố bởi nơi gọi.
 *
 * Mọi trường đều tuỳ chọn vì cùng một hàm phục vụ cả hai chiều: tạo mới (có đủ) và sửa từng
 * phần (chỉ gửi thứ đổi). Nơi gọi nói rõ mình đang ở ca nào bằng `require`.
 */
export interface AddressInput {
  provinceCode?: string | null;
  wardCode?: string | null;
  addressLine?: string | null;
  placeId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationSource?: string | null;
}

/** Địa chỉ đã kiểm và chuẩn hoá — đúng bộ cột mà mọi bảng lưu địa chỉ cần. */
export interface ResolvedAddress {
  provinceCode: string;
  provinceName: string;
  wardCode: string | null;
  wardName: string | null;
  addressLine: string | null;
  /** Chuỗi đã ghép `số nhà, xã/phường, tỉnh` — đây là thứ lưu vào cột `address` hiển thị. */
  displayAddress: string;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
  locationSource: LocationSource;
  /** Thiếu mã xã ⇒ địa chỉ chưa khớp danh mục hiện hành, chờ người dùng bổ sung. */
  needsReview: boolean;
}

/**
 * Địa chỉ vật lý — nơi DUY NHẤT biến ô nhập của người dùng thành dữ liệu lưu được.
 *
 * Ba việc, và cả ba đều là thứ không được phép làm khác nhau giữa các module:
 *
 *   1. **Kiểm danh mục** — tỉnh đang mở, xã tồn tại và THUỘC tỉnh đó. (DB còn giữ vế thứ ba
 *      bằng FK tổ hợp `(ward_code, province_code)`; lớp này để trả thông báo gọi được tên đơn
 *      vị, không phải lớp bảo vệ duy nhất.)
 *   2. **Ghép chuỗi hiển thị** — một địa chỉ có đúng một cách viết trong toàn hệ thống.
 *   3. **Chốt toạ độ** — ghim người dùng đã xác nhận THẮNG; chỉ khi không có mới đi hỏi bản đồ,
 *      và kết quả hỏi được đánh dấu `geocoded` (máy đoán) chứ không phải `map_pin` (người xác
 *      nhận). Phân biệt này quyết định giao diện có nhắc "kiểm lại ghim" hay không.
 *
 * **Không ném vì bản đồ.** `GeoService` đã nuốt mọi lỗi mạng thành `null`; một chi nhánh không
 * lưu được vì Google chậm là lấy tiện ích ước lượng ra làm điều kiện của thao tác quản trị.
 *
 * **Chấp nhận địa chỉ THIẾU mã xã** (`requireWard: false`) cho các luồng còn client cũ và cho
 * dữ liệu lịch sử: chặn cứng ở đây nghĩa là một khách đang đặt xe từ bản app chưa cập nhật sẽ
 * không gửi được yêu cầu. Bản ghi thiếu mã xã đi ra với `needsReview = true` và được mời bổ
 * sung — đó là xử lý đúng, không phải nhân nhượng.
 */
@Injectable()
export class AddressService {
  constructor(
    private readonly provinces: ProvincesService,
    private readonly wards: WardsService,
    private readonly geo: GeoService,
  ) {}

  /**
   * Kiểm + chuẩn hoá một địa chỉ do client gửi lên.
   *
   * `skipGeocode` cho luồng chạy TRONG transaction: gọi mạng khi đang giữ một transaction
   * Postgres mở là cách chắc chắn để một sự cố bên ngoài thành một hàng đợi khoá bên trong.
   */
  async resolve(
    input: AddressInput,
    options: {
      requireWard?: boolean;
      skipGeocode?: boolean;
      field?: string;
      /**
       * Địa chỉ này có phải một nơi ĐĂNG KÝ MỚI không.
       *
       * `true` (mặc định) cho chi nhánh và gian hàng: nơi đó phải đang mở đăng ký. `false` cho
       * địa chỉ do KHÁCH khai — giao xe, điểm đón, sổ khách — vì `is_enabled` là công tắc vận
       * hành của danh mục, không phải phán quyết rằng nơi đó không tồn tại.
       */
      requireSelectable?: boolean;
    } = {},
  ): Promise<ResolvedAddress> {
    const provinceCode = input.provinceCode?.trim();
    if (!provinceCode) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Thiếu tỉnh/thành',
        details: { field: options.field ?? 'provinceCode' },
      });
    }
    const requireSelectable = options.requireSelectable ?? true;
    const province = requireSelectable
      ? await this.provinces.assertSelectable(provinceCode)
      : await this.provinces.assertExists(provinceCode);

    const wardCode = input.wardCode?.trim() || null;
    if (!wardCode && options.requireWard) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Chọn xã/phường/đặc khu',
        details: { field: options.field ?? 'wardCode' },
      });
    }
    const ward = wardCode
      ? await this.wards.assertSelectable(wardCode, province.code, requireSelectable)
      : null;

    const addressLine = input.addressLine?.trim() || null;
    const displayAddress =
      formatAddress({ addressLine, wardName: ward?.name, provinceName: province.name }) ??
      province.name;

    const hasClientPin = input.latitude != null && input.longitude != null;
    const geocoded =
      hasClientPin || options.skipGeocode
        ? null
        : await this.geocode(addressLine, ward?.name ?? null, province.name);

    return {
      provinceCode: province.code,
      provinceName: province.name,
      wardCode: ward?.code ?? null,
      wardName: ward?.name ?? null,
      addressLine,
      displayAddress,
      placeId: input.placeId?.trim() || null,
      latitude: hasClientPin ? input.latitude! : (geocoded?.lat ?? null),
      longitude: hasClientPin ? input.longitude! : (geocoded?.lng ?? null),
      locationSource: resolveSource(input.locationSource, hasClientPin, Boolean(geocoded)),
      needsReview: !ward,
    };
  }

  /**
   * Như {@link resolve} nhưng trả `null` khi client KHÔNG gửi phần hành chính nào.
   *
   * Đây là đường dành cho những chỗ địa chỉ vốn là chuỗi tự do và đang chuyển dần sang có cấu
   * trúc (điểm đón, địa chỉ giao xe, địa chỉ trong sổ khách). Client đã cập nhật gửi mã tỉnh +
   * mã xã ⇒ nhận lại một địa chỉ đầy đủ, kể cả chuỗi hiển thị do server ghép. Client chưa cập
   * nhật gửi mỗi chuỗi ⇒ `null`, và nơi gọi giữ nguyên chuỗi khách đã gõ.
   *
   * Trả `null` chứ không ném: một khách đang đặt xe từ bản app cũ không được phép mất khả năng
   * gửi yêu cầu chỉ vì hệ thống vừa có thêm một danh mục.
   */
  async resolveOptional(
    input: AddressInput,
    options: { skipGeocode?: boolean; field?: string; requireSelectable?: boolean } = {},
  ): Promise<ResolvedAddress | null> {
    if (!input.provinceCode?.trim()) return null;
    return this.resolve(input, options);
  }

  /** Tra toạ độ từ chuỗi địa chỉ — best-effort, `null` là câu trả lời hợp lệ. */
  private async geocode(
    addressLine: string | null,
    wardName: string | null,
    provinceName: string,
  ): Promise<{ lat: number; lng: number } | null> {
    if (!this.geo.enabled) return null;
    const query = addressGeocodeQuery({ addressLine, wardName, provinceName });
    if (!query) return null;
    const resolved = await this.geo.geocode(query);
    return resolved ? { lat: resolved.point.lat, lng: resolved.point.lng } : null;
  }
}

/**
 * Nguồn toạ độ — SERVER quyết định, không lấy nguyên lời khai của client.
 *
 * Client tự khai `map_pin` trong khi không gửi toạ độ nào, hoặc tự khai `google_place` cho một
 * ghim nó tự nghĩ ra, đều là cách để một toạ độ đáng ngờ đội lốt "đã xác nhận" và thoát khỏi
 * lời nhắc kiểm lại. Chỉ khi CÓ toạ độ thật thì lời khai kia mới có nghĩa.
 */
function resolveSource(
  claimed: string | null | undefined,
  hasClientPin: boolean,
  hasGeocoded: boolean,
): LocationSource {
  if (hasClientPin) {
    return claimed === LOCATION_SOURCE.GOOGLE_PLACE
      ? LOCATION_SOURCE.GOOGLE_PLACE
      : LOCATION_SOURCE.MAP_PIN;
  }
  if (hasGeocoded) return LOCATION_SOURCE.GEOCODED;
  // Không có toạ độ nào: người dùng chỉ gõ chữ và bỏ qua bước ghim. Nói thẳng như vậy.
  return LOCATION_SOURCE.MANUAL;
}
