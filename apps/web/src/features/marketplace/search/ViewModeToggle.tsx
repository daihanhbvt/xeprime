'use client';

import { useTranslations } from 'next-intl';
import { LineIcon } from '@/components/icons/LineIcon';
import { cx } from '@/lib/cx';
import { useViewMode } from '../hooks/use-view-mode';
import styles from './ViewModeToggle.module.css';

/**
 * Nút chuyển lưới / danh sách — Figma 19707:80489 › "Horizontal tabs - Home" (22230:32079): nằm
 * trong hàng viên lọc của hero (và thanh cố định), ngay sau "Bộ lọc". Chỉ desktop/tablet: điện
 * thoại luôn dựng thẻ lưới nên nút ẩn ở ≤640px.
 */
export function ViewModeToggle({ className }: { className?: string }) {
  const t = useTranslations('Marketplace.results');
  const [viewMode, setViewMode] = useViewMode();
  return (
    <div className={cx(styles.group, className)} role="group" aria-label={t('viewMode')}>
      <button
        type="button"
        className={cx(styles.btn, viewMode === 'grid' && styles.active)}
        onClick={() => setViewMode('grid')}
        title={t('viewGrid')}
        aria-label={t('viewGrid')}
        aria-pressed={viewMode === 'grid'}
      >
        <LineIcon name="category" />
      </button>
      <button
        type="button"
        className={cx(styles.btn, viewMode === 'list' && styles.active)}
        onClick={() => setViewMode('list')}
        title={t('viewList')}
        aria-label={t('viewList')}
        aria-pressed={viewMode === 'list'}
      >
        <LineIcon name="menu-list" />
      </button>
    </div>
  );
}
