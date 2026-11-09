'use client';

import { CreditCardOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  SUBSCRIPTION_INVOICE_STATUS_META,
  isSubscriptionInvoicePayable,
  planVehicleScopeOf,
  type SubscriptionInvoiceStatus,
} from '@xeprime/types';

import { CopyButton } from '@/components/data-display/CopyButton';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { invoicePaymentHref } from '@/constants/routes';
import { InfoCard } from '@/components/layout/InfoCard';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';

import { useSubscriptionInvoices } from '../hooks/use-subscription';
import type { SubscriptionInvoice } from '../types';
import styles from './ShopPlanSection.module.css';

const INVOICE_TABLE_MIN_WIDTH = 960;

/**
 * "Hóa đơn và thanh toán" — design `23999:111432`: bảng lịch sử hoá đơn gói luôn mở (bản cũ là khối
 * gập), phân trang SERVER theo `?page=` (ADR 0004).
 *
 * Mã đối soát là mã mà khoản tiền khớp vào: hoá đơn thuộc phiếu gộp hiện mã `XPC…` của phiếu (ADR
 * 0083) — khách chuyển khoản theo mã đó, không theo mã con. Hoá đơn còn nhận tiền có nút "Thanh
 * toán" (design không vẽ cột này — giữ lối trả của khối "hoá đơn chờ" cũ); phiên hỗ trợ không có.
 */
export function ShopInvoicesCard() {
  const t = useTranslations('Subscription');
  const tCommon = useTranslations('Common');
  const tPayment = useTranslations('Subscription.payment');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const inSupport = useSupportHides(SUPPORT_HIDDEN_AREA.PLAN_PURCHASE);

  const { filters, setFilters } = useUrlFilters((params) => ({
    page: positiveIntParam(params, 'page') ?? 1,
  }));
  const invoices = useSubscriptionInvoices(filters.page);
  const payable = (inv: SubscriptionInvoice) =>
    !inSupport && isSubscriptionInvoicePayable(inv.status);

  const columns: DataTableColumn<SubscriptionInvoice>[] = [
    {
      title: t('invoices.columns.code'),
      key: 'code',
      width: 200,
      render: (_, inv) => {
        const code = inv.checkoutCode ?? inv.code;
        return (
          <span className={styles.codeCell}>
            <span className={styles.code}>{code}</span>
            <CopyButton value={code} label={t('invoices.copyCode')} />
          </span>
        );
      },
    },
    {
      title: t('invoices.columns.scope'),
      key: 'scope',
      width: 150,
      render: (_, inv) => (
        <span className={styles.cellMuted}>
          {t(`lanes.title.${planVehicleScopeOf(inv.vehicleScope)}`)}
        </span>
      ),
    },
    {
      title: t('invoices.columns.period'),
      key: 'period',
      width: 220,
      render: (_, inv) => (
        <span className={styles.cellMuted}>
          {fmt.date(inv.periodFrom)} → {fmt.date(inv.periodTo)}
        </span>
      ),
    },
    {
      title: t('invoices.columns.total'),
      key: 'total',
      width: 130,
      render: (_, inv) => <span className={styles.cellMuted}>{fmt.money(inv.totalAmount)}</span>,
    },
    {
      title: t('invoices.columns.status'),
      key: 'status',
      width: 150,
      render: (_, inv) => (
        <StatusTag
          value={inv.status as SubscriptionInvoiceStatus}
          meta={SUBSCRIPTION_INVOICE_STATUS_META}
          group="subscriptionInvoiceStatus"
          appearance="pill"
        />
      ),
    },
    {
      title: t('invoices.columns.createdAt'),
      key: 'createdAt',
      width: 120,
      render: (_, inv) => <span className={styles.cellMuted}>{fmt.date(inv.createdAt)}</span>,
    },
    {
      title: tCommon('labels.actions'),
      key: 'actions',
      width: 130,
      render: (_, inv) =>
        payable(inv) ? (
          <Link href={invoicePaymentHref(inv, { inShop: true })}>
            <Button size="small" icon={<CreditCardOutlined aria-hidden />}>
              {tPayment('payNow')}
            </Button>
          </Link>
        ) : null,
    },
  ];

  return (
    <InfoCard title={t('shopPlan.invoicesTitle')} hint={t('shopPlan.invoicesHint')}>
      <DataTable<SubscriptionInvoice>
        label={t('shopPlan.invoicesTitle')}
        columns={columns}
        items={invoices.data?.items ?? []}
        minWidth={INVOICE_TABLE_MIN_WIDTH}
        loading={invoices.isFetching}
        error={
          invoices.isError && !invoices.data
            ? {
                title: t('invoices.loadError'),
                description: errorMessage(invoices.error),
                onRetry: () => void invoices.refetch(),
              }
            : null
        }
        empty={{ title: t('invoices.empty'), description: t('invoices.emptyHint') }}
        pagination={
          invoices.data
            ? {
                meta: invoices.data.meta,
                onChange: (page) => setFilters({ page }),
                totalLabel: (total) => tCommon('pagination.total', { count: total }),
              }
            : undefined
        }
      />
    </InfoCard>
  );
}
