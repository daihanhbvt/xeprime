/**
 * "Hồ sơ gian hàng đã đủ để gửi duyệt chưa" — MỘT định nghĩa cho cả hai phía.
 *
 * Trước đây câu hỏi này không có câu trả lời ở đâu cả: `submitForReview` chỉ kiểm TRẠNG THÁI
 * tenant, nên một hồ sơ trắng trơn vẫn vào được hàng đợi duyệt và reviewer nhận `{}` làm bằng
 * chứng. Còn phía web thì nút "Gửi duyệt" sáng ngay cả khi hai ô bắt buộc còn trống, vì
 * `shopProfileSchema` chỉ chạy lúc bấm **Lưu**.
 *
 * Quy tắc nằm ở `packages/types` chứ không ở một trong hai app, vì cả hai đều phải trả lời
 * GIỐNG HỆT nhau: web dùng nó để dựng checklist và chặn trước khi gọi API, api dùng nó làm
 * cổng thật. Chép sang hai nơi là hẹn ngày chúng lệch nhau, và lúc đó người dùng thấy checklist
 * xanh hết mà server vẫn từ chối.
 *
 * Hai nhóm, khác nhau ở hệ quả — không phải ở mức độ quan trọng:
 *
 * - **Bắt buộc** (`SHOP_PROFILE_REQUIREMENT`): thiếu thì reviewer không có gì để duyệt. Tên để
 *   hiện trên marketplace, tỉnh để biết xe nằm ở đâu, họ tên + SĐT để liên hệ được một người
 *   thật. Bốn thứ này CHẶN gửi duyệt.
 * - **Nên có** (`SHOP_PROFILE_SUGGESTION`): làm gian hàng bán được hàng hơn, nhưng thiếu vẫn
 *   duyệt được. Chúng hiện trong checklist để chủ shop biết còn gì, và KHÔNG chặn — mở gian
 *   hàng phải ít ma sát (mục tiêu G1 của brief 03).
 */

export const SHOP_PROFILE_REQUIREMENT = {
  DISPLAY_NAME: 'displayName',
  PROVINCE: 'province',
  OWNER_NAME: 'ownerName',
  OWNER_PHONE: 'ownerPhone',
} as const;

export type ShopProfileRequirement =
  (typeof SHOP_PROFILE_REQUIREMENT)[keyof typeof SHOP_PROFILE_REQUIREMENT];

export const SHOP_PROFILE_REQUIREMENT_VALUES = Object.values(
  SHOP_PROFILE_REQUIREMENT,
) as ShopProfileRequirement[];

export const SHOP_PROFILE_SUGGESTION = {
  LOGO: 'logo',
  BIO: 'bio',
  ADDRESS: 'address',
  COVER: 'cover',
  BANK: 'bank',
} as const;

export type ShopProfileSuggestion =
  (typeof SHOP_PROFILE_SUGGESTION)[keyof typeof SHOP_PROFILE_SUGGESTION];

export const SHOP_PROFILE_SUGGESTION_VALUES = Object.values(
  SHOP_PROFILE_SUGGESTION,
) as ShopProfileSuggestion[];

/**
 * Giá trị cần để chấm hồ sơ.
 *
 * `provinceCode` là tỉnh HIỆU LỰC của gian hàng — tức tỉnh của chi nhánh mặc định, với hai cột
 * trên `tenant_profiles` chỉ là bản sao (xem `syncProfileFromDefaultBranch`). Người gọi tự phân
 * giải trước khi truyền vào; hàm này không biết gì về bảng nào.
 */
export interface ShopProfileCompletenessInput {
  displayName?: string | null;
  provinceCode?: string | null;
  ownerFullName?: string | null;
  ownerPhone?: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  bio?: string | null;
  address?: string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankAccountName?: string | null;
}

/**
 * `null`, `undefined` và `'   '` đều là "chưa có".
 *
 * Backend chuẩn hoá ô trống thành `NULL` khi ghi (`normalizeProfileWrite`), nhưng form phía web
 * cầm chuỗi rỗng cho tới lúc gửi — một hàm dùng chung phải đúng với cả hai dạng.
 */
function filled(value?: string | null): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/** Các mục BẮT BUỘC còn thiếu. Rỗng ⇒ gửi duyệt được. */
export function missingShopProfileRequirements(
  profile: ShopProfileCompletenessInput,
): ShopProfileRequirement[] {
  const missing: ShopProfileRequirement[] = [];
  if (!filled(profile.displayName)) missing.push(SHOP_PROFILE_REQUIREMENT.DISPLAY_NAME);
  if (!filled(profile.provinceCode)) missing.push(SHOP_PROFILE_REQUIREMENT.PROVINCE);
  if (!filled(profile.ownerFullName)) missing.push(SHOP_PROFILE_REQUIREMENT.OWNER_NAME);
  if (!filled(profile.ownerPhone)) missing.push(SHOP_PROFILE_REQUIREMENT.OWNER_PHONE);
  return missing;
}

/**
 * Các mục NÊN CÓ còn thiếu — chỉ để hiện trong checklist, không bao giờ chặn.
 *
 * Tài khoản nhận tiền tính là MỘT mục: ba cột ngân hàng chỉ có nghĩa khi có đủ cả ba, và tách
 * chúng ra ba dòng biến một việc thành ba lần gõ vào cùng một khối.
 */
export function missingShopProfileSuggestions(
  profile: ShopProfileCompletenessInput,
): ShopProfileSuggestion[] {
  const missing: ShopProfileSuggestion[] = [];
  if (!filled(profile.logoUrl)) missing.push(SHOP_PROFILE_SUGGESTION.LOGO);
  if (!filled(profile.bio)) missing.push(SHOP_PROFILE_SUGGESTION.BIO);
  if (!filled(profile.address)) missing.push(SHOP_PROFILE_SUGGESTION.ADDRESS);
  if (!filled(profile.coverUrl)) missing.push(SHOP_PROFILE_SUGGESTION.COVER);
  if (!filled(profile.bankName) || !filled(profile.bankAccountNo) || !filled(profile.bankAccountName)) {
    missing.push(SHOP_PROFILE_SUGGESTION.BANK);
  }
  return missing;
}

/** Hồ sơ đã đủ điều kiện gửi duyệt chưa. */
export function isShopProfileSubmittable(profile: ShopProfileCompletenessInput): boolean {
  return missingShopProfileRequirements(profile).length === 0;
}
