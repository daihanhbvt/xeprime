'use client';

import { Button, Tag } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BOOKING_HOLD_OUTCOME_META,
  BOOKING_HOLD_STATUS,
  BOOKING_HOLD_STATUS_META,
  BOOKING_HOLD_STATUS_VALUES,
  PERMISSION,
  isBookingHoldStatus,
  type BookingHoldOutcome,
  type BookingHoldStatus,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { AdminBookingDetailDrawer } from '@/features/admin-bookings/components/AdminBookingDetailDrawer';
import { usePermissions } from '@/hooks/use-permissions';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { MONEY_DEFAULT_LIMIT } from '../api';
import { useHolds } from '../hooks/use-platform-money';
import type { PlatformHold } from '../types';
import { QueueViewSwitch } from './QueueViewSwitch';
import { SettleHoldDrawer } from './SettleHoldDrawer';
import styles from './MoneyQueue.module.css';

/** Năm cột cố định (730px) + cột gian hàng · khách tối thiểu 150px — vừa vùng nội dung ở 1366px trở lên. */
const MIN_TABLE_WIDTH = 880;

/**
 * `scope=any` mở rộng ra mọi khoản; vắng = chỉ khoản ĐÃ TRẢ chưa chốt kết cục (việc cần làm).
 *
 * ⚠️ KHÔNG dùng `'all'`: `useUrlFilters` coi `'all'` là "không lọc" và XOÁ tham số — chọn "Tất cả"
 * sẽ không bao giờ lên được URL.
 */
const SCOPE_ANY = 'any';
const SCOPE_UNSETTLED = 'unsettled';
type HoldScope = typeof SCOPE_ANY | typeof SCOPE_UNSETTLED;

interface HoldUrlFilters {
  q?: string;
  scope?: typeof SCOPE_ANY;
  status?: BookingHoldStatus;
  page?: number;
  limit?: number;
  /** Khoản đang mở ở panel chốt kết cục — trên URL: F5 và gửi link đều mở lại đúng khoản. */
  open?: string;
}

/** Khoản admin CHỐT TAY được: đã trả, chưa có kết cục. */
function canSettle(row: PlatformHold): boolean {
  return row.status === BOOKING_HOLD_STATUS.PAID && !row.outcome;
}

function parse(params: URLSearchParams): HoldUrlFilters {
  const scope = params.get('scope') === SCOPE_ANY ? SCOPE_ANY : undefined;
  const status = params.get('status');
  return {
    q: params.get('q')?.trim() || undefined,
    scope,
    // Trạng thái chỉ có nghĩa ở phạm vi "tất cả" — xem docblock bộ lọc bên dưới.
    status: scope && isBookingHoldStatus(status) ? status : undefined,
    page: positiveIntParam(params, 'page'),
    limit: positiveIntParam(params, 'limit'),
    open: params.get('open') || undefined,
  };
}

/**
 * Hàng đợi KHOẢN GIỮ CHỖ — mặc định chỉ khoản ĐÃ TRẢ mà chưa chốt kết cục.
 *
 * Phần lớn dòng ở đây là chuyến đang chạy bình thường (kết cục tự chốt khi đơn hoàn thành/huỷ);
 * việc tay của admin là những dòng mang nhãn TRANH CHẤP — kết luận ở màn hỗ trợ trước, chốt tiền
 * ở đây sau.
 */
