'use client';

import { PreviewImage, PreviewImageGroup } from '@/components/data-display/PreviewImage';
import styles from './ListingDetailView.module.css';

/**
 * Gallery của trang chi tiết listing — đảo client nhỏ trong trang server (SEO giữ nguyên).
 *
 * Ảnh chính + ảnh phụ vào chung MỘT trình xem toàn màn hình (đếm `x / y`, mũi tên chuyển,
 * zoom/xoay): bấm bất kỳ ảnh nào cũng mở đúng ảnh đó. Dùng lại nguyên class kích thước của
 * `ListingDetailView.module.css` nên bố cục không đổi.
 */
export function ListingGallery({
  name,
  mainImageUrl,
  images,
}: {
  name: string;
  mainImageUrl?: string | null;
  images: string[];
}) {
  return (
    <PreviewImageGroup>
      {mainImageUrl ? (
        <PreviewImage src={mainImageUrl} alt={name} className={styles.photo} />
      ) : (
        <div className={styles.placeholder} aria-hidden="true" />
      )}
      {images.length > 0 ? (
        <div className={styles.gallery}>
          {images.map((url) => (
            <PreviewImage key={url} src={url} alt={name} className={styles.thumb} />
          ))}
        </div>
      ) : null}
    </PreviewImageGroup>
  );
}
