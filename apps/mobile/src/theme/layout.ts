import { space } from './tokens';

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
  screenX: space.md,
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
