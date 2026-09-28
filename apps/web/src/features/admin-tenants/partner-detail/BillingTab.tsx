'use client';

import {
  BarChartOutlined,
  CalendarOutlined,
  CrownOutlined,
  ExclamationCircleOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  HistoryOutlined,
  LockOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  FEATURE_STATE,
  PERMISSION,
  SUBSCRIPTION_INVOICE_STATUS_META,
  type SubscriptionInvoiceStatus,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { PermissionState } from '@/components/feedback/PermissionState';
import { DashboardPanel } from '@/features/dashboard/components/DashboardPanel';
import { StatCard } from '@/features/dashboard/components/StatCard';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import type { PartnerBilling, PartnerOverview } from './api';
import { usePartnerBilling } from './hooks';
import { KeyValues, QuotaValue, useTabState } from './parts';
import styles from './PartnerDetail.module.css';

const DAY_MS = 24 * 60 * 60 * 1000;

type SubscriptionRow = PartnerBilling['subscriptions'][number];
type InvoiceRow = PartnerBilling['invoices'][number];

/**
 * Tab Gói & phí (gian hàng gói) — CHỈ ĐỌC. Gói, hạn mức, hoá đơn là việc của người quản lý gói
 * (`platform.billing.manage`): thiếu quyền thì không gọi API, hiện trạng thái không có quyền (server
 * vẫn chặn độc lập). Gán/gia hạn/huỷ gói không nằm ở đây — xem "Thao tác quản trị nền tảng".
 */
export function BillingTab({ overview }: { overview: PartnerOverview }) {
  const t = useTranslations('AdminTenants.partnerDetail');
  const { has } = usePermissions();
  const allowed = has(PERMISSION.PLATFORM_BILLING_MANAGE);
  const query = usePartnerBilling(overview.identity.id, allowed);
  const state = useTabState({
    isLoading: query.isLoading,
    error: query.isError && !query.data ? query.error : null,
    onRetry: () => void query.refetch(),
    deniedMessage: t('denied.billing'),
  });

  if (!allowed) {
    return (
      <div className={styles.tabBody}>
        <PermissionState
          kind="forbidden"
          title={t('denied.title')}
          description={t('denied.billing')}
        />
      </div>
    );
  }
  if (state || !query.data) return <div className={styles.tabBody}>{state}</div>;
  return <BillingContent billing={query.data} joinedAt={overview.identity.createdAt} />;
}

function BillingContent({ billing, joinedAt }: { billing: PartnerBilling; joinedAt: string }) {
  const t = useTranslations('AdminTenants.partnerDetail.billing');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { plan, quota, invoiceStatus } = billing;
  // "Bây giờ" chốt MỘT lần mỗi lần mở tab — render lại không được làm số ngày nhảy.
  const [now] = useState(() => Date.now());
  const daysLeft = plan.endsAt
    ? Math.max(0, Math.ceil((new Date(plan.endsAt).getTime() - now) / DAY_MS))
    : null;

  const subscriptionColumns: DataTableColumn<SubscriptionRow>[] = [
    {
      title: t('columns.period'),
      key: 'period',
      width: 200,
      render: (_, row) => `${fmt.date(row.startsAt)} – ${fmt.date(row.endsAt)}`,
    },
    { title: t('columns.plan'), key: 'plan', width: 160, render: (_, row) => row.planName },
    {
      title: t('columns.price'),
      key: 'price',
      width: 140,
      align: 'right',
      render: (_, row) => fmt.money(row.price),
    },
    {
      title: t('columns.status'),
      key: 'status',
      width: 140,
      render: (_, row) =>
        new Date(row.endsAt).getTime() < now ? (
          <Tag>{t('expired')}</Tag>
        ) : (
          domainLabel('subscriptionStatus', row.status)
        ),
    },
  ];

  const invoiceColumns: DataTableColumn<InvoiceRow>[] = [
    { title: t('columns.code'), key: 'code', width: 120, render: (_, row) => row.code },
    {
      title: t('columns.period'),
      key: 'period',
      width: 200,
      render: (_, row) => `${fmt.date(row.periodFrom)} – ${fmt.date(row.periodTo)}`,
    },
    {
      title: t('columns.total'),
      key: 'total',
      width: 130,
      align: 'right',
      render: (_, row) => fmt.money(row.totalAmount),
    },
    {
      title: t('columns.status'),
      key: 'status',
      width: 150,
      render: (_, row) => (
        <StatusTag
          value={row.status as SubscriptionInvoiceStatus}
          meta={SUBSCRIPTION_INVOICE_STATUS_META}
          group="subscriptionInvoiceStatus"
        />
      ),
    },
    {
      title: t('columns.paidAt'),
      key: 'paidAt',
      width: 130,
      render: (_, row) => (row.paidAt ? fmt.date(row.paidAt) : '—'),
    },
  ];

  // Mốc quan trọng — dựng từ lịch sử gói đã tải, không phải một nguồn thứ hai.
  const milestones = [
    { key: 'joined', at: joinedAt, label: t('milestones.joined') },
    ...[...billing.subscriptions].reverse().map((sub) => ({
      key: sub.id,
      at: sub.startsAt,
      label: t('milestones.started', { plan: sub.planName }),
    })),
    ...(plan.endsAt ? [{ key: 'renewal', at: plan.endsAt, label: t('milestones.renewal') }] : []),
  ];

  return (
    <div className={styles.tabBody}>
      <div className={cx(styles.banner)}>
        <LockOutlined className={styles.bannerIcon} />
        <span>{t('permissionNote')}</span>
      </div>

      <div className={styles.halves}>
        <DashboardPanel title={t('plan.title')} icon={<CrownOutlined />} empty={t('plan.none')}>
          {plan.planName ? (
            <KeyValues
              items={[
                { key: 'name', label: t('plan.name'), value: <strong>{plan.planName}</strong> },
                {
                  key: 'phase',
                  label: t('plan.phase'),
                  value: domainLabel('billingPhase', plan.phase),
                },
                {
                  key: 'term',
                  label: t('plan.term'),
                  value:
                    billing.termStartsAt && plan.endsAt
                      ? `${fmt.date(billing.termStartsAt)} – ${fmt.date(plan.endsAt)}`
                      : '—',
                },
                {
                  key: 'renewal',
                  label: t('plan.renewal'),
                  value: daysLeft !== null ? t('plan.daysLeft', { days: daysLeft }) : '—',
                },
              ]}
            />
          ) : null}
        </DashboardPanel>

        <DashboardPanel title={t('quota.title')} icon={<BarChartOutlined />}>
          <div className={styles.progress}>
            {(
              [
                ['vehicles', quota.vehicles],
                ['branches', quota.branches],
                ['members', quota.members],
              ] as const
            ).map(([key, item]) => (
              // Ba trạng thái do server quyết (có trần / không giới hạn / không áp dụng) — không suy
              // "không giới hạn" từ một `limit` rỗng.
              <div key={key} className={styles.quotaRow}>
                <span>{t(`quota.${key}`)}</span>
                <QuotaValue quota={item} />
              </div>
            ))}
            <span className={styles.small}>{t('quota.features')}</span>
            <div className={styles.featureList}>
              {billing.features.map((feature) => (
                <Tag
                  key={feature.feature}
                  color={
                    feature.state === FEATURE_STATE.ENABLED
                      ? 'success'
                      : feature.state === FEATURE_STATE.READ_ONLY
                        ? 'warning'
                        : undefined
                  }
                >
                  {domainLabel('planFeature', feature.feature)} ·{' '}
                  {domainLabel('featureState', feature.state)}
                </Tag>
              ))}
            </div>
          </div>
        </DashboardPanel>
      </div>

      <div className={styles.halves}>
        <DashboardPanel title={t('fee.title')} icon={<FileTextOutlined />} empty={t('fee.none')}>
          {billing.feePolicy ? (
            <KeyValues
              items={[
                {
                  key: 'fee',
                  label: t('fee.serviceFee'),
                  value: t('fee.percent', { value: Number(billing.feePolicy.serviceFeePercent) }),
                },
                { key: 'version', label: t('fee.version'), value: billing.feePolicy.version },
                {
                  key: 'from',
                  label: t('fee.effectiveFrom'),
                  value: billing.feePolicy.effectiveFrom
                    ? fmt.date(billing.feePolicy.effectiveFrom)
                    : '—',
                },
                {
                  key: 'note',
                  label: t('fee.noteLabel'),
                  value: <span className={styles.muted}>{t('fee.note')}</span>,
                },
              ]}
            />
          ) : null}
        </DashboardPanel>

        <DashboardPanel title={t('invoices.statusTitle')} icon={<FileDoneOutlined />}>
          <div className={styles.stack}>
            <div className={styles.halves}>
              <StatCard
                label={t('invoices.unpaid')}
                value={invoiceStatus.unpaid}
                icon={FileTextOutlined}
                tone="blue"
              />
              <StatCard
                label={t('invoices.dueSoon')}
                value={invoiceStatus.dueSoon}
                icon={CalendarOutlined}
                tone="gold"
              />
              <StatCard
                label={t('invoices.overdue')}
                value={invoiceStatus.overdue}
                icon={WarningOutlined}
                tone="red"
                danger={invoiceStatus.overdue > 0}
              />
            </div>
            <span className={styles.small}>
              {t('invoices.nextDue')}:{' '}
              {invoiceStatus.nextDueAt ? fmt.date(invoiceStatus.nextDueAt) : t('invoices.noneDue')}
            </span>
          </div>
        </DashboardPanel>
      </div>

      <div className={styles.columns}>
        <div className={styles.stack}>
          <DashboardPanel title={t('history.subscriptions')} icon={<HistoryOutlined />}>
            <DataTable<SubscriptionRow>
              label={t('history.subscriptions')}
              columns={subscriptionColumns}
              items={billing.subscriptions}
              minWidth={640}
              empty={{ title: t('history.subscriptionsEmpty') }}
            />
          </DashboardPanel>
          <DashboardPanel title={t('history.invoices')} icon={<FileDoneOutlined />}>
            <DataTable<InvoiceRow>
              label={t('history.invoices')}
              columns={invoiceColumns}
              items={billing.invoices}
              minWidth={700}
              empty={{ title: t('history.invoicesEmpty') }}
            />
          </DashboardPanel>
        </div>
        <DashboardPanel title={t('milestones.title')} icon={<ExclamationCircleOutlined />}>
          <ul className={styles.timeline}>
            {milestones.map((item) => (
              <li key={item.key}>
                <span className={styles.muted}>{fmt.date(item.at)}</span>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </DashboardPanel>
      </div>
    </div>
  );
}
