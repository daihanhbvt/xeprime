'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LineIcon } from '@/components/icons/LineIcon';
import { RentalDateTimeRangeField } from '@/components/form/RentalDateTimeRangeField';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import { cx } from '@/lib/cx';
import { LocationPicker } from './LocationPicker';
import { LongTermDateField, LongTermMonthsField } from './LongTermFields';
import { QuickFilterPills } from './QuickFilterPills';
import { useSearchExperience } from './search-context';
import { serviceUsesRentalRange } from './search-draft';
import { VehicleTypePicker } from './VehicleTypePicker';
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
  const tFilters = useTranslations('Marketplace.filterPanel');
  const { filters, setFilters } = useMarketplaceFilters();
  const { draft, setRentalRange, setRentalMode, setLongTerm } = useSearchExperience();
  /* Dài hạn không có khoảng nhận–trả (ADR 0011): ô thời gian là ngày nhận mong muốn + gói. */
  const usesRange = serviceUsesRentalRange(draft.serviceType);

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
              <LineIcon name="search" className={styles.searchIcon} />
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

            {/* Điện thoại (Figma MB 22185:115224): hàng 2 mở đầu bằng MỘT icon địa điểm vàng. */}
            <LineIcon name="location" className={styles.mobileRowIcon} />

            <div className={styles.vehicleTypeWrap}>
              <VehicleTypePicker variant="select" className={styles.inlinePicker} />
            </div>

            <span className={styles.divider} aria-hidden />

            <div className={styles.locationWrap}>
              <LocationPicker variant="chip" className={styles.inlinePicker} />
            </div>

            <span className={styles.divider} aria-hidden />

            {usesRange ? (
              <div className={styles.dateWrap}>
                <RentalDateTimeRangeField
                  value={draft.rental}
                  onChange={setRentalRange}
                  mode={draft.rental.mode}
                  onModeChange={setRentalMode}
                  prefix={<LineIcon name="calendar-2" className={styles.calendarIcon} />}
                  compactPoint
                  className={styles.inlinePicker}
                />
              </div>
            ) : (
              <div className={styles.longTermWrap}>
                <LongTermDateField
                  value={draft.longTerm}
                  onChange={setLongTerm}
                  withFromPrefix
                  prefix={<LineIcon name="calendar-2" className={styles.calendarIcon} />}
                  className={cx(styles.inlinePicker, styles.longTermDate)}
                />
                <span className={styles.divider} aria-hidden />
                <LongTermMonthsField
                  value={draft.longTerm}
                  onChange={setLongTerm}
                  suffix={<LineIcon name="chevron-down" className={styles.monthsCaret} />}
                  className={cx(styles.inlinePicker, styles.longTermMonths)}
                />
              </div>
            )}

            <button
              type="button"
              className={styles.searchSubmitBtn}
              onClick={handleSearchSubmit}
              aria-label={t('title')}
            >
              <LineIcon name="search" />
            </button>
          </div>

          {/* Điện thoại (Figma MB 20043:57771): nút lọc vuông chỉ có icon cạnh ô tìm kiếm. */}
          <button
            type="button"
            className={styles.mobileFilterBtn}
            onClick={onOpenFilterModal}
            aria-label={tFilters('title')}
          >
            <LineIcon name="filter" />
            {appliedCount > 0 ? <span className={styles.mobileFilterBadge}>{appliedCount}</span> : null}
          </button>
        </div>

        <div className={styles.pillsRow}>
          <QuickFilterPills
            onOpenFilterModal={onOpenFilterModal}
            appliedCount={appliedCount}
            showViewToggle
            filterButtonClassName={styles.pillsFilterBtn}
          />
        </div>
      </div>
    </section>
  );
}
