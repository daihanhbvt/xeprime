'use client';

import { Button, Select, Tooltip } from 'antd';
import { ArrowLeftOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { VEHICLE_TYPE } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { AutoSearchInput } from '@/components/filter/AutoSearchInput';
import { SegmentedTabs } from '@/components/navigation/SegmentedTabs';
import { isSafeNextPath } from '@/features/auth/safe-next';
import { BranchFilterSelect } from '@/features/branches/components/BranchFilterSelect';
import { useBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { CALENDAR_BACK_PARAM } from '@/features/vehicles/calendar-link';
import { useIsMobile } from '@/hooks/use-media-query';
import { APP_TIME_ZONE, dayjs } from '@/lib/datetime';
import { CALENDAR_SORT_VALUES, useCalendarFilters } from '../hooks/use-calendar-filters';
import type { CalendarSort } from '../types/calendar.types';
import { todayIsoDate } from '../utils/calendar-date.util';
import styles from './CalendarToolbar.module.css';

const ALL = 'all';

/**
 * Thanh công cụ lịch: tìm xe · chi nhánh · loại xe · khoảng xem (7/14/30) · điều hướng khoảng ± /
 * hôm nay · nhãn khoảng đang xem.
 *
 * Chi nhánh nằm Ở ĐÂY từ ADR 0052, thay cho bộ chọn cũ trên thanh trên: nó chỉ thu hẹp được lịch,
 * danh sách xe, đơn và yêu cầu — chứ không phải ví, sổ thu chi hay hội thoại — nên nó thuộc về
 * thanh lọc của từng màn, cạnh dữ liệu nó lọc.
 *
 * Mobile bỏ lựa chọn 30 ngày: 30 cột × 52px không đọc nổi trên 390px — 7/14 ngày + cuộn ngang
 * là đủ. Filter sống ở URL (ADR 0004) nên mọi nút chỉ là `setFilters`.
 */
export function CalendarToolbar() {
  const { filters, setFilters } = useCalendarFilters();
  const branch = useBranchFilter({
    value: filters.branchId ?? undefined,
    // `null` chứ không `undefined`: `useCalendarFilters` XOÁ tham số khi nhận `null`, còn
    // `undefined` chỉ là "không đụng tới khoá này".
    onChange: (branchId) => setFilters({ branchId: branchId ?? null }),
  });
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const tCommon = useTranslations('Common');
  const t = useTranslations('Calendar');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();

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
  // Mẫu ngày theo NGÔN NGỮ (`DD/MM` vi · `MM/DD` en) — qua formatter, không gõ mẫu tay.
  const rangeLabel = t('toolbar.rangeLabel', {
    from: start.isSame(end, 'year')
      ? fmt.dayMonth(start.toISOString())
      : fmt.date(start.toISOString()),
    to: fmt.date(end.toISOString()),
  });

  const shift = (direction: 1 | -1) =>
    setFilters({ from: start.add(direction * filters.days, 'day').format('YYYY-MM-DD') });

  // Mobile: thêm khoảng 3 ngày (ô rất rộng, xem cận cảnh) và bỏ 30 ngày (không đọc nổi ở 390px).
  const dayOptions = (isMobile ? [3, 7, 14] : [7, 14, 30]).map((value) => ({
    label: t('toolbar.dayRange', { count: value }),
    value: String(value),
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
          size="large"
          aria-label={t('toolbar.searchAriaLabel')}
        />

        {/*
          Chi nhánh là `Select` chứ không nhóm nút như loại xe: loại xe có đúng ba lựa chọn cố
          định, còn chi nhánh thì gian hàng nào có bao nhiêu tuỳ họ — bốn, rồi mười. Tự ẩn khi
          gian hàng chỉ có một chi nhánh (`branch.visible === false`).
        */}
        <BranchFilterSelect
          branch={branch}
          value={filters.branchId}
          className={styles.branchSelect}
          size="large"
          appearance="field"
        />

        {/* Mặc định `next_booking` là giá trị hữu ích nhất khi điều phối — xoá được khỏi URL. */}
        <Select<CalendarSort>
          value={filters.sort}
          onChange={(value) => setFilters({ sort: value === 'next_booking' ? null : value })}
          options={CALENDAR_SORT_VALUES.map((value) => ({
            value,
            label: t(`toolbar.sort.${value}`),
          }))}
          className={styles.sortSelect}
          size="large"
          aria-label={t('toolbar.sortAriaLabel')}
        />

        <SegmentedTabs
          label={t('toolbar.vehicleTypeLabel')}
          className={styles.tabs}
          value={filters.vehicleType ?? ALL}
          onChange={(value) => setFilters({ vehicleType: value === ALL ? null : value })}
          items={[
            { label: t('toolbar.allVehicleTypes'), value: ALL },
            { label: domainLabel('vehicleType', VEHICLE_TYPE.CAR), value: VEHICLE_TYPE.CAR },
            {
              label: domainLabel('vehicleType', VEHICLE_TYPE.MOTORBIKE),
              value: VEHICLE_TYPE.MOTORBIKE,
            },
          ]}
        />
      </div>

      <div className={styles.rangeControls}>
        <SegmentedTabs
          label={t('toolbar.rangeLength')}
          className={styles.tabs}
          value={String(filters.days)}
          onChange={(value) => setFilters({ days: Number(value) })}
          items={dayOptions}
        />

        <Button size="large" onClick={() => setFilters({ from: todayIsoDate() })}>
          {t('toolbar.today')}
        </Button>

        <span className={styles.pager} role="group" aria-label={t('toolbar.pagerAriaLabel')}>
          <Tooltip title={t('toolbar.previousRange', { count: filters.days })}>
            <Button
              size="large"
              icon={<LeftOutlined />}
              onClick={() => shift(-1)}
              aria-label={t('toolbar.previousRange', { count: filters.days })}
            />
          </Tooltip>
          <span className={styles.rangeLabel} aria-live="polite">
            {rangeLabel}
          </span>
          <Tooltip title={t('toolbar.nextRange', { count: filters.days })}>
            <Button
              size="large"
              icon={<RightOutlined />}
              onClick={() => shift(1)}
              aria-label={t('toolbar.nextRange', { count: filters.days })}
            />
          </Tooltip>
        </span>
      </div>
    </div>
  );
}
