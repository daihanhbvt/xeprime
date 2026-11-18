'use client';

import { BellOutlined, IdcardOutlined } from '@ant-design/icons';
import { App, Button, Tag } from 'antd';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  BOOKING_REQUEST_STATUS,
  BOOKING_REQUEST_STATUS_META,
  PLATFORM_TRIP_QUEUE,
  TENANT_STATUS,
  TENANT_STATUS_META,
  TRIP_PLATFORM_REMIND_COOLDOWN_MINUTES,
  type BookingRequestStatus,
  type PaginationMeta,
  type PlatformTripRequestQueue,
  type TenantStatus,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { adminPartnerPath } from '@/constants/routes';
import { useNow } from '@/hooks/use-now';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { TRIPS_DEFAULT_LIMIT } from '../api';
import { useRemindTripRequest, useTripRequests } from '../hooks/use-admin-trips';
import { useTripQueueFilters } from '../hooks/use-trip-queue-filters';
import { timeDistance } from '../trip-time';
import type { TripRequest } from '../types';
import { HoldCountdown, RespondByCountdown } from './TripDeadline';
import styles from './TripQueuePanels.module.css';

const MINUTE_MS = 60_000;

/** Sáu cột, cột hạn có đồng hồ — dưới ngưỡng này bảng cuộn ngang thay vì bóp chữ. */
const MIN_TABLE_WIDTH = 1100;
/** Cả hai chặng thêm cột "Tình trạng". */
const MIN_TABLE_WIDTH_BOTH = 1260;

const isPendingRow = (row: TripRequest) =>
  row.status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL;

/** Chặng của một dòng — cùng khoá với nhãn hàng đợi `AdminTrips.queues`. */
const stageOf = (row: TripRequest): PlatformTripRequestQueue =>
  isPendingRow(row) ? PLATFORM_TRIP_QUEUE.PENDING_APPROVAL : PLATFORM_TRIP_QUEUE.AWAITING_HOLD;

/**
 * Mốc bắt đầu của chặng đang chờ: chờ chủ xe tính từ lúc khách GỬI; chờ khách tính từ lúc chủ xe
 * NHẬN — đó là lúc đồng hồ chuyển tiền giữ chỗ bắt đầu chạy (ADR 0044).
 */
const waitingSince = (row: TripRequest) =>
  isPendingRow(row) ? row.createdAt : (row.decidedAt ?? row.createdAt);

export interface RequestQueueTableProps {
  /** Bỏ trống = cả hai chặng: thêm cột "Tình trạng", cột hạn đọc theo chặng của từng dòng. */
  queue?: PlatformTripRequestQueue;
  items: TripRequest[];
  meta: PaginationMeta;
  loading: boolean;
  error: { onRetry: () => void } | null;
  filtered: boolean;
  onClearFilters?: () => void;
  onPageChange: (page: number, pageSize: number) => void;
}

/**
 * Bảng YÊU CẦU THUÊ trước khi có đơn (ADR 0044) — dùng chung cho hàng đợi của Vận hành chuyến
 * (một chặng) và tab "Chưa giữ chỗ" của Đơn thuê toàn hệ thống (cả hai chặng):
 *  - `pending_host_approval`: chờ chủ xe trả lời (hạn động 15′–4 giờ, ADR 0066). Việc của người
 *    trực: nhắc tay chủ xe khi máy đã nhắc hết hai mốc mà vẫn im — nút "Nhắc chủ xe", có cooldown.
 *  - `awaiting_hold`: chờ khách chuyển tiền giữ chỗ. Khách đã được máy nhắc; nền tảng chỉ theo
 *    dõi — không có nút nhắc, vì không có ai để nhắc thêm.
 *
 * Nút và cột hạn đọc theo trạng thái của TỪNG DÒNG, nên một bảng trộn hai chặng vẫn đúng.
 */
