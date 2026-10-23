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
  SUBSCRIPTION_TERM_STATE,
  SUBSCRIPTION_TERM_STATE_META,
  daysLeftUntil,
  planVehicleScopeOf,
  type SubscriptionInvoiceStatus,
  type SubscriptionTermState,
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
import { KeyValues, QuotaValue, VehicleQuotaByType, useTabState } from './parts';
import styles from './PartnerDetail.module.css';

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
  const tPlanScope = useTranslations('AdminTenants.partnerDetail.quota');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { plan, quota, invoiceStatus } = billing;
  // "Bây giờ" chốt MỘT lần mỗi lần mở tab — render lại không được làm số ngày nhảy.
  const [now] = useState(() => Date.now());
  const daysLeft = plan.endsAt ? daysLeftUntil(plan.endsAt, now) : null;

  const subscriptionColumns: DataTableColumn<SubscriptionRow>[] = [
    {
      title: t('columns.period'),
      key: 'period',
      width: 200,
      render: (_, row) => `${fmt.date(row.startsAt)} – ${fmt.date(row.endsAt)}`,
    },
    {
      title: t('columns.plan'),
      key: 'plan',
      width: 200,
      // Phạm vi loại xe của kỳ (ADR 0065) — hai kỳ cùng tên bậc "5 xe" phải phân biệt được.
      render: (_, row) =>
        `${row.planName} · ${tPlanScope(`scope.${planVehicleScopeOf(row.vehicleScope)}`)}`,
    },
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
      // Trạng thái KỲ, không phải `status` lưu trong DB: kỳ đã xếp lịch cũng là `active` ở DB, in
      // thẳng ra là thành "hai gói cùng hiệu lực" (ADR 0010 điều 2).
      render: (_, row) => (
        <StatusTag
          value={row.termState as SubscriptionTermState}
          meta={SUBSCRIPTION_TERM_STATE_META}
          group="subscriptionTermState"
        />
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
    ...[...billing.subscriptions]
      .reverse()
      // Kỳ bị huỷ khi CHƯA bắt đầu chưa từng là một mốc — bỏ khỏi dòng thời gian.
      .filter(
        (sub) =>
          (sub.termState as SubscriptionTermState) !== SUBSCRIPTION_TERM_STATE.CANCELLED ||
          new Date(sub.startsAt).getTime() <= now,
      )
      .map((sub) => ({
        key: sub.id,
        at: sub.startsAt,
        label:
          (sub.termState as SubscriptionTermState) === SUBSCRIPTION_TERM_STATE.SCHEDULED
            ? t('milestones.scheduled', { plan: sub.planName })
            : t('milestones.started', { plan: sub.planName }),
      })),
    ...(plan.endsAt
      ? [
          {
            key: 'renewal',
            at: plan.endsAt,
            label: plan.nextTerm ? t('milestones.renewed') : t('milestones.renewal'),
          },
        ]
      : []),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

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
                /*
                 * Phạm vi loại xe đang có kỳ gói (ADR 0065) — gian hàng có thể chạy song song gói xe
                 * máy và gói ô tô; tên ở trên chỉ là kỳ ưu tiên.
                 */
                ...(plan.packageScopes.length > 0
                  ? [
                      {
                        key: 'scopes',
                        label: t('plan.scopes'),
                        value: plan.packageScopes
                          .map((scope) => tPlanScope(`scope.${planVehicleScopeOf(scope)}`))
                          .join(', '),
                      },
                    ]
                  : []),
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
                {
                  key: 'next',
                  label: t('plan.next'),
                  value: plan.nextTerm
                    ? t('plan.nextValue', {
                        plan: plan.nextTerm.planName,
                        from: fmt.date(plan.nextTerm.startsAt),
                        to: fmt.date(plan.nextTerm.endsAt),
                      })
                    : t('plan.noNext'),
                },
              ]}
            />
          ) : null}
        </DashboardPanel>

        <DashboardPanel title={t('quota.title')} icon={<BarChartOutlined />}>
          <div className={styles.progress}>
            {/*
              Trần xe THEO LOẠI (ADR 0065) rồi trần nhân sự. Không còn dòng chi nhánh — trần chi
              nhánh thôi là hạn mức (ADR 0065 điều 1). Các trạng thái do server quyết (có trần /
              không giới hạn / không áp dụng / chưa có gói) — không suy từ một `limit` rỗng.
            */}
            <div className={styles.quotaRow}>
              <span>{t('quota.vehicles')}</span>
              <VehicleQuotaByType quotas={quota.vehiclesByType} />
            </div>
            <div className={styles.quotaRow}>
              <span>{t('quota.members')}</span>
              <QuotaValue quota={quota.members} />
            </div>
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
