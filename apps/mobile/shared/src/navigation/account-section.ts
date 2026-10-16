/**
 * PHẦN của trang tài khoản khu quản lý (`/manage/account`) mà một liên kết muốn mở — cùng tên tham
 * số (`section`) và cùng giá trị với `ACCOUNT_SECTION` bên web (PR #156 · #159), để một deep link
 * hay thông báo do web sinh ra (`/manage/account?section=address`) rơi đúng khối trên app.
 *
 * Với chủ xe tuyến hoa hồng trang này là "Hồ sơ chủ xe" (`OwnerProfileScreen`); với mọi người khác
 * chỉ các khối đăng nhập/mật khẩu/xoá có mặt và giá trị lạ rơi về đầu trang.
 */
export const ACCOUNT_SECTION_PARAM = 'section';

export const ACCOUNT_SECTION = {
  PROFILE: 'profile',
  ADDRESS: 'address',
  /** Hỗ trợ xuất hoá đơn VAT cho mọi xe (chỉ chủ xe hoa hồng — tuyến gói ở "Chính sách thuê", ADR 0059). */
  VAT_INVOICE: 'vat-invoice',
  TAX: 'tax',
  PLAN: 'plan',
  LOGIN: 'login',
  PASSWORD: 'password',
  DELETE: 'delete',
} as const;

export type AccountSection = (typeof ACCOUNT_SECTION)[keyof typeof ACCOUNT_SECTION];

const VALUES: readonly string[] = Object.values(ACCOUNT_SECTION);

export function isAccountSection(value: unknown): value is AccountSection {
  return typeof value === 'string' && VALUES.includes(value);
}
