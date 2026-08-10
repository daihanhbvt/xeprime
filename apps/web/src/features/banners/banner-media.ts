/**
 * Hợp đồng KÍCH THƯỚC banner — lời giải cho bài "nhiều màn hình, ảnh không hiển thị đủ tốt".
 *
 * Nguyên lý: ảnh chỉ hiển thị hoàn hảo khi TỈ LỆ KHUNG CHỨA = TỈ LỆ ẢNH. Vậy nên chốt ba tỉ lệ
 * chuẩn (một cho mỗi dải màn hình), rồi ép CẢ HAI ĐẦU về đúng nó:
 *   - khung carousel dùng `aspect-ratio` đúng tỉ lệ chuẩn của breakpoint (CSS trong
 *     `BannerCarousel.module.css`) → bề rộng nào trong dải cũng chỉ SCALE, không crop;
 *   - form admin ĐO ảnh thật lúc upload, lệch tỉ lệ quá dung sai là chặn kèm cỡ chuẩn — ảnh sai
 *     không bao giờ lọt vào hệ thống rồi mới vỡ ngoài trang chủ.
 *
 * Ba slot, ba tỉ lệ (không dùng chung một tỉ lệ vì màn nhỏ cần banner CAO hơn tương đối,
 * banner 4.8:1 trên màn 390px chỉ cao 81px — không đọc nổi chữ):
 *   PC 1440×300 (4.8:1) · tablet 1024×320 (3.2:1) · mobile 780×390 (2:1).
 * Nên upload ảnh @2x cùng tỉ lệ (2880×600…) cho màn retina — validate chỉ so TỈ LỆ.
 */
export const BANNER_SLOTS = {
  desktop: { label: 'PC', width: 1440, height: 300 },
  tablet: { label: 'Tablet', width: 1024, height: 320 },
  mobile: { label: 'Mobile', width: 780, height: 390 },
} as const;

export type BannerSlot = keyof typeof BANNER_SLOTS;

/** Dung sai tỉ lệ ±6% — đủ cho ảnh export lệch vài pixel, vẫn chặn nhầm slot (2:1 vs 4.8:1). */
const RATIO_TOLERANCE = 0.06;

/** Đọc kích thước thật của file ảnh — decode trong trình duyệt, không tin tên file. */
async function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/**
 * Validator tỉ lệ cho một slot — cắm vào `ImageUploadField.validate`. Trả thông báo lỗi kèm cỡ
 * chuẩn để admin biết phải export lại ảnh thế nào, hoặc null nếu đạt.
 */
export function bannerRatioValidator(slot: BannerSlot): (file: File) => Promise<string | null> {
  const { label, width, height } = BANNER_SLOTS[slot];
  const expected = width / height;
  return async (file) => {
    const size = await readImageSize(file);
    if (!size) return 'Không đọc được file ảnh — file có thể bị hỏng';
    const actual = size.width / size.height;
    if (Math.abs(actual - expected) / expected > RATIO_TOLERANCE) {
      return `Ảnh ${label} phải theo tỉ lệ ${width}×${height} (ảnh đang ${size.width}×${size.height}). Xuất đúng cỡ hoặc @2x (${width * 2}×${height * 2}).`;
    }
    return null;
  };
}
