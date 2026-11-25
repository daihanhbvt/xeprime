import Constants from 'expo-constants';
import { NARROW_SCREEN, space } from './tokens';

/**
 * App XePrime Partner dùng lề ngang HẸP hơn app khách (người dùng chốt 10/11/2026): màn quản lý
 * nhiều cột số liệu, bề ngang điện thoại đã chật nên mỗi dp đều quý. Nhận diện bằng `slug` của
 * cấu hình Expo thay vì `@/app-profile` - file đó kéo theo routes/deep link, nạp vào đây là vòng import.
 */
const PARTNER_APP = Constants.expoConfig?.slug === 'xeprime-partner';
// Feedback thiết kế 20/11/2026 ("padding 2 bên tối thiểu 16px", ghi đè chốt 10/11): Partner lề 16 mọi khổ.
const SCREEN_X = PARTNER_APP ? 16 : NARROW_SCREEN ? 12 : space.md;
/** Lề ngang thay cho `space.md` / `space.lg` viết tay: app khách giữ nguyên giá trị cũ, Partner hẹp hơn. */
const PAD_X = PARTNER_APP ? 16 : space.md;
const PAD_X_LG = PARTNER_APP ? (NARROW_SCREEN ? 12 : 16) : space.lg;
const CARD_PAD = PARTNER_APP ? (NARROW_SCREEN ? 10 : 12) : NARROW_SCREEN ? 12 : space.md;

/**
 * Nhịp bố cục của MỘT màn nội dung — lề ngang, khoảng giữa các khối, phần đè lên ảnh mở đầu.
 *
 * Có file này vì mỗi màn tự gõ `space.*` thì con số trôi ngay: trang chủ từng đè lên ảnh 32px
 * còn trang chi tiết 16px, lề đáy một bên 24 một bên 32 — không ai cố ý, chỉ là hai lần gõ khác
 * nhau. Ở đây thì đổi một chỗ, cả app theo.
 *
 * Ba tầng, và tầng trong LUÔN nhỏ hơn tầng ngoài để mắt tự gom đúng nhóm:
 *
 * ```
 * section        24   ← giữa các khối lớn, cũng là lề trên khối đầu và lề dưới trang
 *   block        16   ← trong một khối: tiêu đề ↔ nội dung
 *     inline      8   ← trong một dòng: nhãn ↔ giá trị, biểu tượng ↔ chữ
 * ```
 *
 * `space.*` vẫn dùng trực tiếp bên trong một component (lề của thẻ, khoảng giữa hai viên chip).
 * Bảng này chỉ dành cho khung của MÀN HÌNH.
 */
export const layout = {
  /** Lề trái/phải của mọi màn nội dung. */
  // Máy hẹp (< 380dp): lề 12 thay 16 — trả lại 8dp ngang cho chữ (người dùng chốt 28/10/2026).
  // Partner: 12 (máy hẹp 8) - xem `PARTNER_APP` ở trên.
  screenX: SCREEN_X,
  /** Đệm trong của thẻ — cùng luật máy hẹp với lề màn. */
  cardPad: CARD_PAD,
  /** Lề ngang nội bộ (thanh, tấm, chân màn) - thay `px={space.md}`; Partner 12 (hẹp 8), khách 16. */
  padX: PAD_X,
  /** Lề ngang rộng - thay `px={space.lg}`; Partner 16 (hẹp 12), khách 24. */
  padXLg: PAD_X_LG,
  /** Giữa các khối lớn. Cũng là lề trên khối đầu tiên và lề dưới cuối trang. */
  section: space.lg,
  /** Trong một khối: tiêu đề ↔ nội dung. */
  block: space.md,
  /** Trong một dòng: nhãn ↔ giá trị, biểu tượng ↔ chữ. */
  inline: space.sm,
  /**
   * Phần thân trang ĐÈ lên ảnh mở đầu.
   *
   * Bằng `section` chứ không phải một số riêng: chỗ đè này là khoảng cách giữa hai khối lớn
   * (ảnh và thân trang), chỉ là nó âm.
   */
  heroOverlap: space.lg,
} as const;

/**
 * Bề ngang TỐI ĐA của cột nội dung (dp) — máy tính bảng. Nâng 720 → 1024 (10/11/2026, người dùng
 * chọn "gần full màn hình", chia cột theo website) — bằng mép trên của dải tablet trên web.
 *
 * App vẽ cho điện thoại: rất nhiều khối tự tính cỡ theo bề ngang (banner, băng chuyền, ảnh xe,
 * lưới loại xe). Trên iPad 13" (1032dp dọc) chúng phình gấp ~2,5 lần — chữ banner khổng lồ, ảnh xe
 * cao nửa màn. Thay vì vẽ lại từng màn cho máy tính bảng, nội dung nằm trong MỘT cột giữa với trần
 * này (`ContentColumn` ở gốc app) và mọi khối đo theo cột (`useContentWidth`), không theo cửa sổ.
 *
 * Điện thoại (≤ 440dp) không bao giờ chạm trần ⇒ giao diện điện thoại giữ nguyên từng điểm ảnh.
 */
export const CONTENT_MAX_WIDTH = 1024;

/**
 * Từ bề ngang CỘT này trở lên là bố cục máy tính bảng — đúng mốc tablet của website
 * (`@media (min-width: 641px)`: ≤640 điện thoại, 641–1024 tablet). Mọi iPad dọc (mini 744 → 13"
 * 1032) rơi vào đây; điện thoại lớn nhất (~440) không bao giờ chạm.
 *
 * Ở bố cục này các khối đi theo bản tablet của website: băng chuyền hiện 2 thẻ một lượt, xe tiêu
 * biểu và địa điểm nổi bật thành lưới 2 cột, kết quả tìm xe 2 cột.
 */
export const TABLET_MIN_WIDTH = 641;

/**
 * Kiểu cho khung nổi trong `Modal` (tấm trượt, hộp thoại): `Modal` là cửa sổ RIÊNG của hệ điều
 * hành, nằm ngoài `ContentColumn`, nên tự căn giữa và tự chặn trần như cột.
 */
export const modalColumn = {
  width: '100%',
  maxWidth: CONTENT_MAX_WIDTH,
  alignSelf: 'center',
} as const;

/*
 * Hằng cũ của bố cục iPad bản nhánh (trước khi gộp `develop` 16/11/2026) - giữ cho code đang đọc
 * chúng, nay đứng trên cột gốc `ContentColumn` của `develop` (`CONTENT_MAX_WIDTH`).
 */

/** Cột RỘNG cho màn duyệt lưới - nằm trong cột gốc nên không vượt `CONTENT_MAX_WIDTH`. */
export const WIDE_CONTENT_MAX_WIDTH = CONTENT_MAX_WIDTH;

/** Từ bề rộng nội dung này trở lên lưới thẻ chia 3 cột. */
export const WIDE_CARD_MIN_WIDTH = 1000;

/** Bề rộng tối đa của form / thẻ đăng nhập trên màn rộng. */
export const FORM_MAX_WIDTH = 560;

/** Bề rộng tối đa của tấm trượt trên màn rộng - tấm trượt là một hộp thoại, không phải một trang. */
export const SHEET_MAX_WIDTH = 640;

/**
 * Lề ngang để nội dung nằm giữa khi rộng hơn `maxWidth`; điện thoại giữ `layout.screenX`.
 * `width` truyền vào là bề rộng CỘT (`useContentWidth`), không phải cửa sổ.
 */
export function contentGutter(width: number, maxWidth: number = CONTENT_MAX_WIDTH): number {
  return Math.max(layout.screenX, Math.round((width - maxWidth) / 2));
}
