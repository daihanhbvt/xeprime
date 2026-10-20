'use client';

import { ShareAltOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import styles from './ListingDetailView.module.css';

/**
 * Nút Chia sẻ & Yêu thích trên header trang chi tiết xe — Client Component
 * để cô lập icon AntD (cần React context) khỏi Server Component ListingDetailView.
 */
export function ListingHeaderActions() {
  const t = useTranslations('Listings.detail.share');
  const handleShare = () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator
        .share({
          title: document.title,
          url: window.location.href,
        })
        .catch(() => {});
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
    }
  };

  return (
    <div className={styles.actionIcons}>
      <button
        type="button"
        className={styles.actionBtn}
        aria-label={t('label')}
        title={t('title')}
        onClick={handleShare}
      >
        <ShareAltOutlined aria-hidden="true" />
      </button>
      {/* Chức năng thả tym tạm đóng theo yêu cầu */}
    </div>
  );
}
