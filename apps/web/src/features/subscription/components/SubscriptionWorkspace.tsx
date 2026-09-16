'use client';

import { CreditCardOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Progress, Spin, Tag } from 'antd';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  BILLING_MODE,
  SUBSCRIPTION_INVOICE_STATUS,
  SUBSCRIPTION_INVOICE_STATUS_META,
  type SubscriptionInvoiceStatus,
} from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { useUrlFilters, positiveIntParam } from '@/hooks/use-url-filters';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { InvoicePaymentPanel } from './InvoicePaymentPanel';
import { PlanFeatureList } from './PlanFeatureList';
import { PurchaseModal } from './PurchaseModal';
import { useMySubscription, useSubscriptionInvoices } from '../hooks/use-subscription';
import type { SlotUsage, SubscriptionInvoice } from '../types';
import styles from './SubscriptionWorkspace.module.css';

const INVOICE_TABLE_MIN_WIDTH = 760;

/**
 * "Gói của tôi" (W2, ADR 0015/0026): gói hiện hành + mức dùng chỗ theo loại xe + lượt miễn phí
 * + lịch sử hoá đơn + mua/gia hạn. Người dùng KHÔNG được bất ngờ ở đơn thứ ba — lượt miễn phí
 * và điều gì xảy ra khi hết đứng ngay đầu trang.
 *
 * Dựng ở CẢ HAI khu: `/manage/subscription` cho gian hàng và `/account/subscription` cho chủ xe
 * tuyến hoa hồng. Đây là phễu nâng cấp từ tuyến hoa hồng lên tuyến gian hàng (ADR 0028 điều 1),
 * nên nó BẮT BUỘC phải với tới được từ khu tài khoản — chặn `/manage` mà để màn mua gói nằm lại
 * bên trong là cắt đứt chính đường người dùng đi để trả tiền.
 *
 * Tiêu đề đi vào bằng prop `header` thay vì tự dựng: hai khu có hai component tiêu đề khác nhau
 * (`ManagePageHeader` / `AccountPageHeader`), và mỗi trang chỉ được có đúng một `h1`.
 */
