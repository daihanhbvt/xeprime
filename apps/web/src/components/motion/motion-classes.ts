import { cx } from '@/lib/cx';
import styles from './motion.module.css';

/** Bậc trễ của trang mẫu (`data-wow-delay`), tính bằng mili-giây. */
export type MotionDelay = 100 | 200 | 400 | 600 | 900 | 1200;

const DELAY_CLASS: Record<MotionDelay, string | undefined> = {
  100: styles.delay100,
  200: styles.delay200,
  400: styles.delay400,
  600: styles.delay600,
  900: styles.delay900,
  1200: styles.delay1200,
};

export function motionDelayClass(delay: MotionDelay | undefined): string | undefined {
  return delay === undefined ? undefined : DELAY_CLASS[delay];
}

/**
 * Trượt lên + hiện dần (≈ `wow fadeInUp`). Chạy khi phần tử được vẽ; nằm trong một `Reveal` còn
 * chờ cuộn tới thì chờ cùng nó.
 */
export function enterClass(delay?: MotionDelay): string {
  return cx(styles.enter, motionDelayClass(delay));
}

/** Các phần tử CON trượt lên lần lượt, mỗi mục trễ thêm 0.2s (≈ `data-wow-delay` 0.2 · 0.4 · 0.6). */
export const staggerClass: string = styles.stagger ?? '';

/** So le nhanh (n × `--xp-motion-stagger-step`) cho lưới kết quả/danh sách dài — không chờ cuộn. */
export const staggerFastClass: string = styles.staggerFast ?? '';

/** Hiện dần tại chỗ khi nội dung đổi (gắn lại bằng `key`, hoặc panel vừa bỏ `hidden`). */
export const swapClass: string = styles.swap ?? '';

/** Lớp bắt buộc cho phần tử gắn `useReveal()` — không có nó thì trạng thái chờ không ẩn được gì. */
export const revealGateClass: string = styles.gate ?? '';

/**
 * Ảnh nền "thở" 1 → 1.08 → 1 trong 40s, lặp vô hạn (≈ `zoomEffect` của trang mẫu). Đặt lên khung
 * chứa ảnh, khung cha phải `overflow: hidden`; điểm neo do chỗ dùng đặt bằng `transform-origin`.
 */
export const kenBurnsClass: string = styles.kenBurns ?? '';

/**
 * Parallax ĐẦU TRANG theo cuộn: ảnh trôi chậm + phóng nhẹ + mờ dần (CSS `animation-timeline:
 * scroll()`, chỉ khi trình duyệt hỗ trợ). Khung cha phải `overflow: hidden`. Cộng dồn với
 * `kenBurnsClass` được (dùng `translate`/`scale` riêng, không đè `transform`).
 */
export const heroParallaxClass: string = styles.heroParallax ?? '';

/** Parallax GIỮA TRANG (`animation-timeline: view()`): ảnh trôi ngược chiều cuộn khi khung còn trong viewport. */
export const viewParallaxClass: string = styles.viewParallax ?? '';
