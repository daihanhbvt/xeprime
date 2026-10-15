'use client';

import { useState, type CSSProperties } from 'react';
import styles from './StaticMapImage.module.css';

/**
 * Bản đồ để XEM — một tấm ẢNH tĩnh do API vẽ hộ (ADR 0061 điều 1), không kéo, không phóng.
 *
 * Không có thư viện bản đồ, không có key trong bundle: `src` trỏ vào một endpoint của API, nơi
 * services key nằm và nơi ảnh được cache theo chi nhánh. Nhờ vậy mỗi chi nhánh chỉ tốn một lượt
 * tính tiền, bất kể bao nhiêu người mở trang.
 *
 * Client component chỉ vì một việc: ẢNH LỖI THÌ ẨN HẲN (chưa cấu hình bản đồ, nhà cung cấp hỏng,
 * chi nhánh chưa có toạ độ — API trả 404). Một khung ảnh vỡ tệ hơn không có khung nào; địa chỉ chữ
 * và liên kết "Mở bằng Google Maps" ở khối bao ngoài vẫn còn.
 */
export function StaticMapImage({
  src,
  alt,
  height = 220,
}: {
  src: string;
  /** Bắt buộc: đây là nội dung duy nhất trình đọc màn hình có được về tấm bản đồ. */
  alt: string;
  height?: number;
}) {
  // Lỗi gắn với ĐÚNG `src` đã hỏng: đổi sang chi nhánh khác (URL khác) thì thử lại từ đầu.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) return null;
  return (
    /*
     * `<img>` trần chứ không `next/image`: ảnh đã đúng cỡ từ API, và đi vòng qua `/_next/image` là
     * thêm một bản sao + một lượt tải nữa cho một ảnh trình duyệt đã được phép giữ một ngày.
     */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={styles.image}
      // Chiều cao là giá trị chỉ biết ở nơi gọi — đúng ngoại lệ CSS custom property của ADR 0003.
      style={{ '--xp-map-height': `${height}px` } as CSSProperties}
      src={src}
      alt={alt}
      // Bản đồ hầu như luôn nằm dưới màn hình đầu: không tải (và không tốn lượt vẽ nào) cho tới khi
      // người xem cuộn gần tới.
      loading="lazy"
      // Tỉ lệ nội tại của ảnh API trả (800×400) — trình duyệt chừa sẵn chỗ, trang không nhảy.
      width={800}
      height={400}
      onError={() => setFailedSrc(src)}
    />
  );
}
