import {
  API_ERROR_CODE,
  PACKAGE_SHOP_LISTING_REQUIREMENT,
  PACKAGE_SHOP_LISTING_REQUIREMENT_VALUES,
  isPublishRequirement,
  type PackageShopListingRequirement,
  type PublishRequirement,
} from '@xeprime/types';

/**
 * Lỗi API nhìn từ đây — chỉ HAI trường, và cố ý không phải `ApiClientError`.
 *
 * `@xeprime/api-client` đã phụ thuộc `@xeprime/domain`, nên import ngược lại là một vòng phụ
 * thuộc. Đọc theo CẤU TRÚC giải được mà không phải dựng vòng đó: một `ApiClientError` thật khớp
 * kiểu này, và phép lọc bên dưới vẫn đòi ĐÚNG mã lỗi cộng một mảng mã hợp lệ, nên không có object
 * lạ nào đi qua được.
 */
export interface ApiErrorLike {
  readonly code?: unknown;
  readonly details?: unknown;
}

/**
 * Lỗi "hồ sơ gian hàng chưa đủ để gửi xe duyệt" → danh sách MÃ còn thiếu (ADR 0040).
 *
 * Nhận ĐÚNG mã `SHOP_LISTING_REQUIREMENTS_MISSING`, không nhận `PROFILE_INCOMPLETE` của cổng xác
 * minh: hai bộ quy tắc trùng tên nhau ở `displayName`/`province`, nên nếu chỉ nhìn `details.missing`
 * thì một lỗi của bộ kia sẽ được vẽ bằng nhãn của bộ này và trông vẫn hợp lý.
 *
 * `null` = không phải lỗi đó, nơi gọi xử lý như mọi lỗi khác. Mảng rỗng KHÔNG bao giờ trả về:
 * backend chỉ ném khi có ít nhất một mục thiếu, và một mảng rỗng ở đây sẽ dựng một dải "còn thiếu"
 * không liệt kê được gì.
 *
 * ## Vì sao lọc qua `PACKAGE_SHOP_LISTING_REQUIREMENT_VALUES`
 *
 * `details.missing` đi trên dây là `unknown`. Một backend MỚI HƠN có thể thêm mã thứ bảy mà client
 * đang chạy chưa có nhãn — và `t()` với một khoá không tồn tại thì in ra chính khoá đó, tức người
 * dùng đọc thấy `businessLicense` trần trên giao diện (đúng lỗi `wardInvalid` từng gây ra ở một chỗ
 * khác). Lọc ở biên: mã lạ bị bỏ, và nếu KHÔNG còn mã nào nhận ra thì trả `null` để nơi gọi rơi về
 * câu lỗi chung của server thay vì một dải trống.
 */
export function packageShopListingGateFrom(
  error: unknown,
): PackageShopListingRequirement[] | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code, details } = error as ApiErrorLike;
  if (code !== API_ERROR_CODE.SHOP_LISTING_REQUIREMENTS_MISSING) return null;

  const raw = (details as { missing?: unknown } | null | undefined)?.missing;
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
 * Bước 1 của onboarding đã đòi đủ tên · SĐT · tỉnh · xã · địa chỉ, nên sau khi thanh toán mục duy
 * nhất còn lại là logo. Nói thẳng "gian hàng cần có logo" đắt hơn hẳn một danh sách một dòng — và
 * nó dẫn được tới đúng một ô nhập.
 */
export function isLogoOnlyGate(missing: readonly PackageShopListingRequirement[]): boolean {
  return missing.length === 1 && missing[0] === PACKAGE_SHOP_LISTING_REQUIREMENT.LOGO;
}

/**
 * `details.missing[]` của `VEHICLE_PUBLISH_INCOMPLETE` → danh sách MÃ điều kiện đăng xe còn thiếu.
 *
 * Anh em với `packageShopListingGateFrom` ngay trên, và tách bạch với nó có chủ đích: một bên là
 * hồ sơ GIAN HÀNG chưa đủ (ADR 0040), một bên là hồ sơ CHIẾC XE chưa đủ. Hai bộ mã khác nhau, hai
 * chỗ sửa khác nhau, và trộn chúng là vẽ nhãn của bộ này lên lỗi của bộ kia.
 *
 * Lọc qua `isPublishRequirement` chứ không tin thẳng mảng từ mạng: một mã lạ (backend mới hơn app)
 * sẽ thành `t('requirements.<mã lạ>')`, và tuỳ thư viện i18n mà nó ném ra giữa lúc render hoặc in
 * chính cái mã ra màn hình. Thà hiện thiếu một dòng còn hơn làm hỏng màn của người vừa điền xong
 * cả wizard.
 *
 * Trả MẢNG RỖNG chứ không `null` khi không phải lỗi đó: nơi gọi luôn hỏi "còn thiếu gì", và
 * `length > 0` là phép thử duy nhất nó cần.
 */
export function publishRequirementsFrom(error: unknown): PublishRequirement[] {
  if (typeof error !== 'object' || error === null) return [];
  const { code, details } = error as ApiErrorLike;
  if (code !== API_ERROR_CODE.VEHICLE_PUBLISH_INCOMPLETE) return [];

  const raw = (details as { missing?: unknown } | null | undefined)?.missing;
  return Array.isArray(raw) ? raw.filter(isPublishRequirement) : [];
}
