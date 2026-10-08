'use client';

import { BellOutlined, IdcardOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  PLATFORM_TRIP_QUEUE,
  TENANT_STATUS,
  TENANT_STATUS_META,
  TRIP_PLATFORM_REMIND_COOLDOWN_MINUTES,
  type PlatformTripRequestQueue,
  type TenantStatus,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { adminPartnerPath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { TRIPS_DEFAULT_LIMIT } from '../api';
import { useRemindTripRequest, useTripRequests } from '../hooks/use-admin-trips';
import { useTripQueueFilters } from '../hooks/use-trip-queue-filters';
import type { TripRequest } from '../types';
import { HoldCountdown, RespondByCountdown, useNow } from './TripDeadline';
import styles from './TripQueuePanels.module.css';

const MINUTE_MS = 60_000;

/** Sáu cột, cột hạn có đồng hồ — dưới ngưỡng này bảng cuộn ngang thay vì bóp chữ. */
const MIN_TABLE_WIDTH = 1100;

/**
 * Hàng đợi YÊU CẦU THUÊ — hai chặng trước khi có đơn (ADR 0044):
 *  - `pending_approval`: chờ chủ xe trả lời (hạn 60′). Việc của người trực: nhắc tay chủ xe
 *    khi máy đã nhắc hết hai mốc mà vẫn im — nút "Nhắc chủ xe", có cooldown.
 *  - `awaiting_hold`: chờ khách chuyển tiền giữ chỗ (120′). Khách đã được máy nhắc; nền tảng
 *    chỉ theo dõi — không có nút nào, vì không có ai để nhắc thêm.
 *
 * Hai chặng dùng CHUNG bảng: cùng khách, cùng xe, cùng gian hàng — khác đúng ở cột hạn và hàng
 * nút. Đổi chặng là đổi `queue`, panel được dựng lại (key ở nơi gọi).
 */
export function RequestQueuePanel({ queue }: { queue: PlatformTripRequestQueue }) {
  const t = useTranslations('AdminTrips');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const router = useRouter();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const now = useNow();
  const { filters, setFilters } = useTripQueueFilters();
  const { data, isError, isFetching, refetch } = useTripRequests({ queue, ...filters });
  const remind = useRemindTripRequest();

  const isPending = queue === PLATFORM_TRIP_QUEUE.PENDING_APPROVAL;
  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: TRIPS_DEFAULT_LIMIT, total: 0, hasNext: false };

  const fields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.searchLabel'),
      placeholder: t('filters.searchPlaceholder'),
    },
  ];

  /** Lần nhắc tay gần nhất còn trong cooldown ⇒ nút tắt kèm lý do (không phải ngõ cụt). */
  const cooldownUntil = (row: TripRequest): number | null => {
    if (!row.lastPlatformRemindAt) return null;
    const until = Date.parse(row.lastPlatformRemindAt) + TRIP_PLATFORM_REMIND_COOLDOWN_MINUTES * MINUTE_MS;
    return until > now ? until : null;
  };

  function sendReminder(row: TripRequest) {
    remind.mutate(
      { id: row.id },
      {
        onSuccess: () => message.success(t('request.remindSuccess')),
        onError: (error) => message.error(errorMessage(error)),
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

  const deadline = (row: TripRequest) =>
    isPending ? (
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

  const columns: DataTableColumn<TripRequest>[] = [
    {
      title: t('request.customer'),
      key: 'customer',
      width: 170,
      render: (_, r) => (
        <div className={styles.stack}>
          <span className={styles.primary}>{r.customerName}</span>
          {/* SĐT khách LUÔN đã che — bản đầy đủ chỉ qua đơn thuê, có audit. */}
          <span className={styles.meta}>{r.customerPhoneMasked ?? tCommon('labels.emptyValue')}</span>
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
            {r.vehiclePlateNumber ? ` · ${r.vehiclePlateNumber}` : ''}
          </span>
          <span className={styles.tenantName}>
            <span className={styles.meta}>
              {r.tenantName}
              {/* SĐT CHỦ XE hiện đủ: gọi chủ xe là việc của chính hàng đợi này. */}
              {r.ownerPhone ? (
                <>
                  {' · '}
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
    {
      title: t('request.sentAt'),
      key: 'sentAt',
      width: 150,
      render: (_, r) => (
        <div className={styles.stack}>
          <span className={styles.period}>{fmt.shortDateTime(r.createdAt)}</span>
          {isPending ? (
            <span className={styles.meta}>
              {remindersSent(r) > 0
                ? t('request.autoReminded', { count: remindersSent(r) })
                : t('request.notReminded')}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      title: isPending ? t('request.respondBy') : t('request.holdBy'),
      key: 'deadline',
      width: 190,
      render: (_, r) => deadline(r),
    },
    actionColumn<TripRequest>(
      (row) => {
        const until = cooldownUntil(row);
        return [
          ...(isPending
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
      { width: isPending ? 180 : 160 },
    ),
  ];

  return (
    <div className={styles.panel}>
      <FilterBar
        compactFields
        fields={fields}
        values={{ q: filters.q }}
        onChange={(patch) => setFilters({ q: patch.q })}
      />
      <DataTable<TripRequest>
        label={t('request.label')}
        columns={columns}
        items={items}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={isError && !data ? { title: t('request.loadError'), onRetry: () => void refetch() } : null}
        filtered={Boolean(filters.q)}
        empty={{ title: t(`empty.${queue}`) }}
        noResults={{ title: t('request.noResults') }}
        pagination={{
          meta,
          onChange: (page, pageSize) => setFilters({ page, limit: pageSize }),
          totalLabel: (total) => t('request.total', { count: total }),
        }}
        renderCard={(row) => (
          <article className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.stack}>
                <span className={styles.primary}>{row.customerName}</span>
                <span className={styles.meta}>{row.customerPhoneMasked ?? tCommon('labels.emptyValue')}</span>
              </div>
              {deadline(row)}
            </div>
            <div className={styles.cardLine}>
              {row.vehicleName}
              {row.vehiclePlateNumber ? ` · ${row.vehiclePlateNumber}` : ''}
            </div>
            <div className={styles.meta}>
              {row.tenantName}
              {row.ownerPhone ? ` · ${row.ownerPhone}` : ''}
            </div>
            {schedule(row)}
          </article>
        )}
      />
    </div>
  );
}
