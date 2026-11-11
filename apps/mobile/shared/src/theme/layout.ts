import { NARROW_SCREEN, space } from './tokens';

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
  screenX: NARROW_SCREEN ? 12 : space.md,
  /** Đệm trong của thẻ — cùng luật máy hẹp với lề màn. */
  cardPad: NARROW_SCREEN ? 12 : space.md,
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
