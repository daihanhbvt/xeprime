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

import { toLocalVnPhone } from './phone';
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
export function resolveStorefrontKind(billingMode: string | null | undefined): StorefrontKind {
  return billingMode === BILLING_MODE.PACKAGE ? STOREFRONT_KIND.SHOP : STOREFRONT_KIND.PERSONAL;
}

/**
 * DANH TÍNH CÔNG KHAI của một mặt tiền — tên, SĐT, email, ảnh mà khách thấy (ADR 0054).
 *
 * ## Mặt tiền CÁ NHÂN (tuyến hoa hồng) = tài khoản của chủ
 *
 * Với chủ xe cá nhân, "gian hàng" và "con người" là MỘT: khách đang thuê xe của NGƯỜI ĐÓ. Nên mọi
 * thứ khách thấy đọc thẳng từ tài khoản chủ (`users`) — họ tên, SĐT ĐĂNG NHẬP, email đăng nhập, ảnh
 * đại diện. Một bộ thông tin, sửa ở một chỗ, và SĐT khách gọi là số ĐÃ QUA OTP chứ không phải một
 * số tự khai không ai kiểm.
 *
 * Chỉ lấy SĐT/email ĐÃ XÁC THỰC: chưa xác thực thì `null` (giao diện nói "chưa có"), không bao giờ
 * công bố một số mà nền tảng chưa chứng minh là của người đó.
 *
 * ## Mặt tiền GIAN HÀNG (tuyến gói) = bộ riêng của gian hàng
 *
 * `tenants.name/phone/email` + logo — một doanh nghiệp có tổng đài, tên thương hiệu, logo riêng.
 *
 * ## Vì sao suy lúc ĐỌC, không chép lúc chuyển tuyến
 *
 * Cột của gian hàng KHÔNG bị ghi đè khi về tuyến hoa hồng: chúng nằm yên, và lên gói lại là hiện
 * ra nguyên vẹn. Hết gói đổi tuyến ngay lúc `now >= endsAt + grace` (`resolveEffectiveBilling`) —
 * một job chép dữ liệu sẽ chạy sau đó tới cả giờ, và trong khoảng đó trang công khai nói sai.
 * Đọc theo tuyến thì không có khoảng hở nào, và không có gì để đồng bộ.
 */
export interface StorefrontShopIdentity {
  name: string;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
}

export interface StorefrontOwnerIdentity {
  displayName: string;
  /** Dạng lưu `84…` hoặc nội địa — trả ra luôn ở dạng nội địa `0…`. */
  phone: string | null;
  phoneVerified: boolean;
  email: string | null;
  emailVerified: boolean;
  avatarUrl: string | null;
}

export interface StorefrontIdentity {
  name: string;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export function storefrontIdentity(
  kind: StorefrontKind,
  shop: StorefrontShopIdentity,
  owner: StorefrontOwnerIdentity,
): StorefrontIdentity {
  if (kind === STOREFRONT_KIND.SHOP) {
    return { name: shop.name, phone: shop.phone, email: shop.email, avatarUrl: shop.logoUrl };
  }
  return {
    // Tên tài khoản không bao giờ rỗng ở DB, nhưng một chuỗi toàn dấu cách thì vẫn có thể.
    name: owner.displayName.trim() || shop.name,
    phone: owner.phone && owner.phoneVerified ? toLocalVnPhone(owner.phone) : null,
    email: owner.email && owner.emailVerified ? owner.email : null,
    avatarUrl: owner.avatarUrl,
  };
}

/**
 * Chỉ phần ẢNH của `storefrontIdentity` — cho chỗ chỉ có logo + avatar trong tay (thẻ xe, vỏ site
 * partner). CÙNG luật: mặt tiền cá nhân là ảnh đại diện của chủ, KHÔNG phải logo — logo là của mặt
 * tiền gian hàng, nằm yên khi hết gói và hiện lại khi lên gói.
 *
 * KHÔNG rơi về avatar cho mặt tiền GIAN HÀNG: một doanh nghiệp chưa có logo hiện chữ cái đầu là
 * bình thường, còn hiện ảnh chân dung của người đứng tên là trộn danh tính cá nhân vào một pháp
 * nhân.
 */
export function storefrontAvatarUrl(
  logoUrl: string | null | undefined,
  ownerAvatarUrl: string | null | undefined,
  kind: StorefrontKind,
): string | null {
  return kind === STOREFRONT_KIND.PERSONAL ? (ownerAvatarUrl ?? null) : (logoUrl ?? null);
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
