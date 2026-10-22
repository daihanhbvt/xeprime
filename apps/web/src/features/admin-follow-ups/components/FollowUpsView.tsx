'use client';

import { Checkbox, DatePicker, Select, Space } from 'antd';
import { useTranslations } from 'next-intl';
import {
  FOLLOW_UP_LOST_REASON_VALUES,
  FOLLOW_UP_STATUS,
  FOLLOW_UP_STATUS_VALUES,
} from '@xeprime/types';
import { AutoSearchInput } from '@/components/filter/AutoSearchInput';
import { ALL_FILTER } from '@/constants/filters';
import { useDatePickerPattern } from '@/i18n/use-app-format';
import { DAY_PARAM_FORMAT, dayjs, type Dayjs } from '@/lib/datetime';
import { useState } from 'react';
import { FOLLOW_UPS_DEFAULT_LIMIT } from '../api';
import { FOLLOW_UP_STATUS_ANY, useFollowUpFilters, useFollowUps } from '../hooks/use-follow-ups';
import type { FollowUp, FollowUpFilters } from '../types';
import { FollowUpDrawer } from './FollowUpDrawer';
import { FollowUpTable } from './FollowUpTable';
import styles from './FollowUps.module.css';

const CLEARED: Partial<FollowUpFilters> = {
  q: undefined,
  phone: undefined,
  reason: ALL_FILTER,
  followUpStatus: FOLLOW_UP_STATUS.NEW,
  mine: false,
  dateFrom: undefined,
  dateTo: undefined,
};

/** Tab "Cần chăm sóc" của Đơn thuê toàn hệ thống (ADR 0070). Mục đang mở ở `?open=`. */
export function FollowUpsView() {
  const t = useTranslations('AdminFollowUps');
  const datePattern = useDatePickerPattern();
  const { filters, setFilters } = useFollowUpFilters();
  const { data, isError, refetch, isFetching } = useFollowUps(filters);

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: FOLLOW_UPS_DEFAULT_LIMIT, total: 0, hasNext: false };
  const hasFilters = Boolean(
    filters.q ||
    filters.phone ||
    (filters.reason && filters.reason !== ALL_FILTER) ||
    filters.followUpStatus !== FOLLOW_UP_STATUS.NEW ||
    filters.mine ||
    filters.dateFrom ||
    filters.dateTo,
  );

  /*
   * Mục vừa lưu có thể rời bộ lọc đang xem (mặc định "Chưa liên hệ") — panel vẫn giữ nó, cùng hai
   * mốc trước/sau lúc lưu, để người dùng thấy lại cái mình vừa ghi thay vì tưởng nó mất.
   */
  const [saved, setSaved] = useState<{
    item: FollowUp;
    previousId: string | null;
    nextId: string | null;
  } | null>(null);
  const index = items.findIndex((i) => i.id === filters.open);
  const kept = index < 0 && saved?.item.id === filters.open ? saved : null;
  const listed = index >= 0 ? items[index]! : null;
  // Vừa lưu xong mà danh sách chưa tải lại: bản server vừa trả về mới hơn dòng trong danh sách.
  const fresher =
    listed && saved?.item.id === listed.id && isNewer(saved.item, listed) ? saved.item : listed;
  const open = fresher ?? kept?.item ?? null;
  const previousId = kept ? kept.previousId : index > 0 ? items[index - 1]!.id : null;
  const nextId = kept
    ? kept.nextId
    : index >= 0 && index < items.length - 1
      ? items[index + 1]!.id
      : null;
  const openId = (id: string | undefined) => setFilters({ open: id }, { resetPage: false });

  const range: [Dayjs | null, Dayjs | null] = [
    filters.dateFrom ? dayjs(filters.dateFrom, DAY_PARAM_FORMAT) : null,
    filters.dateTo ? dayjs(filters.dateTo, DAY_PARAM_FORMAT) : null,
  ];

  return (
    <div>
      <p className={styles.intro}>{t('page.intro')}</p>
      <Space wrap>
        <AutoSearchInput
          className={styles.search}
          size="large"
          placeholder={t('filters.searchPlaceholder')}
          aria-label={t('filters.searchLabel')}
          value={filters.q}
          onSearch={(value) => setFilters({ q: value || undefined })}
        />
        <AutoSearchInput
          className={styles.phone}
          size="large"
          placeholder={t('filters.phonePlaceholder')}
          aria-label={t('filters.phoneLabel')}
          value={filters.phone}
          onSearch={(value) => setFilters({ phone: value || undefined })}
        />
        <Select
          className={styles.select}
          size="large"
          aria-label={t('filters.reasonLabel')}
          value={filters.reason ?? ALL_FILTER}
          options={[
            { value: ALL_FILTER, label: t('filters.allReasons') },
            ...FOLLOW_UP_LOST_REASON_VALUES.map((value) => ({
              value,
              label: t(`reason.${value}`),
            })),
          ]}
          onChange={(value: string) => setFilters({ reason: value })}
        />
        <Select
          className={styles.select}
          size="large"
          aria-label={t('filters.statusLabel')}
          value={filters.followUpStatus ?? ALL_FILTER}
          options={[
            { value: ALL_FILTER, label: t('filters.allStatuses') },
            ...FOLLOW_UP_STATUS_VALUES.map((value) => ({ value, label: t(`status.${value}`) })),
          ]}
          // `useUrlFilters` xoá giá trị 'all' — mà mặc định của tab là "chưa liên hệ", nên "mọi
          // trạng thái" phải sống trên URL dưới một khoá riêng thì F5 mới không quay về mặc định.
          onChange={(value: string) =>
            setFilters({ followUpStatus: value === ALL_FILTER ? FOLLOW_UP_STATUS_ANY : value })
          }
        />
        <DatePicker.RangePicker
          size="large"
          aria-label={t('filters.dateRangeLabel')}
          allowEmpty={[true, true]}
          value={range}
          format={datePattern.date}
          onChange={(dates) =>
            setFilters({
              dateFrom: dates?.[0] ? dates[0].format(DAY_PARAM_FORMAT) : undefined,
              dateTo: dates?.[1] ? dates[1].format(DAY_PARAM_FORMAT) : undefined,
            })
          }
        />
        <Checkbox
          checked={Boolean(filters.mine)}
          onChange={(e) => setFilters({ mine: e.target.checked })}
        >
          {t('filters.mine')}
        </Checkbox>
      </Space>

      <FollowUpTable
        items={items}
        meta={meta}
        loading={isFetching}
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={hasFilters}
        onClearFilters={() => setFilters(CLEARED)}
        onView={(id) => openId(id)}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
        selectedId={filters.open ?? null}
      />

      <FollowUpDrawer
        item={open}
        previousId={previousId}
        nextId={nextId}
        onNavigate={(id) => openId(id)}
        onClose={() => openId(undefined)}
        onSaved={(updated) => setSaved({ item: updated, previousId, nextId })}
      />
    </div>
  );
}

/** Bản `a` có được cập nhật sau (hoặc cùng lúc) bản `b` không — so mốc cập nhật chăm sóc. */
function isNewer(a: FollowUp, b: FollowUp): boolean {
  if (!a.followUpUpdatedAt) return false;
  if (!b.followUpUpdatedAt) return true;
  return a.followUpUpdatedAt >= b.followUpUpdatedAt;
}
