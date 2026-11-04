'use client';

import {
  EditOutlined,
  InboxOutlined,
  MoreOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { App, Alert, Button, Dropdown, Result, Skeleton, Space, Tabs, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PERMISSION, TENANT_CUSTOMER_RISK_LEVEL } from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { ToneDotBadge } from '@/components/data-display/StatusBadge';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ROUTES } from '@/constants/routes';
import { useIsDesktop } from '@/hooks/use-media-query';
import { usePermissions } from '@/hooks/use-permissions';
import { cx } from '@/lib/cx';
import { isZeroMoney } from '@/lib/money';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { useAppFormat } from '@/i18n/use-app-format';
import { customerStatusOf } from '../constants';
import { useCustomer, useSetCustomerArchived } from '../hooks/use-customers';
import { CustomerBookingHistory } from './CustomerBookingHistory';
import { CustomerDocumentsPanel } from './CustomerDocumentsPanel';
import { CustomerFormModal } from './CustomerFormModal';
import { CustomerRiskModal } from './CustomerRiskModal';
import { CustomerFinanceTab } from './detail/CustomerFinanceTab';
import { CustomerOverviewTab } from './detail/CustomerOverviewTab';
import { CustomerProfileCard } from './detail/CustomerProfileCard';
import styles from './detail/CustomerDetail.module.css';

/** Nhãn kèm biểu tượng giải thích — icon NGOÀI ô số, không chồng lên nội dung. */
function LabelWithHint({ label, hint }: { label: string; hint: string }) {
  return (
    <span className={styles.labelWithHint}>
      {label}
      <Tooltip title={hint}>
        <InfoCircleOutlined className={styles.hintIcon} aria-label={hint} />
      </Tooltip>
    </span>
  );
}

/**
 * Hồ sơ khách — route THẬT (`/customers/[id]`), Figma Partner-XePrime `23777:54975` ·
 * `23797:54015` · `23797:55706` · `23797:62633` (02/11/2026).
 *
 * Vì sao là trang: hồ sơ được gửi cho nhau, mở lại nhiều lần trong ngày, F5 không được mất chỗ.
 *
 * Đầu trang: tên + nhãn + SĐT + nguồn; "Sửa hồ sơ" · "Tạo đơn thuê"; Mức rủi ro và Lưu trữ/Khôi
 * phục vào menu "…" (chốt 02/11). Bốn tab: Tổng quan (có "Ghi chú vận hành" — tab Ghi chú cũ) ·
 * Lịch sử thuê · Thu chi · Giấy tờ. Ô tiền BIẾN MẤT khi thiếu `finance.view` — không số 0 giả.
 */
