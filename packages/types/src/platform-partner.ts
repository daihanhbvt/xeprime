/**
 * ĐỐI TÁC của nền tảng, nhìn từ khu Platform Admin — "người bán này thuộc danh sách nào?"
 *
 * Hai danh sách, hai URL (`/manage/admin/partners/shops` · `/manage/admin/partners/owners`), và
 * đường ranh giữa chúng là TUYẾN SẢN PHẨM — không phải tên gói, tên vai, `tenant_type` hay
 * một chuỗi hiển thị nào:
 *
 * | Loại | Luật | Gồm |
 * | --- | --- | --- |
 * | `package_shop` | {@link isPackageShopTrack} | `package_pending` (đang onboarding, chờ tiền gói) · `package_active` (kể cả đã hết gói — khách cũ cần gia hạn, ADR 0040 điều 4) · chủ xe vào cửa hoa hồng rồi MUA gói (`billingMode = package`, kể cả trong ân hạn) |
 * | `individual_owner` | phần còn lại | tuyến hoa hồng / Owner Lite, và tenant `unconfigured` chưa từng qua cửa gói |
 *
 * Vì sao KHÔNG dùng `resolveStorefrontKind`: mặt tiền chỉ đọc `billingMode`, nên một gian hàng
 * đang chờ kích hoạt gói (chưa có dòng thuê bao nào) bị xếp vào mặt tiền cá nhân. Với khách xem
 * trang công khai đó là đúng; với người trực nền tảng thì một gian hàng vừa đăng ký gói biến mất
 * khỏi danh sách gian hàng đúng lúc họ cần được hỗ trợ nhất.
 *
 * Hai loại PHỦ KÍN và RỜI NHAU — mọi tenant thuộc đúng một danh sách. Backend lọc bằng chính
 * luật này TRƯỚC phân trang (`PlatformTenantsService`), nên tổng số của hai danh sách cộng lại
 * đúng bằng tổng số gian hàng.
 */

import { isPackageShopTrack, type ShopOnboardingInput } from './shop-onboarding';

export const PLATFORM_PARTNER_KIND = {
  /** Gian hàng tuyến gói — Full Manage. */
  PACKAGE_SHOP: 'package_shop',
  /** Chủ xe cá nhân tuyến hoa hồng — Owner Lite. */
  INDIVIDUAL_OWNER: 'individual_owner',
} as const;

export type PlatformPartnerKind =
  (typeof PLATFORM_PARTNER_KIND)[keyof typeof PLATFORM_PARTNER_KIND];

export const PLATFORM_PARTNER_KIND_VALUES = Object.values(
  PLATFORM_PARTNER_KIND,
) as PlatformPartnerKind[];

export function isPlatformPartnerKind(value: unknown): value is PlatformPartnerKind {
  return (PLATFORM_PARTNER_KIND_VALUES as unknown[]).includes(value);
}

/**
 * Loại đối tác của một tenant. `billingMode` là tuyến HIỆU LỰC đã giải qua
 * `resolveEffectiveBilling` (ân hạn giữ `package`, hết ân hạn thành `commission`).
 */
export function platformPartnerKindOf(tenant: ShopOnboardingInput): PlatformPartnerKind {
  return isPackageShopTrack(tenant)
    ? PLATFORM_PARTNER_KIND.PACKAGE_SHOP
    : PLATFORM_PARTNER_KIND.INDIVIDUAL_OWNER;
}

/** Sắp xếp danh sách đối tác ở Platform Admin — server-side, trước phân trang. */
export const PLATFORM_TENANT_SORT = {
  NEWEST: 'newest',
  OLDEST: 'oldest',
  NAME: 'name',
  VEHICLES: 'vehicles',
} as const;

export type PlatformTenantSort = (typeof PLATFORM_TENANT_SORT)[keyof typeof PLATFORM_TENANT_SORT];

export const PLATFORM_TENANT_SORT_VALUES = Object.values(
  PLATFORM_TENANT_SORT,
) as PlatformTenantSort[];

export const DEFAULT_PLATFORM_TENANT_SORT: PlatformTenantSort = PLATFORM_TENANT_SORT.NEWEST;

export function isPlatformTenantSort(value: unknown): value is PlatformTenantSort {
  return (PLATFORM_TENANT_SORT_VALUES as unknown[]).includes(value);
}
