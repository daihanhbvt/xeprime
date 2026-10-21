'use client';

import { CalendarOutlined, SearchOutlined } from '@ant-design/icons';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useCallback } from 'react';
import { RentalDateTimeRangeField } from '@/components/form/RentalDateTimeRangeField';
import { APP_NAME } from '@/constants/app-name';
import { ROUTES } from '@/constants/routes';
import { cx } from '@/lib/cx';
import { useTheme } from '@/lib/theme';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import { LocationPicker } from './LocationPicker';
import { QuickFilterPills } from './QuickFilterPills';
import { useSearchExperience } from './search-context';
import { VehicleTypePicker } from './VehicleTypePicker';
import styles from './StickySearchHeader.module.css';

interface StickySearchHeaderProps {
  onOpenFilterModal: () => void;
  appliedCount?: number;
}

export function StickySearchHeader({
  onOpenFilterModal,
  appliedCount = 0,
}: StickySearchHeaderProps) {
  const t = useTranslations('Marketplace.results');
  const { filters, setFilters } = useMarketplaceFilters();
  const { draft, setRentalRange, setRentalMode } = useSearchExperience();
  const { theme } = useTheme();

  const [keyword, setKeyword] = useState(filters.q ?? '');
  const [isScrolled, setIsScrolled] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const popupContainer = useCallback(() => containerRef.current ?? document.body, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 140);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSearchSubmit = () => {
    setFilters({ q: keyword.trim() || undefined });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearchSubmit();
    }
  };

  const logoSrc = theme === 'dark' ? '/home/logo-gold-dark.svg' : '/home/logo-gold.svg';

  return (
    <div
      ref={containerRef}
      className={cx(styles.stickyHeader, isScrolled && styles.stickyHeaderActive)}
      aria-hidden={!isScrolled}
    >
      <div className={styles.inner}>
        <div className={styles.topRow}>
          <Link href={ROUTES.HOME} className={styles.logoLink} aria-label={APP_NAME}>
            <Image
              src={logoSrc}
              alt="XePrime"
              width={120}
              height={38}
              priority
              unoptimized
              className={styles.logo}
            />
          </Link>

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

            <div className={styles.vehicleTypeWrap}>
              <VehicleTypePicker />
            </div>

            <span className={styles.divider} aria-hidden />

            <div className={styles.locationWrap}>
              <LocationPicker variant="chip" popupContainer={popupContainer} />
            </div>

            <span className={styles.divider} aria-hidden />

            <div className={styles.dateWrap}>
              <RentalDateTimeRangeField
                value={draft.rental}
                onChange={setRentalRange}
                mode={draft.rental.mode}
                onModeChange={setRentalMode}
                prefix={<CalendarOutlined className={styles.calendarIcon} aria-hidden />}
                compactPoint
                getPopupContainer={popupContainer}
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

        <div className={styles.bottomRow}>
          <QuickFilterPills
            onOpenFilterModal={onOpenFilterModal}
            appliedCount={appliedCount}
            popupContainer={popupContainer}
          />
        </div>
      </div>
    </div>
  );
}
