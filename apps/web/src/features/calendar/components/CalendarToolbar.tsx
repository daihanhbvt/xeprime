'use client';

import { Button, Segmented, Select, Tooltip } from 'antd';
import {
  ArrowLeftOutlined,
  LeftOutlined,
  RightOutlined,
  SortAscendingOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { VEHICLE_TYPE } from '@xeprime/types';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { AutoSearchInput } from '@/components/filter/AutoSearchInput';
import { isSafeNextPath } from '@/features/auth/safe-next';
import { CALENDAR_BACK_PARAM } from '@/features/vehicles/calendar-link';
import { useIsMobile } from '@/hooks/use-media-query';
import { APP_TIME_ZONE, dayjs } from '@/lib/datetime';
import { CALENDAR_SORT_VALUES, useCalendarFilters } from '../hooks/use-calendar-filters';
import type { CalendarSort } from '../types/calendar.types';
import { todayIsoDate } from '../utils/calendar-date.util';
import styles from './CalendarToolbar.module.css';

const ALL = 'all';

/**
 * Thanh công cụ lịch: tìm xe · loại xe · khoảng xem (7/14/30) · điều hướng khoảng ± / hôm nay ·
 * nhãn khoảng đang xem. Chi nhánh KHÔNG ở đây — bộ chọn chi nhánh của shell đã scope toàn cổng.
 *
 * Mobile bỏ lựa chọn 30 ngày: 30 cột × 52px không đọc nổi trên 390px — 7/14 ngày + cuộn ngang
 * là đủ. Filter sống ở URL (ADR 0004) nên mọi nút chỉ là `setFilters`.
 */
export function CalendarToolbar() {
  const { filters, setFilters } = useCalendarFilters();
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const tCommon = useTranslations('Common');
  const t = useTranslations('Calendar');
  const domainLabel = useDomainLabel();

  /*
   * Đường quay lại chỗ vừa đi ra (hộp thư yêu cầu thuê, hồ sơ xe…). Chỉ hiện khi người dùng
   * THẬT SỰ tới đây từ một màn khác — vào lịch trực tiếp thì không có nút thừa.
   *
   * Kiểm bằng `isSafeNextPath` như `?next=` của luồng đăng nhập: giá trị này thành `href`, nên
   * một đường dẫn ngoài miền lọt vào đây là một lỗ open-redirect.
   */
  const backParam = searchParams.get(CALENDAR_BACK_PARAM);
  const backHref = isSafeNextPath(backParam) ? backParam : null;

  const start = dayjs.tz(filters.from, APP_TIME_ZONE);
  const end = start.add(filters.days - 1, 'day');
  const rangeLabel = start.isSame(end, 'year')
    ? `${start.format('DD/MM')} – ${end.format('DD/MM/YYYY')}`
    : `${start.format('DD/MM/YYYY')} – ${end.format('DD/MM/YYYY')}`;

  const shift = (direction: 1 | -1) =>
    setFilters({ from: start.add(direction * filters.days, 'day').format('YYYY-MM-DD') });

  // Mobile: thêm khoảng 3 ngày (ô rất rộng, xem cận cảnh) và bỏ 30 ngày (không đọc nổi ở 390px).
  const dayOptions = (isMobile ? [3, 7, 14] : [7, 14, 30]).map((value) => ({
    label: t('toolbar.dayRange', { count: value }),
    value,
  }));

  return (
    <div className={styles.toolbar}>
      <div className={styles.filters}>
        {backHref ? (
          <Link href={backHref} className={styles.back}>
            <Button icon={<ArrowLeftOutlined aria-hidden="true" />}>
              {tCommon('actions.back')}
            </Button>
          </Link>
        ) : null}

        <AutoSearchInput
          placeholder={t('toolbar.searchPlaceholder')}
          value={filters.q ?? ''}
          onSearch={(value) => setFilters({ q: value || null })}
          className={styles.search}
          aria-label={t('toolbar.searchAriaLabel')}
        />

        <Segmented
          value={filters.vehicleType ?? ALL}
          onChange={(value) => setFilters({ vehicleType: value === ALL ? null : String(value) })}
          options={[
            { label: t('toolbar.allVehicleTypes'), value: ALL },
            { label: domainLabel('vehicleType', VEHICLE_TYPE.CAR), value: VEHICLE_TYPE.CAR },
            {
              label: domainLabel('vehicleType', VEHICLE_TYPE.MOTORBIKE),
              value: VEHICLE_TYPE.MOTORBIKE,
            },
          ]}
        />

        {/* Mặc định `next_booking` là giá trị hữu ích nhất khi điều phối — xoá được khỏi URL. */}
        <Select<CalendarSort>
          value={filters.sort}
          onChange={(value) => setFilters({ sort: value === 'next_booking' ? null : value })}
          options={CALENDAR_SORT_VALUES.map((value) => ({
            value,
            label: t(`toolbar.sort.${value}`),
          }))}
          prefix={<SortAscendingOutlined />}
          className={styles.sortSelect}
          aria-label={t('toolbar.sortAriaLabel')}
        />
      </div>

      <div className={styles.rangeControls}>
        <Segmented
          value={filters.days}
          onChange={(value) => setFilters({ days: Number(value) })}
          options={dayOptions}
        />

        <Button onClick={() => setFilters({ from: todayIsoDate() })}>{t('toolbar.today')}</Button>

        <span className={styles.pager} role="group" aria-label={t('toolbar.pagerAriaLabel')}>
          <Tooltip title={t('toolbar.previousRange', { count: filters.days })}>
            <Button
              icon={<LeftOutlined />}
              onClick={() => shift(-1)}
              aria-label={t('toolbar.previousRange', { count: filters.days })}
            />
          </Tooltip>
          <Tooltip title={t('toolbar.nextRange', { count: filters.days })}>
            <Button
              icon={<RightOutlined />}
              onClick={() => shift(1)}
              aria-label={t('toolbar.nextRange', { count: filters.days })}
            />
          </Tooltip>
        </span>

        <span className={styles.rangeLabel} aria-live="polite">
          {rangeLabel}
        </span>
      </div>
    </div>
  );
}
