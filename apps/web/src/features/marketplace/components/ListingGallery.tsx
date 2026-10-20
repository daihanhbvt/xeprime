'use client';

import { PreviewImage, PreviewImageGroup } from '@/components/data-display/PreviewImage';
import styles from './ListingGallery.module.css';

/**
 * Gallery của trang chi tiết listing theo chuẩn Figma v2 (node 19707:83366):
 * - Khung rộng tối đa 1200px, cao 309px.
 * - Ảnh chính 650px bên trái.
 * - 2 cột thumbnail bên phải (mỗi cột 2 ảnh, tổng 4 ảnh nhỏ).
 * - Ô cuối cùng có overlay "+N" nếu tổng số ảnh > 5.
 * - Bấm vào bất kỳ ảnh nào đều mở chung lightbox xem toàn màn hình với tất cả các ảnh.
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
  // Tập hợp danh sách tất cả ảnh (ảnh chính + danh sách ảnh phụ không trùng lặp)
  const allImages = [
    ...(mainImageUrl ? [mainImageUrl] : []),
    ...images.filter((img) => img !== mainImageUrl),
  ];

  const primaryPhoto = allImages[0] ?? null;
  // 4 ảnh tiếp theo để lấp đầy 2 cột thumbnail
  const col1 = allImages.slice(1, 3);
  const col2 = allImages.slice(3, 5);
  const extraCount = allImages.length > 5 ? allImages.length - 5 : 0;

  return (
    <div className={styles.wrap}>
      <PreviewImageGroup>
        <div className={styles.galleryGrid}>
          {/* Ảnh chính lớn (650px x 309px) */}
          <div className={styles.mainPhotoWrapper}>
            {primaryPhoto ? (
              <PreviewImage src={primaryPhoto} alt={name} className={styles.mainPhoto} />
            ) : (
              <div className={styles.placeholder} aria-hidden="true" />
            )}
          </div>

          {/* Cột thumbnail 1 (2 ảnh) */}
          {col1.length > 0 ? (
            <div className={styles.thumbCol}>
              {col1.map((url, idx) => (
                <div key={url || idx} className={styles.thumbItem}>
                  <PreviewImage src={url} alt={`${name} - ${idx + 2}`} className={styles.thumbImg} />
                </div>
              ))}
              {/* Nếu chỉ có 1 ảnh ở cột 1, tạo placeholder cho cân bằng */}
              {col1.length === 1 && col2.length === 0 ? (
                <div className={styles.thumbItem}>
                  <div className={styles.placeholder} aria-hidden="true" />
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Cột thumbnail 2 (2 ảnh, ảnh cuối có overlay +N nếu còn ảnh) */}
          {col2.length > 0 ? (
            <div className={styles.thumbCol}>
              {col2.map((url, idx) => {
                const isLastVisible = idx === col2.length - 1;
                const showOverlay = isLastVisible && extraCount > 0;
                return (
                  <div key={url || idx} className={styles.thumbItem}>
                    <PreviewImage
                      src={url}
                      alt={`${name} - ${idx + 4}`}
                      className={styles.thumbImg}
                    />
                    {showOverlay ? (
                      <div className={styles.overlay}>
                        <span>+{extraCount}</span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Ẩn các ảnh còn lại trong DOM để PreviewImageGroup vẫn duyệt qua được */}
          {allImages.slice(5).map((url, idx) => (
            <div key={url} style={{ display: 'none' }}>
              <PreviewImage src={url} alt={`${name} - ${idx + 6}`} />
            </div>
          ))}
        </div>
      </PreviewImageGroup>
    </div>
  );
}
