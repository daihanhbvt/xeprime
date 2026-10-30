import { BANNER_PLACEMENT, type BannerPlacement } from '@xeprime/types';

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
 * Ba slot, ba tỉ lệ (không dùng chung một tỉ lệ vì mỗi dải màn hình trình bày banner khác nhau):
 *   PC 1440×450 (3.2:1) · tablet 1024×450 (~2.28:1) · mobile 780×450 (~1.73:1) — cùng cao 450,
 *   bề rộng theo dải màn hình (đổi 30/10/2026, trước là 1440×300 · 1024×320 · 780×390).
 *
 * Banner tự mang thông điệp — trang chủ KHÔNG đặt chữ nào đè lên ảnh (quyết định 16/10/2026, giữ
 * khổ dải banner cũ khi ráp design v2). Thẻ tìm kiếm desktop đè lên phần dưới ảnh PC.
 * Nên upload ảnh @2x cùng tỉ lệ (PC 2880×900…) cho màn retina — validate chỉ so TỈ LỆ.
 *
 * Tên slot và mọi câu chữ nằm ở namespace `AdminBanners` — file này chỉ giữ SỐ ĐO.
 */
export const BANNER_SLOTS = {
  desktop: { width: 1440, height: 450 },
  tablet: { width: 1024, height: 450 },
  mobile: { width: 780, height: 450 },
} as const;

export type BannerSlot = keyof typeof BANNER_SLOTS;

interface BannerSize {
  width: number;
  height: number;
}

/**
 * Banner KHUYẾN MÃI giữa trang chủ (`placement = promo`): ô 584×180 của bản vẽ, upload @2x. Ảnh
 * mobile tuỳ chọn, khung cao hơn để chữ trong ảnh còn đọc được trên thẻ slider ~270px; bỏ trống
 * thì mobile hiện ảnh máy tính nguyên khung. Không có slot tablet: tablet hiện hai banner một hàng
 * như desktop.
 */
export const PROMO_BANNER_SLOTS = {
  desktop: { width: 1168, height: 360 },
  mobile: { width: 680, height: 400 },
} as const;

/** Bộ khổ ảnh của một vị trí — `desktop` luôn có, `tablet`/`mobile` tuỳ vị trí. */
export type BannerSlotSizes = { desktop: BannerSize } & Partial<Record<BannerSlot, BannerSize>>;

export function bannerSlotsFor(placement: BannerPlacement): BannerSlotSizes {
  return placement === BANNER_PLACEMENT.PROMO ? PROMO_BANNER_SLOTS : BANNER_SLOTS;
}

/**
 * Cỡ ảnh dạng "1440×450" để truyền vào message ICU như một CHUỖI. Truyền số thì next-intl nhóm
 * hàng nghìn theo ngôn ngữ ("1.440" / "1,440") — đúng cho tiền, sai cho số pixel.
 */
export function formatBannerSize({ width, height }: BannerSize, scale = 1): string {
  return `${width * scale}×${height * scale}`;
}

/** Dung sai tỉ lệ ±6% — đủ cho ảnh export lệch vài pixel, vẫn chặn nhầm dải màn hình (1.73 · 2.28 · 3.2). */
const RATIO_TOLERANCE = 0.06;

/** Vì sao một file bị chặn — component tự dịch thành câu theo ngôn ngữ đang dùng. */
export type BannerRatioIssue =
  | { kind: 'unreadable' }
  | { kind: 'ratio'; slot: BannerSlot; expected: BannerSize; actual: BannerSize };

/** Đọc kích thước thật của file ảnh — decode trong trình duyệt, không tin tên file. */
async function readImageSize(file: File): Promise<BannerSize | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/** Đo file theo tỉ lệ chuẩn `expected` của slot — `null` là đạt. */
export async function checkBannerRatio(
  slot: BannerSlot,
  expected: BannerSize,
  file: File,
): Promise<BannerRatioIssue | null> {
  const ratio = expected.width / expected.height;
  const size = await readImageSize(file);
  if (!size) return { kind: 'unreadable' };
  const actual = size.width / size.height;
  if (Math.abs(actual - ratio) / ratio > RATIO_TOLERANCE) {
    return { kind: 'ratio', slot, expected, actual: size };
  }
  return null;
}

/**
 * Validator tỉ lệ cho một slot — cắm vào `ImageUploadField.validate`. `describe` biến lý do thành
 * thông báo (kèm cỡ chuẩn để admin biết phải export lại ảnh thế nào); đạt thì trả null.
 */
export function bannerRatioValidator(
  slot: BannerSlot,
  expected: BannerSize,
  describe: (issue: BannerRatioIssue) => string,
): (file: File) => Promise<string | null> {
  return async (file) => {
    const issue = await checkBannerRatio(slot, expected, file);
    return issue ? describe(issue) : null;
  };
}
