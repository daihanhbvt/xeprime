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

/**
 * Parallax cho DẢI ẢNH giữa trang theo vị trí của chính khối (`view()` + `animation-range: entry →
 * exit`): ảnh trôi chậm hơn nội dung, phóng/thu và mờ dần khi cuộn qua — như banner đầu trang. Đặt
 * lên lớp ảnh nền; khung cha phải `overflow: hidden`. Ảnh tự dư mép (scale sẵn ≥ 1.16).
 */
export const sectionParallaxClass: string = styles.sectionParallax ?? '';

/** Minh hoạ trôi lên xuống nhẹ, lặp vô hạn — cho biểu tượng của trạng thái rỗng/lỗi. */
export const floatClass: string = styles.float ?? '';

/** Chấm nhịp đập (màu = `currentColor`) đặt trước nhãn của trạng thái đang CHỜ. */
export const pulseDotClass: string = styles.pulseDot ?? '';

/**
 * Phạm vi phản hồi của site khách: ô lỗi lắc nhẹ + viền chuyển màu mượt, toast AntD trượt + nảy
 * (thành công: icon bật; lỗi: lắc). Đặt MỘT lần ở khung layout của site.
 */
export const feedbackScopeClass: string = styles.feedbackScope ?? '';

/** Gán `--seq-index` cho từng CON theo vị trí — các lớp so le bên dưới đọc nó để trễ lần lượt. */
export const seqClass: string = styles.seq ?? '';
/** Trượt vào từ trái (hoặc phải) + hiện dần, rồi trôi nhẹ ±4px lặp — ảnh xe "Loại xe". */
export const slideInLeftClass: string = styles.slideInLeft ?? '';
export const slideInRightClass: string = styles.slideInRight ?? '';
/** Ken Burns chậm 1 → 1.06 trong 12s, đi rồi về. Khung cha phải cắt tràn. */
export const kenBurnsSlowClass: string = styles.kenBurnsSlow ?? '';
/** Bật ra 0.8 → 1 với đường cong nảy, trễ theo `--seq-index`. */
export const popInClass: string = styles.popIn ?? '';
/** Nảy vào (icon tròn), trễ theo `--seq-index`. */
export const bounceInClass: string = styles.bounceIn ?? '';
/** Nhúc nhích ngang nhẹ lặp vô hạn — mũi tên chỉ hướng. */
export const nudgeXClass: string = styles.nudgeX ?? '';
/** Sao sáng + bật lần lượt, trễ theo `--seq-index`. */
export const starPopClass: string = styles.starPop ?? '';
/** Vệt sáng quét định kỳ qua một nút không phải `CtaButton` (cùng vệt với `.gradient`). */
export const shineClass: string = styles.shine ?? '';

/**
 * Từng CON của khung hiện dần khi cuộn tới (CSS `view()`), dùng cùng `staggerFastClass` được. Cho
 * danh sách dài (kết quả tìm kiếm, chuyến của tôi) - không cần bọc `Reveal` từng thẻ.
 */
export const viewEnterClass: string = styles.viewEnter ?? '';
