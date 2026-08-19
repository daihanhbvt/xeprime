'use client';

import { Button, Segmented, Select, Tooltip } from 'antd';
import { ArrowLeftOutlined, LeftOutlined, RightOutlined, SortAscendingOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { VEHICLE_TYPE, VEHICLE_TYPE_LABEL } from '@xeprime/types';
import { AutoSearchInput } from '@/components/filter/AutoSearchInput';
import { isSafeNextPath } from '@/features/auth/safe-next';
import { CALENDAR_BACK_PARAM } from '@/features/vehicles/calendar-link';
import { useIsMobile } from '@/hooks/use-media-query';
import { APP_TIME_ZONE, dayjs } from '@/lib/datetime';
import { CALENDAR_SORT_OPTIONS, useCalendarFilters } from '../hooks/use-calendar-filters';
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
  const dayOptions = isMobile
    ? [
        { label: '3 ngày', value: 3 },
        { label: '7 ngày', value: 7 },
        { label: '14 ngày', value: 14 },
      ]
    : [
        { label: '7 ngày', value: 7 },
        { label: '14 ngày', value: 14 },
        { label: '30 ngày', value: 30 },
      ];

  return (
    <div className={styles.toolbar}>
      <div className={styles.filters}>
        {backHref ? (
          <Link href={backHref} className={styles.back}>
            <Button icon={<ArrowLeftOutlined aria-hidden="true" />}>{tCommon('actions.back')}</Button>
          </Link>
        ) : null}

        <AutoSearchInput
          placeholder="Tìm xe, mã hoặc biển số"
          value={filters.q ?? ''}
          onSearch={(value) => setFilters({ q: value || null })}
          className={styles.search}
          aria-label="Tìm xe trên lịch"
        />

        <Segmented
          value={filters.vehicleType ?? ALL}
          onChange={(value) => setFilters({ vehicleType: value === ALL ? null : String(value) })}
          options={[
            { label: 'Tất cả', value: ALL },
            { label: VEHICLE_TYPE_LABEL[VEHICLE_TYPE.CAR], value: VEHICLE_TYPE.CAR },
            { label: VEHICLE_TYPE_LABEL[VEHICLE_TYPE.MOTORBIKE], value: VEHICLE_TYPE.MOTORBIKE },
          ]}
        />

        {/* Mặc định `next_booking` là giá trị hữu ích nhất khi điều phối — xoá được khỏi URL. */}
        <Select<CalendarSort>
          value={filters.sort}
          onChange={(value) => setFilters({ sort: value === 'next_booking' ? null : value })}
          options={[...CALENDAR_SORT_OPTIONS]}
          prefix={<SortAscendingOutlined />}
          className={styles.sortSelect}
          aria-label="Sắp xếp hàng xe"
        />
      </div>

      <div className={styles.rangeControls}>
        <Segmented
          value={filters.days}
          onChange={(value) => setFilters({ days: Number(value) })}
          options={dayOptions}
        />

        <Button onClick={() => setFilters({ from: todayIsoDate() })}>Hôm nay</Button>

        <span className={styles.pager} role="group" aria-label="Điều hướng khoảng xem">
          <Tooltip title={`Lùi ${filters.days} ngày`}>
            <Button
              icon={<LeftOutlined />}
              onClick={() => shift(-1)}
              aria-label={`Lùi ${filters.days} ngày`}
            />
          </Tooltip>
          <Tooltip title={`Tiến ${filters.days} ngày`}>
            <Button
              icon={<RightOutlined />}
              onClick={() => shift(1)}
              aria-label={`Tiến ${filters.days} ngày`}
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
