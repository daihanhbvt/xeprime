import styles from './EmbedMap.module.css';

/**
 * Bản đồ xem-được, nhúng bằng `<iframe>` (Google Maps Embed API).
 *
 * KHÔNG phải client component: chỉ là HTML tĩnh, nên nó chạy được cả trong Server Component của
 * trang xe lẫn bên trong client island của luồng đặt xe — không kéo thêm một byte JavaScript
 * nào vào bundle.
 *
 * `src` do `lib/map-embed.ts` dựng và đã trả `null` khi thiếu key hoặc toạ độ hỏng. Ở đây nhận
 * `null` là hợp lệ và render ra không gì cả: một khung bản đồ vỡ tệ hơn hẳn việc không có khung
 * nào — phần thông tin thật (địa chỉ, quãng đường) vẫn nằm ở khối bao ngoài.
 */
export function EmbedMap({
  src,
  title,
  height = 220,
}: {
  src: string | null;
  /** Bắt buộc: đây là nội dung duy nhất trình đọc màn hình có được về khung bản đồ. */
  title: string;
  height?: number;
}) {
  if (!src) return null;
  return (
    <iframe
      className={styles.frame}
      // Chiều cao là giá trị chỉ biết ở nơi gọi — đúng ngoại lệ CSS custom property của ADR 0003.
      style={{ '--xp-map-height': `${height}px` } as React.CSSProperties}
      src={src}
      title={title}
      // `lazy`: bản đồ hầu như luôn nằm dưới màn hình đầu, không đáng chặn tải trang.
      loading="lazy"
      // Không cần quyền gì: bản đồ ở đây chỉ hiển thị, không hỏi vị trí người dùng.
      referrerPolicy="no-referrer-when-downgrade"
      allowFullScreen={false}
    />
  );
}