export function CustomerDetailView({
  customerId,
  embedded = false,
}: {
  customerId: string;
  /** Đang nằm TRONG một overlay — tắt vỏ trang (h1 + nút quay lại), giữ mọi thứ khác. */
  embedded?: boolean;
}) {
  const t = useTranslations('Customers');
  const tProfile = useTranslations('Customers.profile');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const { message } = App.useApp();
  const { has } = usePermissions();
  const isDesktop = useIsDesktop();

  const canView = has(PERMISSION.CUSTOMER_VIEW);
  const canManage = has(PERMISSION.CUSTOMER_MANAGE);
  const canManageRisk = has(PERMISSION.CUSTOMER_MANAGE_RISK);
  const canViewFinance = has(PERMISSION.FINANCE_VIEW);
  const canViewBookings = has(PERMISSION.BOOKING_VIEW);
  const canCreateBooking = has(PERMISSION.BOOKING_CREATE);
  const canManageDocuments = has(PERMISSION.CUSTOMER_DOCUMENT_MANAGE);
  const canViewDocumentFiles = has(PERMISSION.CUSTOMER_DOCUMENT_FILE_VIEW);
  // Ghi chú + giấy tờ là sổ RIÊNG của gian hàng — phiên hỗ trợ không mở (ADR 0050 §10).
  const showPrivateTabs = !useSupportHides(SUPPORT_HIDDEN_AREA.CUSTOMER_PRIVATE);

  const { data, isLoading, isError, error, refetch, isFetching } = useCustomer(
    canView ? customerId : null,
  );
  const setArchived = useSetCustomerArchived();
  const [editOpen, setEditOpen] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const back = () => router.push(ROUTES.MANAGE.CUSTOMERS);

  if (!canView) {
    return (
      <div className={styles.page}>
        <ManagePageHeader title={t('page.listTitle')} onBack={back} />
        <Result status="403" title={t('permission.title')} subTitle={t('permission.description')} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.page}>
        <ManagePageHeader title={t('detail.title')} onBack={back} />
        <Skeleton active avatar paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={styles.page}>
        <ManagePageHeader title={t('detail.title')} onBack={back} />
        <Result
          status="warning"
          title={t('detail.errorTitle')}
          subTitle={error ? errorMessage(error) : undefined}
          extra={
            <Space>
              <Button onClick={() => void refetch()} loading={isFetching}>
                {tCommon('actions.retry')}
              </Button>
              <Button type="primary" onClick={back}>
                {t('detail.backToList')}
              </Button>
            </Space>
          }
        />
      </div>
    );
  }

  const archived = Boolean(data.archivedAt);
  const blocked = data.riskLevel === TENANT_CUSTOMER_RISK_LEVEL.BLOCKED;
  const watchlist = data.riskLevel === TENANT_CUSTOMER_RISK_LEVEL.WATCHLIST;
  const status = customerStatusOf(data, canViewFinance);

  function toggleArchived() {
    setArchived.mutate(
      { id: customerId, archived: !archived },
      {
        onSuccess: () => message.success(archived ? t('actions.restored') : t('actions.archived')),
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  const moreItems = [
    ...(canManageRisk
      ? [
          {
            key: 'risk',
            icon: <SafetyCertificateOutlined />,
            label: t('actions.risk'),
            danger: blocked,
            onClick: () => setRiskOpen(true),
          },
        ]
      : []),
    ...(canManage
      ? [
          {
            key: 'archive',
            icon: archived ? <UndoOutlined /> : <InboxOutlined />,
            label: archived ? t('actions.restore') : t('actions.archive'),
            disabled: setArchived.isPending,
            onClick: toggleArchived,
          },
        ]
      : []),
  ];

  const actions = (
    <Space wrap>
      {canManage ? (
        <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)} disabled={archived}>
          {t('actions.edit')}
        </Button>
      ) : null}
      {canCreateBooking ? (
        <Tooltip title={blocked ? t('actions.createBookingBlocked') : undefined}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={blocked || archived}
            // Điều hướng sang luồng đơn thuê đã có, mang tên + SĐT — không dựng form tạo đơn thứ hai.
            onClick={() =>
              router.push(
                `${ROUTES.MANAGE.BOOKINGS}?create=1&customerName=${encodeURIComponent(
                  data.fullName,
                )}&customerPhone=${encodeURIComponent(data.phone)}`,
              )
            }
          >
            {t('actions.createBooking')}
          </Button>
        </Tooltip>
      ) : null}
      {moreItems.length > 0 ? (
        <Dropdown trigger={['click']} menu={{ items: moreItems }}>
          <Button icon={<MoreOutlined />} aria-label={tProfile('more')} />
        </Dropdown>
      ) : null}
    </Space>
  );

  const titleNode = (
    <span className={styles.titleRow}>
      {data.fullName}
      <ToneDotBadge color={status.color}>
        {status.key === 'unclassified'
          ? t('card.unclassified')
          : dl('tenantCustomerRelationship', status.key)}
      </ToneDotBadge>
    </span>
  );
  const subtitle = (
    <span className={styles.headerSub}>
      <a href={`tel:${data.phone}`} className={styles.phoneLink}>
        {data.phone}
      </a>
      <CopyButton value={data.phone} label={t('detail.copyPhone')} />
      <span className={styles.muted}>{dl('tenantCustomerSource', data.source)}</span>
    </span>
  );

  const kpis: { key: string; label: React.ReactNode; value: React.ReactNode; danger?: boolean }[] = [
    { key: 'completed', label: t('stats.completed'), value: data.completedRentalCount },
    { key: 'active', label: t('stats.active'), value: data.activeBookingCount },
    ...(canViewFinance
      ? [
          { key: 'total', label: t('stats.totalValue'), value: fmt.money(data.totalBookingAmount) },
          { key: 'paid', label: t('stats.paid'), value: fmt.money(data.paidAmount) },
          {
            key: 'debt',
            label: <LabelWithHint label={t('stats.debt')} hint={t('hints.debt')} />,
            value: fmt.money(data.debtAmount),
            danger: !isZeroMoney(data.debtAmount),
          },
        ]
      : []),
    {
      key: 'noShow',
      label: t('stats.noShowLate'),
      value: `${data.noShowCount} / ${data.lateReturnCount}`,
      danger: data.noShowCount > 0 || data.lateReturnCount > 0,
    },
    {
      key: 'last',
      label: t('stats.lastRental'),
      value: data.lastRentalAt ? fmt.date(data.lastRentalAt) : '—',
    },
  ];

  const profileCard = <CustomerProfileCard customer={data} canViewFinance={canViewFinance} />;

  return (
    <div className={embedded ? styles.embedded : styles.page}>
      {embedded ? (
        <div className={styles.embeddedHeader}>
          {subtitle}
          {actions}
        </div>
      ) : (
        <ManagePageHeader title={titleNode} subtitle={subtitle} onBack={back} extra={actions} />
      )}

      {archived ? (
        <Alert
          type="info"
          showIcon
          title={t('detail.archivedBannerTitle')}
          description={t('detail.archivedBannerBody')}
        />
      ) : null}
      {blocked || watchlist ? (
        <Alert
          type={blocked ? 'error' : 'warning'}
          showIcon
          title={blocked ? t('detail.blockedBannerTitle') : t('detail.watchlistBannerTitle')}
          description={
            <>
              {data.riskReason ? <div>{data.riskReason}</div> : null}
              <div className={styles.muted}>
                {blocked ? t('detail.blockedBannerBody') : t('detail.watchlistBannerBody')}
              </div>
            </>
          }
        />
      ) : null}

      <section className={styles.kpis} aria-label={t('summary.ariaLabel')}>
        {kpis.map((kpi) => (
          <div key={kpi.key} className={styles.kpi}>
            <span className={styles.kpiLabel}>{kpi.label}</span>
            <b className={cx(styles.kpiValue, kpi.danger && styles.kpiDanger)}>{kpi.value}</b>
          </div>
        ))}
      </section>

      <div className={styles.body}>
        <div className={styles.main}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            className={styles.tabs}
            items={[
              {
                key: 'overview',
                label: t('tabs.overview'),
                children: (
                  <div className={styles.tabStack}>
                    {isDesktop ? null : profileCard}
                    <CustomerOverviewTab
                      customer={data}
                      canViewBookings={canViewBookings}
                      canViewFinance={canViewFinance}
                      canManage={canManage}
                      showNotes={showPrivateTabs}
                    />
                  </div>
                ),
              },
              ...(canViewBookings
                ? [
                    {
                      key: 'history',
                      label: t('tabs.history'),
                      children: (
                        <CustomerBookingHistory
                          customerId={customerId}
                          canViewFinance={canViewFinance}
                          canOpenBooking={canViewBookings}
                        />
                      ),
                    },
                  ]
                : []),
              ...(canViewFinance
                ? [
                    {
                      key: 'finance',
                      label: t('tabs.finance'),
                      children: (
                        <CustomerFinanceTab customerId={customerId} canViewBookings={canViewBookings} />
                      ),
                    },
                  ]
                : []),
              ...(showPrivateTabs
                ? [
                    {
                      key: 'documents',
                      label: t('tabs.documents'),
                      children: (
                        <div className={styles.docsCard}>
                          <CustomerDocumentsPanel
                            customerId={customerId}
                            canManage={canManageDocuments}
                            canViewFiles={canViewDocumentFiles}
                            disabled={archived}
                          />
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </div>
        {isDesktop ? <div className={styles.side}>{profileCard}</div> : null}
      </div>

      <CustomerFormModal open={editOpen} customer={data} onClose={() => setEditOpen(false)} />
      <CustomerRiskModal open={riskOpen} customer={data} onClose={() => setRiskOpen(false)} />
    </div>
  );
}
