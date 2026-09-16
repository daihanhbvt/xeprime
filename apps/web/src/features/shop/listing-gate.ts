import {
  API_ERROR_CODE,
  PACKAGE_SHOP_LISTING_REQUIREMENT,
  PACKAGE_SHOP_LISTING_REQUIREMENT_VALUES,
  type PackageShopListingRequirement,
} from '@xeprime/types';
import { ApiClientError } from '@xeprime/api-client';

/**
 * Lỗi "hồ sơ gian hàng chưa đủ để gửi xe duyệt" → danh sách MÃ còn thiếu (ADR 0040).
 *
 * Nhận ĐÚNG mã `SHOP_LISTING_REQUIREMENTS_MISSING`, không nhận `PROFILE_INCOMPLETE` của cổng xác
 * minh: hai bộ quy tắc trùng tên nhau ở `displayName`/`province`, nên nếu chỉ nhìn
 * `details.missing` thì một lỗi của bộ kia sẽ được vẽ bằng nhãn của bộ này và trông vẫn hợp lý.
 *
 * `null` = không phải lỗi đó, nơi gọi xử lý như mọi lỗi khác. Mảng rỗng KHÔNG bao giờ trả về:
 * backend chỉ ném khi có ít nhất một mục thiếu, và một mảng rỗng ở đây sẽ dựng một dải "còn
 * thiếu" không liệt kê được gì.
 *
 * ## Vì sao lọc qua `PACKAGE_SHOP_LISTING_REQUIREMENT_VALUES`
 *
 * `details.missing` đi trên dây là `unknown`. Một backend MỚI HƠN có thể thêm mã thứ bảy mà bản
 * web đang chạy chưa có nhãn — và `t()` với một khoá không tồn tại thì in ra chính khoá đó, tức
 * là người dùng đọc thấy `businessLicense` trần trên giao diện (đúng lỗi `wardInvalid` từng gây
 * ra ở một chỗ khác). Lọc ở biên: mã lạ bị bỏ, và nếu KHÔNG còn mã nào nhận ra thì trả `null`
 * để nơi gọi rơi về câu lỗi chung của server thay vì một dải trống.
 */
export function packageShopListingGateFrom(error: unknown): PackageShopListingRequirement[] | null {
  if (!(error instanceof ApiClientError)) return null;
  if (error.code !== API_ERROR_CODE.SHOP_LISTING_REQUIREMENTS_MISSING) return null;

  const raw = (error.details as { missing?: unknown } | null | undefined)?.missing;
  if (!Array.isArray(raw)) return null;

  const known = PACKAGE_SHOP_LISTING_REQUIREMENT_VALUES as readonly string[];
  const missing = raw.filter(
    (value): value is PackageShopListingRequirement =>
      typeof value === 'string' && known.includes(value),
  );
  return missing.length > 0 ? missing : null;
}

/**
 * Chỉ còn thiếu LOGO — ca gần như luôn đúng trong luồng thật, và nó đáng một câu riêng.
 *
 * Bước 1 của onboarding đã đòi đủ tên · SĐT · tỉnh · xã · địa chỉ, nên sau khi thanh toán mục
 * duy nhất còn lại là logo. Nói thẳng "gian hàng cần có logo" đắt hơn hẳn một danh sách một dòng
 * — và nó dẫn được tới đúng một ô nhập.
 */
export function isLogoOnlyGate(missing: readonly PackageShopListingRequirement[]): boolean {
  return missing.length === 1 && missing[0] === PACKAGE_SHOP_LISTING_REQUIREMENT.LOGO;
}
