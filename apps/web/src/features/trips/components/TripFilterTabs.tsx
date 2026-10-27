'use client';

import { useTranslations } from 'next-intl';
import { useRef, type KeyboardEvent } from 'react';
import { CUSTOMER_TRIP_FILTER_VALUES, type CustomerTripFilter } from '@xeprime/types';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import type { CustomerTripCounts } from '../types';
import styles from './TripFilterTabs.module.css';

/**
 * Bộ chuyển "Chuyến hiện tại / Lịch sử chuyến đi" ở góc phải đầu thẻ "Chuyến của tôi" — Figma
 * "Horizontal tabs" (`19879:71821`): khay xám bo 12, tab đang mở là ô trắng viền vàng nhạt, chữ vàng,
 * mỗi tab kèm số chuyến trong một viên tròn.
 *
 * Tab sống trên URL (`useTripListUrl`, ADR 0004) — component chỉ báo lên lựa chọn. Số trên tab là
 * `counts` của CÙNG lượt đọc danh sách (server đếm); chưa có thì không vẽ viên số, không vẽ `0`.
 *
 * Ngữ nghĩa là một `tablist` thật: mũi tên trái/phải chuyển tab, chỉ tab đang mở nằm trong vòng Tab.
 */
export function TripFilterTabs({
  filter,
  counts,
  onChange,
}: {
  filter: CustomerTripFilter;
  counts: CustomerTripCounts | undefined;
  onChange: (next: CustomerTripFilter) => void;
}) {
  const t = useTranslations('Trips.list');
  const dl = useDomainLabel();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const total = CUSTOMER_TRIP_FILTER_VALUES.length;
    const nextIndex = (index + step + total) % total;
    const next = CUSTOMER_TRIP_FILTER_VALUES[nextIndex];
    if (!next) return;
    refs.current[nextIndex]?.focus();
    onChange(next);
  }

  return (
    <div className={styles.tabs} role="tablist" aria-label={t('tabsLabel')}>
      {CUSTOMER_TRIP_FILTER_VALUES.map((key, index) => {
        const active = key === filter;
        const label = dl('customerTripFilter', key);
        const count = counts?.[key];
        return (
          <button
            key={key}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            /* Tên đọc lên gồm cả số — viên số chỉ là hình. */
            aria-label={count === undefined ? label : t('tabLabel', { label, count })}
            className={cx(styles.tab, active && styles.active)}
            onClick={() => {
              if (!active) onChange(key);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span>{label}</span>
            {count === undefined ? null : (
              <span className={styles.count} aria-hidden="true">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
