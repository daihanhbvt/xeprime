/**
 * MẶT TIỀN công khai của một gian hàng — "trang `/shops/[slug]` này phải trông như của ai?".
 *
 * Câu hỏi này KHÔNG trùng `resolveAccountTrack`, dù cả hai cùng đọc `billingMode`:
 *
 *   `resolveAccountTrack`    — người ĐANG ĐĂNG NHẬP là ai (cần `roleKey`, phân biệt nhân viên).
 *   `resolveStorefrontKind`  — gian hàng ĐANG ĐƯỢC XEM là gì (không có người xem trong phương trình).
 *
 * Khách mở trang gian hàng thường không đăng nhập, nên ở đây không có vai nào để đọc; và một
 * nhân viên gian hàng mở trang shop của chính mình vẫn phải thấy đúng mặt tiền mà khách thấy.
 * Gộp hai phép suy lại là để một trong hai bắt đầu hỏi thứ nó không có.
 *
 * ## Vì sao chỉ có HAI giá trị, trong khi `billingMode` có ba khả năng
 *
 * `unconfigured` (tenant không giải được gói hiệu lực — ADR 0038 điều 1) không phải một mặt
 * tiền. Đường ĐỌC hiển thị phải chọn một thứ để vẽ, và thứ an toàn là mặt tiền CÁ NHÂN: nó
 * không khẳng định điều gì mà nền tảng chưa xác minh. Vẽ mặt tiền gian hàng — kèm dấu xác thực —
 * cho một tenant mà đường ghi tiền đang từ chối là nói dối khách bằng đồ hoạ.
 *
 * Hai pha còn lại đã được `resolveEffectiveBilling` giải trước khi `billingMode` đi trên dây:
 * ân hạn giữ `package` ⇒ vẫn là gian hàng; hết ân hạn thành `commission` ⇒ về mặt tiền cá nhân.
 */

import { BILLING_MODE } from './status/billing';

export const STOREFRONT_KIND = {
  /** Chủ xe cá nhân (tuyến hoa hồng, hoặc chưa xác định) — trang dạng hồ sơ CON NGƯỜI. */
  PERSONAL: 'personal',
  /** Gian hàng tuyến gói — trang dạng cửa hàng: ảnh bìa, dấu xác thực, năng lực doanh nghiệp. */
  SHOP: 'shop',
} as const;

export type StorefrontKind = (typeof STOREFRONT_KIND)[keyof typeof STOREFRONT_KIND];

export const STOREFRONT_KIND_VALUES = Object.values(STOREFRONT_KIND) as StorefrontKind[];

/** Mặt tiền suy từ tuyến thu tiền hiệu lực. Mọi giá trị không phải `package` ⇒ cá nhân. */
export function resolveStorefrontKind(
  billingMode: string | null | undefined,
): StorefrontKind {
  return billingMode === BILLING_MODE.PACKAGE ? STOREFRONT_KIND.SHOP : STOREFRONT_KIND.PERSONAL;
}

/**
 * Gian hàng này có được đeo DẤU XÁC THỰC không (`VerifiedMark`).
 *
 * Cùng một luật với `isVerifiedShop` ở menu tài khoản, cố ý: dấu trên trang công khai và dấu
 * cạnh tên người đang đăng nhập phải nói cùng một điều về cùng một gian hàng. Tuyến gói là
 * nhóm DUY NHẤT đã đi qua xác minh pháp nhân VÀ đang trả thuê bao — gắn dấu rộng hơn thế là
 * biến nó thành một hình trang trí không phân biệt được gì.
 */
export function hasVerifiedStorefront(billingMode: string | null | undefined): boolean {
  return resolveStorefrontKind(billingMode) === STOREFRONT_KIND.SHOP;
}

/**
 * Gian hàng này có mở kênh NHẮN TIN công khai không.
 *
 * Chỉ mặt tiền GIAN HÀNG (tuyến gói). Chủ xe cá nhân thì kênh chat mở SAU KHI khách gửi yêu cầu
 * thuê, và đó không phải một hạn chế tuỳ tiện:
 *
 *  - Sau một gian hàng là một đội trực máy trong giờ làm việc; sau một chủ xe cá nhân là một
 *    người đang đi làm việc khác. Một hộp thư mở công khai cho bất kỳ ai lướt qua biến số điện
 *    thoại thứ hai của họ thành kênh hỗ trợ không lương.
 *  - Yêu cầu thuê là bằng chứng rẻ nhất rằng người nhắn có ý định thật. Nó không chặn khách
 *    thật — họ vẫn đặt được xe mà không cần hỏi trước, và kênh mở ngay khi yêu cầu được gửi.
 *
 * Đây là một câu hỏi RIÊNG, không phải `hasVerifiedStorefront` gọi bằng tên khác: hôm nay hai
 * hàm cho cùng kết quả vì cùng đọc một tuyến, nhưng "đeo dấu xác thực" và "mở hộp thư công khai"
 * là hai chính sách có thể rời nhau bất cứ lúc nào — và lúc đó chỗ phải sửa là đúng một hàm.
 */
export function storefrontAllowsPublicChat(kind: StorefrontKind): boolean {
  return kind === STOREFRONT_KIND.SHOP;
}