export function HoldsPanel() {
  const t = useTranslations('PlatformMoney');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { has } = usePermissions();
  const { filters, setFilters } = useUrlFilters(parse);

  const [bookingId, setBookingId] = useState<string | null>(null);
  const canViewBooking = has(PERMISSION.PLATFORM_BOOKING_VIEW);

  const unsettled = !filters.scope;
  const { data, isError, isFetching, refetch } = useHolds({
    q: filters.q,
    unsettled,
    status: filters.status,
    page: filters.page,
    limit: filters.limit,
  });
  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: MONEY_DEFAULT_LIMIT, total: 0, hasNext: false };

  /*
   * Panel chốt mở theo `?open=`, trước/sau đi trong các khoản CHỐT ĐƯỢC của trang đang xem (ở góc
   * "tất cả", khoản đã có kết cục không có gì để chốt — bỏ qua chúng). Khoản không còn trong
   * danh sách (vừa được chốt, hay link cũ) thì panel tự đóng — không có gì để chốt.
   */
  const settleable = items.filter(canSettle);
  const openIndex = filters.open ? settleable.findIndex((row) => row.id === filters.open) : -1;
  const settling = openIndex >= 0 ? settleable[openIndex]! : null;
  const openHold = (id: string | undefined) => setFilters({ open: id }, { resetPage: false });

  /*
   * Ô lọc trạng thái CHỈ có mặt khi đang xem "tất cả": `unsettled=true` ở backend ép
   * `status = paid, outcome = null` và nuốt luôn bộ lọc trạng thái — một ô lọc không làm gì còn
   * tệ hơn không có ô nào.
   */
  const filterFields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.search'),
      placeholder: t('filters.holdsSearchPlaceholder'),
    },
    ...(unsettled
      ? []
      : ([
          {
            kind: 'select',
            key: 'status',
            label: t('filters.status'),
            allowClear: true,
            options: BOOKING_HOLD_STATUS_VALUES.map((status) => ({
              value: status,
              label: domainLabel('bookingHoldStatus', status),
            })),
          },
        ] satisfies FilterField[])),
  ];

  const columns: DataTableColumn<PlatformHold>[] = [
    {
      title: t('columns.code'),
      key: 'code',
      width: 150,
      render: (_, row) => (
        <div className={styles.stack}>
          <span className={styles.mono}>{row.code}</span>
          {row.disputeOpen ? (
            <Tag color="error" className={styles.tag}>
              {t('columns.disputeOpen')}
            </Tag>
          ) : null}
        </div>
      ),
    },
    {
      title: t('columns.booking'),
      key: 'booking',
      width: 130,
      render: (_, row) => {
        const linkedId = canViewBooking ? row.bookingId : null;
        return (
          <div className={styles.stack}>
            {row.bookingCode && linkedId ? (
              <Button
                type="link"
                size="small"
                className={styles.linkButton}
                onClick={() => setBookingId(linkedId)}
              >
                {row.bookingCode}
              </Button>
            ) : (
              (row.bookingCode ?? (
                <span className={styles.muted}>{tCommon('labels.emptyValue')}</span>
              ))
            )}
            <span className={styles.tertiary}>{fmt.dateTime(row.createdAt)}</span>
          </div>
        );
      },
    },
    {
      title: t('columns.parties'),
      key: 'parties',
      render: (_, row) => (
        <div className={styles.stack}>
          <span className={styles.strong}>{row.tenantName}</span>
          <span className={styles.secondary}>{row.customerName}</span>
        </div>
      ),
    },
    {
      title: t('columns.amount'),
      key: 'amount',
      width: 150,
      align: 'right',
      render: (_, row) => (
        <div className={styles.stackEnd}>
          <span className={styles.amount}>{fmt.money(row.amount)}</span>
          {row.paidAmount !== row.amount ? (
            <span className={styles.secondary}>
              {t('columns.paidAmount', { amount: fmt.money(row.paidAmount) })}
            </span>
          ) : null}
          <span className={styles.tertiary}>
            {t('columns.lines', {
              deposit: fmt.money(row.depositAmount),
              fee: fmt.money(row.serviceFeeAmount),
            })}
          </span>
        </div>
      ),
    },
    {
      title: t('columns.status'),
      key: 'status',
      width: 150,
      // Kết cục nằm DƯỚI trạng thái: hai nhãn của cùng một câu hỏi "khoản này đang ở đâu".
      render: (_, row) => (
        <div className={styles.stack}>
          <StatusTag
            value={row.status as BookingHoldStatus}
            meta={BOOKING_HOLD_STATUS_META}
            group="bookingHoldStatus"
          />
          {row.outcome ? (
            <StatusTag
              value={row.outcome as BookingHoldOutcome}
              meta={BOOKING_HOLD_OUTCOME_META}
              group="bookingHoldOutcome"
            />
          ) : null}
        </div>
      ),
    },
    actionColumn<PlatformHold>(
      (row) => [
        {
          key: 'settle',
          label: t('columns.settleAction'),
          hidden: !canSettle(row),
          onClick: () => openHold(row.id),
        },
      ],
      { width: 150, maxInline: 1 },
    ),
  ];

  return (
    <>
      <FilterBar
        fields={filterFields}
        values={{ q: filters.q, status: filters.status }}
        // `FilterBar` gửi đúng TRƯỜNG vừa đổi — ghi thẳng bản vá đó, không dựng lại cả bộ (dựng lại
        // là xoá mất ô tìm kiếm khi chọn trạng thái và ngược lại).
        onChange={(patch) => setFilters(patch as Partial<HoldUrlFilters>)}
        onClear={() => setFilters({ q: undefined, status: undefined })}
      />

      <QueueViewSwitch<HoldScope>
        label={t('filters.scope')}
        value={filters.scope ?? SCOPE_UNSETTLED}
        options={[
          { value: SCOPE_UNSETTLED, label: t('filters.unsettledOnly') },
          { value: SCOPE_ANY, label: t('filters.allHolds') },
        ]}
        onChange={(next) =>
          // Về lại "chờ chốt" thì xoá luôn trạng thái đã chọn — để nó nằm trong URL là để một bộ
          // lọc vô hiệu sống dậy bất ngờ khi người dùng quay về "tất cả".
          setFilters({ scope: next === SCOPE_ANY ? SCOPE_ANY : undefined, status: undefined })
        }
      />

      <DataTable<PlatformHold>
        label={t('queues.holds')}
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data ? { title: t('page.loadError'), onRetry: () => void refetch() } : null
        }
        filtered={Boolean(filters.q || filters.scope)}
        empty={{ title: t('page.holdsEmpty') }}
        noResults={{ title: tCommon('states.noResults') }}
        pagination={{
          meta,
          onChange: (page, limit) => setFilters({ page, limit }),
          totalLabel: (total) => t('page.holdsTotal', { count: total }),
        }}
      />

      <SettleHoldDrawer
        hold={settling}
        previousId={openIndex > 0 ? settleable[openIndex - 1]!.id : null}
        nextId={
          openIndex >= 0 && openIndex < settleable.length - 1 ? settleable[openIndex + 1]!.id : null
        }
        onNavigate={openHold}
        onClose={() => openHold(undefined)}
      />
      {canViewBooking ? (
        <AdminBookingDetailDrawer bookingId={bookingId} onClose={() => setBookingId(null)} />
      ) : null}
    </>
  );
}
