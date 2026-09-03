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
