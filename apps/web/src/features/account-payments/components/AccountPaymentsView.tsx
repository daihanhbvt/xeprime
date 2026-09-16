'use client';

import { Alert, Button, Empty, Segmented, Skeleton, Statistic } from 'antd';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  PAYMENT_KIND,
  PAYMENT_KIND_VALUES,
  PAYMENT_METHOD_META,
  PAYMENT_STATUS,
  PAYMENT_STATUS_META,
  isPaymentKind,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ROUTES, tripPath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useAccountPayments } from '../hooks/use-account-payments';
import type { AccountPayment } from '../types';

import styles from './AccountPaymentsView.module.css';

const MIN_TABLE_WIDTH = 760;

/**
 * "Tiền của các chuyến đã thuê" — `/account/payments` (PROMPT 5).
 *
 * ## Màn này KHÔNG phải màn số dư
 *
 * Khách có BA loại tiền ở ba chỗ, và trộn chúng là cách chắc chắn để một người tưởng mình đã
 * được hoàn tiền khi thật ra chưa:
 *
 *   · **Đã trả cho gian hàng** — `payments`. Màn này.
 *   · **Đã chuyển giữ chỗ cho XePrime** — `booking_holds`, ở chi tiết từng chuyến.
 *   · **XePrime đang nợ mình** — Ví điểm, ở `/account/balance`.
 *
 * Dải liên kết ở đầu màn nói ra đúng ba câu đó thay vì để người dùng tự đoán họ đang xem cái nào.
 *
 * ## Lọc và trang ở URL (ADR 0004)
 *
 * Gửi link được, F5 không mất, nút Back quay đúng trang trước. Không có bản sao state nào ở
 * component — và `totals` cố ý KHÔNG theo bộ lọc: nó là "tôi đã trả bao nhiêu cho các chuyến
 * của mình", nên nó không được nhảy mỗi lần người dùng thu hẹp danh sách.
 */
export function AccountPaymentsView() {
  const t = useTranslations('AccountPayments');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const router = useRouter();
  const params = useSearchParams();

  const rawKind = params?.get('kind');
  const kind = isPaymentKind(rawKind) ? rawKind : null;
  const page = Math.max(1, Number(params?.get('page') ?? 1) || 1);

  const { data, isLoading, isFetching, isError, refetch } = useAccountPayments({ kind, page });

  function go(next: { kind?: string | null; page?: number }) {
    const query = new URLSearchParams(params?.toString() ?? '');
    const nextKind = next.kind === undefined ? kind : next.kind;
    if (nextKind) query.set('kind', nextKind);
    else query.delete('kind');
    // Đổi bộ lọc thì về trang 1 — giữ `page=4` trên một danh sách vừa hẹp lại là một trang trống.
    const nextPage = next.page ?? (next.kind === undefined ? page : 1);
    if (nextPage > 1) query.set('page', String(nextPage));
    else query.delete('page');
    const qs = query.toString();
    router.replace(qs ? `${ROUTES.ACCOUNT.PAYMENTS}?${qs}` : ROUTES.ACCOUNT.PAYMENTS, {
      scroll: false,
    });
  }

  const columns: DataTableColumn<AccountPayment>[] = [
    {
      key: 'trip',
      title: t('columns.trip'),
      render: (row) => (
        <div>
          {/* Mỗi khoản dẫn về CHUYẾN của nó: câu hỏi kế tiếp luôn là "khoản này của chuyến nào". */}
          <Link className={styles.link} href={tripPath.detail(row.bookingId)}>
            {row.bookingCode}
          </Link>
          <p className={styles.muted}>{row.vehicleName}</p>
        </div>
      ),
    },
    { key: 'shop', title: t('columns.shop'), render: (row) => row.tenantName },
    {
      key: 'kind',
      title: t('columns.kind'),
      render: (row) => domainLabel('paymentKind', row.kind),
    },
    {
      key: 'amount',
      title: t('columns.amount'),
      render: (row) => (
        <span
          className={
            row.status === PAYMENT_STATUS.SUCCEEDED ? styles.amount : styles.amountMuted
          }
        >
          {fmt.money(row.amount)}
        </span>
      ),
    },
    {
      key: 'method',
      title: t('columns.method'),
      render: (row) => (
        <StatusTag value={row.method} meta={PAYMENT_METHOD_META} group="paymentMethod" />
      ),
    },
    {
      key: 'status',
      title: t('columns.status'),
      render: (row) => (
        <div>
          <StatusTag value={row.status} meta={PAYMENT_STATUS_META} group="paymentStatus" />
          <p className={styles.muted}>
            {row.paidAt ? fmt.dateTime(row.paidAt) : t('notPaidYet')}
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      {/*
        Ba loại tiền, ba màn — nói ra ngay ở đầu. Không nói thì người dùng sẽ đọc con số ở đây và
        tưởng đó là số dư của mình.
      */}
      <Alert
        type="info"
        showIcon
        title={t('scope.title')}
        description={
          <span>
            {t('scope.body')}{' '}
            <Link href={ROUTES.ACCOUNT.BALANCE}>{t('scope.balanceLink')}</Link>
          </span>
        }
      />

      {isLoading ? <Skeleton active paragraph={{ rows: 6 }} /> : null}

      {isError && !data ? (
        <Alert
          type="error"
          showIcon
          title={t('loadError')}
          action={
            <Button size="small" onClick={() => void refetch()}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      ) : null}

      {data ? (
        <>
          <div className={styles.stats}>
            <Statistic title={t('stats.paidTotal')} value={fmt.money(data.meta.totals.paidTotal)} />
            <Statistic title={t('stats.rental')} value={fmt.money(data.meta.totals.rentalTotal)} />
            <Statistic title={t('stats.deposit')} value={fmt.money(data.meta.totals.depositTotal)} />
            <Statistic title={t('stats.trips')} value={data.meta.totals.tripCount} />
          </div>

          {Number(data.meta.totals.depositTotal) > 0 ? (
            <Alert type="warning" showIcon title={t('depositNote')} />
          ) : null}

          <Segmented
            value={kind ?? 'all'}
            onChange={(value) => go({ kind: value === 'all' ? null : String(value) })}
            options={[
              { value: 'all', label: t('filters.all') },
              ...PAYMENT_KIND_VALUES.map((value) => ({
                value,
                label: domainLabel('paymentKind', value),
              })),
            ]}
          />

          {data.meta.total === 0 ? (
            <Empty
              description={
                kind === PAYMENT_KIND.DEPOSIT
                  ? t('empty.deposit')
                  : kind === PAYMENT_KIND.RENTAL
                    ? t('empty.rental')
                    : t('empty.all')
              }
            />
          ) : (
            <DataTable<AccountPayment>
              label={t('title')}
              columns={columns}
              items={data.data}
              rowKey={(row) => row.id}
              minWidth={MIN_TABLE_WIDTH}
              loading={isFetching}
              empty={{ title: t('empty.all') }}
              pagination={{
                meta: data.meta,
                onChange: (next) => go({ page: next }),
                totalLabel: (total) => t('total', { count: total }),
              }}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