export function RequestQueueTable({
  queue,
  items,
  meta,
  loading,
  error,
  filtered,
  onClearFilters,
  onPageChange,
}: RequestQueueTableProps) {
  const t = useTranslations('AdminTrips');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const router = useRouter();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const now = useNow();
  const remind = useRemindTripRequest();
  const bothStages = queue === undefined;

  /** Lần nhắc tay gần nhất còn trong cooldown ⇒ nút tắt kèm lý do (không phải ngõ cụt). */
  const cooldownUntil = (row: TripRequest): number | null => {
    if (!row.lastPlatformRemindAt) return null;
    const until =
      Date.parse(row.lastPlatformRemindAt) + TRIP_PLATFORM_REMIND_COOLDOWN_MINUTES * MINUTE_MS;
    return until > now ? until : null;
  };

  function sendReminder(row: TripRequest) {
    remind.mutate(
      { id: row.id },
      {
        onSuccess: () => message.success(t('request.remindSuccess')),
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  const remindersSent = (row: TripRequest) =>
    (row.firstRemindedAt ? 1 : 0) + (row.finalRemindedAt ? 1 : 0);

  const schedule = (row: TripRequest) =>
    row.longTermPackageMonths ? (
      <div className={styles.stack}>
        <span className={styles.primary}>
          {t('request.longTerm', { package: fmt.packageLabel(row.longTermPackageMonths) ?? '' })}
        </span>
        <span className={styles.meta}>{fmt.pickupWish(row)}</span>
      </div>
    ) : (
      <span className={styles.period}>{fmt.shortDateTimeRange(row.pickupAt, row.returnAt)}</span>
    );

  const stage = (row: TripRequest) => (
    <Tag color={BOOKING_REQUEST_STATUS_META[row.status as BookingRequestStatus]?.color}>
      {t(`queues.${stageOf(row)}`)}
    </Tag>
  );

  /** Đã chờ bao lâu ở chặng hiện tại + mốc bắt đầu của chặng đó. */
  const waited = (row: TripRequest) => {
    const since = waitingSince(row);
    const distance = timeDistance(since, now);
    const elapsedKey =
      distance.unit === 'days'
        ? 'elapsedDays'
        : distance.unit === 'hours'
          ? 'elapsedHours'
          : 'elapsedMinutes';
    return (
      <div className={styles.stack}>
        <span className={styles.primary}>{t(`time.${elapsedKey}`, { count: distance.count })}</span>
        <span className={styles.meta}>
          {isPendingRow(row)
            ? t('request.sentAtValue', { time: fmt.shortDateTime(row.createdAt) })
            : t('request.acceptedAtValue', { time: fmt.shortDateTime(since) })}
        </span>
        {isPendingRow(row) ? (
          <span className={styles.meta}>
            {remindersSent(row) > 0
              ? t('request.autoReminded', { count: remindersSent(row) })
              : t('request.notReminded')}
          </span>
        ) : null}
      </div>
    );
  };

  const deadline = (row: TripRequest) =>
    isPendingRow(row) ? (
      <RespondByCountdown deadline={row.respondBy} />
    ) : row.holdExpiresAt ? (
      <div className={styles.stack}>
        <HoldCountdown deadline={row.holdExpiresAt} />
        {row.holdAmount ? (
          <span className={styles.meta}>
            {t('request.holdAmount', { amount: fmt.money(row.holdAmount) })}
          </span>
        ) : null}
      </div>
    ) : (
      tCommon('labels.emptyValue')
    );

  const deadlineTitle = bothStages
    ? t('request.deadline')
    : queue === PLATFORM_TRIP_QUEUE.PENDING_APPROVAL
      ? t('request.respondBy')
      : t('request.holdBy');

  const columns: DataTableColumn<TripRequest>[] = [
    {
      title: t('request.customer'),
      key: 'customer',
      width: 170,
      render: (_, r) => (
        <div className={styles.stack}>
          <span className={styles.primary}>{r.customerName}</span>
          {/* SĐT khách LUÔN đã che — bản đầy đủ chỉ qua đơn thuê, có audit. */}
          <span className={styles.meta}>
            {r.customerPhoneMasked ?? tCommon('labels.emptyValue')}
          </span>
        </div>
      ),
    },
    {
      title: t('request.vehicle'),
      key: 'vehicle',
      width: 240,
      render: (_, r) => (
        <div className={styles.stack}>
          <span className={styles.primary}>
            {r.vehicleName}
            {r.vehiclePlateNumber ? `${LIST_SEPARATOR}${r.vehiclePlateNumber}` : ''}
          </span>
          <span className={styles.tenantName}>
            <span className={styles.meta}>
              {r.tenantName}
              {/* SĐT CHỦ XE hiện đủ: gọi chủ xe là việc của chính hàng đợi này. */}
              {r.ownerPhone ? (
                <>
                  {LIST_SEPARATOR}
                  <a href={`tel:${r.ownerPhone}`} aria-label={t('request.callOwner')}>
                    {r.ownerPhone}
                  </a>
                </>
              ) : null}
            </span>
            {r.tenantStatus === TENANT_STATUS.SUSPENDED ? (
              <StatusTag
                value={r.tenantStatus as TenantStatus}
                meta={TENANT_STATUS_META}
                group="tenantStatus"
              />
            ) : null}
          </span>
        </div>
      ),
    },
    { title: t('request.schedule'), key: 'schedule', width: 210, render: (_, r) => schedule(r) },
    ...(bothStages
      ? [
          {
            title: t('request.stage'),
            key: 'stage',
            width: 170,
            render: (_: unknown, r: TripRequest) => stage(r),
          },
        ]
      : []),
    { title: t('request.waited'), key: 'waited', width: 170, render: (_, r) => waited(r) },
    { title: deadlineTitle, key: 'deadline', width: 190, render: (_, r) => deadline(r) },
    actionColumn<TripRequest>(
      (row) => {
        const until = cooldownUntil(row);
        return [
          ...(isPendingRow(row)
            ? [
                {
                  key: 'remind',
                  label: t('request.remind'),
                  icon: <BellOutlined />,
                  primary: true,
                  disabled: until !== null || (remind.isPending && remind.variables?.id === row.id),
                  disabledReason:
                    until !== null
                      ? t('request.remindCooldown', {
                          time: fmt.time(row.lastPlatformRemindAt),
                          minutes: TRIP_PLATFORM_REMIND_COOLDOWN_MINUTES,
                        })
                      : undefined,
                  onClick: () => sendReminder(row),
                },
              ]
            : []),
          {
            key: 'partner',
            label: t('request.partnerProfile'),
            icon: <IdcardOutlined />,
            onClick: () => router.push(adminPartnerPath.resolveTenant(row.tenantId)),
          },
        ];
      },
      { width: queue === PLATFORM_TRIP_QUEUE.AWAITING_HOLD ? 160 : 180 },
    ),
  ];

  return (
    <DataTable<TripRequest>
      label={t('request.label')}
      columns={columns}
      items={items}
      minWidth={bothStages ? MIN_TABLE_WIDTH_BOTH : MIN_TABLE_WIDTH}
      loading={loading}
      error={error ? { title: t('request.loadError'), onRetry: error.onRetry } : null}
      filtered={filtered}
      empty={{ title: t(`empty.${queue ?? 'both'}`) }}
      noResults={{
        title: t('request.noResults'),
        action: onClearFilters ? (
          <Button onClick={onClearFilters}>{tCommon('actions.clear')}</Button>
        ) : undefined,
      }}
      pagination={{
        meta,
        onChange: onPageChange,
        totalLabel: (total) => t('request.total', { count: total }),
      }}
      renderCard={(row) => (
        <article className={styles.card}>
          <div className={styles.cardHead}>
            <div className={styles.stack}>
              <span className={styles.primary}>{row.customerName}</span>
              <span className={styles.meta}>
                {row.customerPhoneMasked ?? tCommon('labels.emptyValue')}
              </span>
            </div>
            {deadline(row)}
          </div>
          {bothStages ? stage(row) : null}
          <div className={styles.cardLine}>
            {row.vehicleName}
            {row.vehiclePlateNumber ? `${LIST_SEPARATOR}${row.vehiclePlateNumber}` : ''}
          </div>
          <div className={styles.meta}>
            {row.tenantName}
            {row.ownerPhone ? `${LIST_SEPARATOR}${row.ownerPhone}` : ''}
          </div>
          {schedule(row)}
          {waited(row)}
        </article>
      )}
    />
  );
}

/** Hàng đợi MỘT chặng của màn Vận hành chuyến. Đổi chặng là dựng lại panel (key ở nơi gọi). */
export function RequestQueuePanel({ queue }: { queue: PlatformTripRequestQueue }) {
  const t = useTranslations('AdminTrips');
  const { filters, setFilters } = useTripQueueFilters();
  const { data, isError, isFetching, refetch } = useTripRequests({ queue, ...filters });

  const fields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.searchLabel'),
      placeholder: t('filters.searchPlaceholder'),
    },
  ];

  return (
    <div className={styles.panel}>
      <FilterBar
        compactFields
        fields={fields}
        values={{ q: filters.q }}
        onChange={(patch) => setFilters({ q: patch.q })}
      />
      <RequestQueueTable
        queue={queue}
        items={data?.items ?? []}
        meta={data?.meta ?? { page: 1, limit: TRIPS_DEFAULT_LIMIT, total: 0, hasNext: false }}
        loading={isFetching}
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={Boolean(filters.q)}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />
    </div>
  );
}
