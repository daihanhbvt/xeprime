'use client';

import { useForm, type UseFormReturn } from 'react-hook-form';
import { guessAddressLine } from '@xeprime/domain';
import { toLocalVnPhone } from '@xeprime/types';
import {
  shopProfileWithContactSchema,
  type ShopProfileWithContactValues,
} from '@xeprime/validators';

import { useValidationResolver } from '@/i18n/use-validation-resolver';

import type { MyShop, UpdateProfileInput } from './types';

/**
 * Form hồ sơ gian hàng — MỘT định nghĩa cho hai màn hình.
 *
 * `/manage/shop` (trang Cửa hàng, năm section) và "Hồ sơ chủ xe" (`/manage/account` của chủ xe
 * tuyến hoa hồng — `OwnerProfilePage`) hỏi CÙNG một bộ trường và ghi vào CÙNG một endpoint. Hai
 * màn khác bố cục (năm section của gian hàng ↔ hồ sơ cá nhân gộp trang chủ xe) — nên phần KHÔNG
 * phải bố cục tách ra đây. Đây cũng là lý do lên gói / hết gói không phải chép dữ liệu: hai màn
 * đọc và ghi đúng một bản ghi.
 *
 * Tách ở mức này, không thấp hơn: hai màn chia sẻ *giá trị khởi tạo*, *schema* và *cách dựng
 * thân request* — đúng ba thứ mà lệch nhau là một trong hai màn gửi lên thứ khác với thứ nó
 * hiển thị. Bố cục thì mỗi màn tự lo.
 */

/** Tên ba trường địa chỉ trong `shopProfileSchema` — hằng ngoài component, định danh ổn định. */
export const SHOP_ADDRESS_FIELD_NAMES = {
  provinceCode: 'provinceCode',
  wardCode: 'wardCode',
  addressLine: 'addressLine',
} as const;

/** Bốn trường GHIM — tách riêng vì không phải form nào cũng lưu toạ độ (xem `AddressPinNames`). */
export const SHOP_ADDRESS_PIN_NAMES = {
  placeId: 'placeId',
  latitude: 'latitude',
  longitude: 'longitude',
  locationSource: 'locationSource',
} as const;

/**
 * Giá trị khởi tạo của form.
 *
 * Tỉnh/thành lấy từ CHI NHÁNH MẶC ĐỊNH trước, hai cột trên hồ sơ chỉ là bản sao dự phòng cho dữ
 * liệu cũ (xem `syncProfileFromDefaultBranch` ở backend) — đọc ngược lại sẽ hiện tỉnh cũ sau khi
 * chủ shop vừa đổi chi nhánh.
 */
export function toShopProfileValues(shop: MyShop): ShopProfileWithContactValues {
  const p = shop.profile;
  return {
    // Tên, SĐT, email của GIAN HÀNG nằm trên `tenants` — thứ khách đọc. SĐT/email đăng nhập của
    // chủ là `ownerAccount`, một bộ khác hẳn và không sửa ở form này (ADR 0053).
    displayName: shop.name,
    phone: shop.phone ? toLocalVnPhone(shop.phone) : '',
    email: shop.email ?? '',
    bio: p.bio ?? '',
    provinceCode: shop.defaultBranch?.provinceCode ?? p.provinceCode ?? '',
    wardCode: shop.defaultBranch?.wardCode ?? p.wardCode ?? '',
    /*
     * Hồ sơ CŨ chưa có phần "số nhà, đường" tách riêng: đoán từ chuỗi hiển thị bằng cách cắt
     * các cụm trông như đơn vị hành chính. Chỉ là GỢI Ý — chủ shop nhìn và sửa trước khi lưu.
     */
    addressLine: guessAddressLine(shop.defaultBranch?.address ?? p.address),
    placeId: null,
    latitude: null,
    longitude: null,
    locationSource: null,
    taxCode: p.taxCode ?? '',
    businessLicenseNo: p.businessLicenseNo ?? '',
    logoUrl: p.logoUrl ?? null,
    coverUrl: p.coverUrl ?? null,
  };
}

/** Giá trị form → thân request. Dùng cho CẢ hai đường ra: lưu, và lưu-rồi-gửi-duyệt. */
export function toShopProfileBody(v: ShopProfileWithContactValues): UpdateProfileInput {
  return {
    displayName: v.displayName,
    // Chuỗi rỗng là GỠ liên hệ của gian hàng — server lưu NULL.
    phone: v.phone,
    email: v.email,
    bio: v.bio,
    // Chỉ gửi MÃ + phần chi tiết — tên tỉnh/xã và chuỗi hiển thị do server ghép. Backend
    // chuyển tiếp cả cụm cho chi nhánh mặc định (writer duy nhất của địa chỉ vận hành).
    provinceCode: v.provinceCode,
    /*
     * Chuỗi RỖNG không được gửi: DTO khai `@IsOptional()` kèm `@Length(5, 5)`, mà `@IsOptional`
     * chỉ bỏ qua `null`/`undefined`. Từ ADR 0042 form không còn ô Xã/phường, nên hồ sơ chưa từng
     * khai mã xã sẽ luôn rơi vào nhánh này.
     */
    wardCode: v.wardCode || undefined,
    addressLine: v.addressLine,
    taxCode: v.taxCode,
    businessLicenseNo: v.businessLicenseNo,
    logoUrl: v.logoUrl ?? '',
    coverUrl: v.coverUrl ?? '',
  };
}

/**
 * React Hook Form đã nối sẵn schema và giá trị của một gian hàng.
 *
 * `values` (không phải `defaultValues`): sau khi lưu, query trả hồ sơ mới và form phải theo —
 * nếu không, "Huỷ bỏ" mời người dùng hoàn tác thứ đã lưu xong rồi.
 */
export function useShopProfileForm(shop: MyShop): UseFormReturn<ShopProfileWithContactValues> {
  const resolver = useValidationResolver<ShopProfileWithContactValues>(
    shopProfileWithContactSchema,
    'Shop.validation',
  );
  return useForm<ShopProfileWithContactValues>({ resolver, values: toShopProfileValues(shop) });
}
