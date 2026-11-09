import { XP_TOKENS } from '@xeprime/ui';

/**
 * Thời lượng chuyển động dùng chung — gom một chỗ để các màn không mỗi màn một tốc độ.
 */
export const duration = {
  /** Đổi trạng thái tại chỗ: nhấn, đổi tab. */
  fast: 150,
  /** Mặc định: đẩy/lui giữa các màn. */
  base: 260,
  /** Bề mặt lớn trồi lên: sheet, modal. */
  slow: 320,
  /** Một nhịp thở của khung chờ (đi và về là 1600ms). */
  pulse: 800,
} as const;

export const dwell = {
  toast: 3200,
  toastError: 5000,
} as const;

/**
 * Nhịp bắn sự kiện cuộn của `ScrollView`/`FlatList`, tính bằng mili-giây.
 *
 * Header co giãn theo cuộn cần `frame`; hiệu ứng thưa hơn (ảnh mở đầu trôi) dùng `half` để rẻ đi
 * một nửa số lần React phải chạy.
 */
export const scrollThrottle = {
  /** Mỗi khung hình ở 60fps. */
  frame: 16,
  /** Nửa nhịp — mỗi khung hình ở 30fps. */
  half: 32,
} as const;

export const easing = {
  /** Bezier chuẩn Material — vào nhanh, ra chậm. */
  standard: [0.2, 0, 0, 1] as const,
} as const;

/*
 * ─── Chuyển động dùng chung với web (06/11/2026) ──────────────────────────────────────────
 * Độ co và thời lượng đọc từ `XP_TOKENS` (`@xeprime/ui`) — cùng nguồn với `tokens.css` của web.
 * Lò xo là khái niệm chỉ có ở native (Reanimated `withSpring`) nên sống ở đây.
 */

/** Token thời lượng CSS (`'0.24s'` / `'120ms'`) → mili-giây cho Reanimated. */
function toMs(value: string): number {
  const n = Number.parseFloat(value);
  return value.trim().endsWith('ms') ? n : Math.round(n * 1000);
}

/** Độ co khi nhấn nút/thẻ. */
export const pressScale = {
  /** Thẻ, nút lớn. */
  card: Number.parseFloat(XP_TOKENS['motion-scale-press']),
  /** Icon, mục thanh tab. */
  icon: Number.parseFloat(XP_TOKENS['motion-scale-press-icon']),
} as const;

/** Cấu hình lò xo Reanimated (`withSpring`). */
export const spring = {
  /** Phản hồi nhấn — dứt khoát, gần như không dao động. */
  press: { damping: 20, stiffness: 320, mass: 0.6 },
  /** Bề mặt trồi lên (sheet, modal) — êm, hơi lún ở cuối. */
  sheet: { damping: 22, stiffness: 190, mass: 0.9 },
  /** Nảy nhẹ (icon tab vừa chọn). */
  pop: { damping: 9, stiffness: 260, mass: 0.6 },
} as const;

/** Thời lượng theo token chung, mili-giây. */
export const motionMs = {
  /** Nút lún xuống khi nhấn. */
  press: toMs(XP_TOKENS['motion-duration-press']),
  /** Bề mặt/bước vào-ra (modal, chuyển bước luồng đặt xe). */
  overlay: toMs(XP_TOKENS['motion-duration-overlay']),
  /** Bước so le giữa các mục danh sách. */
  staggerStep: toMs(XP_TOKENS['motion-stagger-step']),
  /** Một lượt quét shimmer của khung chờ. */
  shimmer: toMs(XP_TOKENS['motion-duration-shimmer']),
  /** Số tiền đếm tới giá trị mới. */
  countUp: toMs(XP_TOKENS['motion-duration-count-up']),
} as const;
