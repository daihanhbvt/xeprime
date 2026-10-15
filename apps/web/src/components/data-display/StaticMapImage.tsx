'use client';

import { useState } from 'react';
import styles from './StaticMapImage.module.css';

/**
 * Bản đồ để XEM — một tấm ẢNH tĩnh do API vẽ hộ (ADR 0061 điều 1), không kéo, không phóng.
 *
 * Không có thư viện bản đồ, không có key trong bundle: `src` trỏ vào một endpoint của API, nơi
 * services key nằm và nơi ảnh được cache theo điểm. Nhờ vậy mỗi điểm chỉ tốn một lượt tính tiền,
 * bất kể bao nhiêu người mở trang.
 *
 * Client component chỉ vì một việc: ẢNH LỖI THÌ ẨN HẲN (chưa cấu hình bản đồ, nhà cung cấp hỏng,
 * chi nhánh chưa có toạ độ — API trả 404). Một khung ảnh vỡ tệ hơn không có khung nào; địa chỉ chữ
 * và liên kết "Mở bằng Google Maps" ở khối bao ngoài vẫn còn.
 *
 * Chiều cao khung là biến CSS `--static-map-height` (mặc định 220px), đặt ở CSS Module của nơi gọi
 * qua `className` hoặc một khối bao — không phải prop số đi qua `style`.
 */
export function StaticMapImage({
  src,
  alt,
  className,
}: {
  src: string;
  /** Bắt buộc: đây là nội dung duy nhất trình đọc màn hình có được về tấm bản đồ. */
  alt: string;
  className?: string;
}) {
  // Lỗi gắn với ĐÚNG `src` đã hỏng: đổi sang điểm khác (URL khác) thì thử lại từ đầu.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) return null;
  return (
    /*
     * `<img>` trần chứ không `next/image`: ảnh đã đúng cỡ từ API, và đi vòng qua `/_next/image` là
     * thêm một bản sao + một lượt tải nữa cho một ảnh trình duyệt đã được phép giữ một ngày.
     */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className ? `${styles.image} ${className}` : styles.image}
      src={src}
      alt={alt}
      // Bản đồ hầu như luôn nằm dưới màn hình đầu: không tải (và không tốn lượt vẽ nào) cho tới khi
      // người xem cuộn gần tới.
      loading="lazy"
      /*
       * Ảnh do server render có thể hỏng TRƯỚC khi React gắn `onError` (hydrate muộn), và sự kiện
       * đó không được phát lại. Ref chạy lúc gắn: ảnh đã tải xong mà không có điểm ảnh nào là ảnh hỏng.
       */
      ref={(img) => {
        if (img?.complete && img.naturalWidth === 0) setFailedSrc(src);
      }}
      onError={() => setFailedSrc(src)}
    />
  );
}
