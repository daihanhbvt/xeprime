'use client';

import { ShareAltOutlined } from '@ant-design/icons';
import styles from './ListingDetailView.module.css';

/**
 * Nút Chia sẻ & Yêu thích trên header trang chi tiết xe — Client Component
 * để cô lập icon AntD (cần React context) khỏi Server Component ListingDetailView.
 */
export function ListingHeaderActions() {
  const handleShare = () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({
        title: document.title,
        url: window.location.href,
      }).catch(() => {});
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
    }
  };

  return (
    <div className={styles.actionIcons}>
      <button
        type="button"
        className={styles.actionBtn}
        aria-label="Chia sẻ xe"
        title="Chia sẻ"
        onClick={handleShare}
      >
        <ShareAltOutlined />
      </button>
      {/* Chức năng thả tym tạm đóng theo yêu cầu */}
    </div>
  );
}