export function SubscriptionWorkspace({ header }: { header: ReactNode }) {
  const t = useTranslations('Subscription');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const me = useMySubscription();
  const { filters, setFilters } = useUrlFilters((params) => ({
    page: positiveIntParam(params, 'page') ?? 1,
  }));
  const invoices = useSubscriptionInvoices(filters.page);

  /*
   * Hoá đơn đang chờ tiền — mỗi tenant chỉ giữ MỘT (purchase void hoá đơn issued cũ trong cùng
   * transaction) và nó luôn mới nhất, nên tìm trong trang hiện tại là đủ: rời trang 1 thì banner
   * tự ẩn, quay lại trang 1 là thấy. Đây là đường quay lại QR sau khi đóng modal mua.
   */
  const pendingInvoice = invoices.data?.items.find(
    (inv) =>
      inv.status === SUBSCRIPTION_INVOICE_STATUS.ISSUED ||
      inv.status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID,
  );
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  const invoiceColumns: DataTableColumn<SubscriptionInvoice>[] = [
    {
      title: t('invoices.columns.code'),
      key: 'code',
      width: 160,
      render: (_, inv) => (
        <span className={styles.codeCell}>
          <span className={styles.code}>{inv.code}</span>
          <CopyButton value={inv.code} label={t('invoices.copyCode')} />
        </span>
      ),
    },
    {
      title: t('invoices.columns.period'),
      key: 'period',
      width: 200,
      render: (_, inv) => `${fmt.date(inv.periodFrom)} → ${fmt.date(inv.periodTo)}`,
    },
    {
      title: t('invoices.columns.total'),
      key: 'total',
      align: 'right',
      width: 130,
      render: (_, inv) => fmt.money(inv.totalAmount),
    },
    {
      title: t('invoices.columns.status'),
      key: 'status',
      width: 140,
      render: (_, inv) => (
        <StatusTag
          value={inv.status as SubscriptionInvoiceStatus}
          meta={SUBSCRIPTION_INVOICE_STATUS_META}
          group="subscriptionInvoiceStatus"
        />
      ),
    },
    {
      title: t('invoices.columns.createdAt'),
      key: 'createdAt',
      width: 130,
      render: (_, inv) => fmt.date(inv.createdAt),
    },
  ];

  if (me.isLoading) {
    return (
      <div>
        {header}
        <div className={styles.center}>
          <Spin />
        </div>
      </div>
    );
  }

  if (me.isError || !me.data) {
    return (
      <div>
        {header}
        <Alert
          type="error"
          showIcon
          title={t('page.loadError')}
          action={
            <Button size="small" onClick={() => void me.refetch()}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      </div>
    );
  }

  const { currentPlan, usage, fleetQuota, freeTrips } = me.data;
  const isCommission = currentPlan?.billingMode === BILLING_MODE.COMMISSION;

  return (
    <div>
      {header}

      <div className={styles.cards}>
        <Card
          size="small"
          title={
            <span className={styles.cardTitle}>
              <CreditCardOutlined /> {t('current.title')}
            </span>
          }
          extra={
            <Button type="primary" size="small" onClick={() => setPurchaseOpen(true)}>
              {currentPlan ? t('current.renewButton') : t('current.purchaseButton')}
            </Button>
          }
        >
          {currentPlan ? (
            <>
              <div className={styles.planName}>
                {currentPlan.planName}
                {currentPlan.billingMode ? (
                  <Tag className={styles.modeTag}>
                    {domainLabel('billingMode', currentPlan.billingMode)}
                  </Tag>
                ) : null}
              </div>
              <div className={styles.meta}>
                {t('current.expires', { date: fmt.date(currentPlan.endsAt) })}
                {currentPlan.slots
                  ? ` · ${t('current.slotsSummary', {
                      car: currentPlan.slots.car,
                      motorbike: currentPlan.slots.motorbike,
                    })}`
                  : ''}
              </div>
              <div className={styles.meta}>
                {isCommission
                  ? t('current.commissionSummary', {
                      percent: currentPlan.commissionPercent ?? 0,
                    })
                  : t('current.packageSummary')}
              </div>
            </>
          ) : (
            <>
              <div className={styles.planName}>{t('current.none')}</div>
              <div className={styles.meta}>{t('current.noneHint')}</div>
            </>
          )}
        </Card>

        <Card size="small" title={t('usage.title')}>
          {/*
            Owner Lite có trần TỔNG (ô tô + xe máy), tuyến gói có hạn mức theo LOẠI. Hai luật
            khác nhau nên hai cách vẽ khác nhau — nhét trần tổng vào thanh tiến trình của từng
            loại là màn hình nói "3 ô tô" trong khi backend chặn ở "3 xe", và người dùng sẽ đăng
            đủ 3 ô tô rồi ngạc nhiên vì chiếc xe máy đầu tiên bị từ chối.
          */}
          {fleetQuota.kind === 'total' && fleetQuota.totalLimit != null ? (
            <FleetTotalRow used={fleetQuota.totalUsed} limit={fleetQuota.totalLimit} />
          ) : null}
          <UsageRow label={t('usage.car')} usage={usage.car} />
          <UsageRow label={t('usage.motorbike')} usage={usage.motorbike} />
        </Card>

        <Card size="small" title={t('freeTrips.title')}>
          <div className={styles.freeTripsLeft}>{t('freeTrips.left', { left: freeTrips.left })}</div>
          <div className={styles.meta}>
            {t('freeTrips.used', { used: freeTrips.used, allowance: freeTrips.allowance })}
          </div>
          <div className={styles.meta}>{t('freeTrips.explain')}</div>
        </Card>

        {/* "Nâng cấp được thêm gì" — ADR 0027 §Hệ quả: chỗ bán hàng thật sự của màn này. */}
        <PlanFeatureList onUpgrade={() => setPurchaseOpen(true)} />
      </div>

      {pendingInvoice ? (
        <Card size="small" className={styles.pendingCard} title={t('payment.pendingTitle')}>
          <InvoicePaymentPanel invoice={pendingInvoice} />
        </Card>
      ) : null}

      <h2 className={styles.sectionTitle}>{t('invoices.title')}</h2>
      <DataTable<SubscriptionInvoice>
        label={t('invoices.title')}
        columns={invoiceColumns}
        items={invoices.data?.items ?? []}
        minWidth={INVOICE_TABLE_MIN_WIDTH}
        loading={invoices.isFetching}
        error={
          invoices.isError && !invoices.data
            ? { title: t('invoices.loadError'), onRetry: () => void invoices.refetch() }
            : null
        }
        empty={{ title: t('invoices.empty') }}
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

      <PurchaseModal open={purchaseOpen} onClose={() => setPurchaseOpen(false)} />
    </div>
  );
}

/**
 * Trần TỔNG của Owner Lite — một dòng riêng, đứng TRÊN hai dòng theo loại.
 *
 * Nó phải đứng trước vì nó là ràng buộc CHẶT hơn: hai dòng dưới sẽ hiện "Không giới hạn" cho
 * từng loại (đúng — không có hạn mức theo loại nào), và nếu chỉ có hai dòng đó thì màn hình nói
 * ngược hẳn với thứ backend làm.
 */
function FleetTotalRow({ used, limit }: { used: number; limit: number }) {
  const t = useTranslations('Subscription');
  return (
    <div className={styles.usageRow}>
      <div className={styles.usageHead}>
        <span>{t('usage.fleetTotal')}</span>
        <span className={styles.meta}>{t('usage.ofLimit', { used, limit })}</span>
      </div>
      <Progress
        percent={Math.min(100, Math.round((used / limit) * 100))}
        size="small"
        showInfo={false}
        status={used >= limit ? 'exception' : 'normal'}
      />
      <div className={styles.metaSmall}>{t('usage.fleetTotalHint', { limit })}</div>
    </div>
  );
}

/** Một dòng mức dùng chỗ: đội xe / trên chợ so với hạn mức (null = không giới hạn). */
function UsageRow({ label, usage }: { label: string; usage: SlotUsage }) {
  const t = useTranslations('Subscription');
  const limit = usage.limit;

  return (
    <div className={styles.usageRow}>
      <div className={styles.usageHead}>
        <span>{label}</span>
        <span className={styles.meta}>
          {limit == null
            ? `${usage.used} · ${t('usage.unlimited')}`
            : t('usage.ofLimit', { used: usage.used, limit })}
        </span>
      </div>
      {limit != null && limit > 0 ? (
        <Progress
          percent={Math.min(100, Math.round((usage.used / limit) * 100))}
          size="small"
          showInfo={false}
          status={usage.used >= limit ? 'exception' : 'normal'}
        />
      ) : null}
      <div className={styles.metaSmall}>
        {t('usage.fleet')}: {usage.used} · {t('usage.onMarketplace')}: {usage.onMarketplace}
      </div>
    </div>
  );
}
