'use client';

import { CalendarOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { RentalDateTimeRangeField } from '@/components/form/RentalDateTimeRangeField';
import { cx } from '@/lib/cx';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import { LocationPicker } from './LocationPicker';
import { QuickFilterPills } from './QuickFilterPills';
import { useSearchExperience } from './search-context';
import styles from './SearchHeroBanner.module.css';

interface SearchHeroBannerProps {
  onOpenFilterModal: () => void;
  appliedCount?: number;
}

export function SearchHeroBanner({
  onOpenFilterModal,
  appliedCount = 0,
}: SearchHeroBannerProps) {
  const t = useTranslations('Marketplace.results');
  const { filters, setFilters } = useMarketplaceFilters();
  const { draft, setRentalRange, setRentalMode } = useSearchExperience();

  const [keyword, setKeyword] = useState(filters.q ?? '');

  const handleSearchSubmit = () => {
    setFilters({ q: keyword.trim() || undefined });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearchSubmit();
    }
  };

  return (
    <section className={styles.banner} aria-label={t('bannerTitle')}>
      <div className={styles.inner}>
        <div className={styles.topRow}>
          <h1 className={styles.title}>{t('bannerTitle')}</h1>

          <div className={styles.searchBar}>
            <div className={styles.inputGroup}>
              <SearchOutlined className={styles.searchIcon} aria-hidden />
              <input
                type="text"
                className={styles.keywordInput}
                placeholder={t('keyword.placeholder')}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-label={t('keyword.ariaLabel')}
              />
            </div>

            <span className={styles.divider} aria-hidden />

            <div className={styles.locationWrap}>
              <LocationPicker variant="chip" />
            </div>

            <span className={styles.divider} aria-hidden />

            <div className={styles.dateWrap}>
              <RentalDateTimeRangeField
                value={draft.rental}
                onChange={setRentalRange}
                mode={draft.rental.mode}
                onModeChange={setRentalMode}
                prefix={<CalendarOutlined style={{ color: 'var(--xp-color-primary)' }} aria-hidden />}
                compactPoint
              />
            </div>

            <button
              type="button"
              className={styles.searchSubmitBtn}
              onClick={handleSearchSubmit}
              aria-label={t('title')}
            >
              <SearchOutlined />
            </button>
          </div>
        </div>

        <div className={styles.pillsRow}>
          <QuickFilterPills
            onOpenFilterModal={onOpenFilterModal}
            appliedCount={appliedCount}
          />
        </div>
      </div>
    </section>
  );
}
