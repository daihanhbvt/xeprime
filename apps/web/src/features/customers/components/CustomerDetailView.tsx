'use client';

import {
  EditOutlined,
  FileAddOutlined,
  InboxOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { App, Alert, Button, Result, Skeleton, Space, Tabs, Tag, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  PERMISSION,
  TENANT_CUSTOMER_RISK_LEVEL,
  TENANT_CUSTOMER_RISK_LEVEL_META,
  type TenantCustomerRiskLevel,
} from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ROUTES } from '@/constants/routes';
import { CustomerReceiptsPanel } from './CustomerReceiptsPanel';
import { useIsDesktop } from '@/hooks/use-media-query';
import { usePermissions } from '@/hooks/use-permissions';
import { isZeroMoney } from '@/lib/money';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useCustomer, useSetCustomerArchived } from '../hooks/use-customers';
import { CustomerBookingHistory } from './CustomerBookingHistory';
import { CustomerDocumentsPanel } from './CustomerDocumentsPanel';
import { CustomerFormModal } from './CustomerFormModal';
import { CustomerNotesPanel } from './CustomerNotesPanel';
import { CustomerRiskModal } from './CustomerRiskModal';
import styles from './CustomerDetailView.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

/** Nhãn kèm biểu tượng giải thích — icon NGOÀI ô nhập, không chồng lên nội dung. */
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

function SummaryCard({
  label,
  value,
  danger,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className={styles.summaryCard}>
      <div className={styles.summaryLabel}>{label}</div>
      <div className={danger ? styles.summaryValueDanger : styles.summaryValue}>{value}</div>
    </div>
  );
}

/**
 * Hồ sơ khách — route THẬT (`/manage/customers/[id]`), không phải drawer.
 *
 * Vì sao là trang: một hồ sơ khách được gửi cho nhau ("xem giúp anh khách này"), mở lại nhiều
 * lần trong ngày, và F5 không được mất chỗ. Cùng lý do với chi tiết đơn thuê (Wave 10).
 *
 * Ba khối tiền BIẾN MẤT hoàn toàn khi thiếu `finance.view` — không render số 0 giả.
 */
export function CustomerDetailView({
  customerId,
  embedded = false,
}: {
  customerId: string;
  /**
   * Đang nằm TRONG một overlay (modal hồ sơ khách) chứ không phải một route.
   *
   * Chỉ tắt phần VỎ TRANG: tiêu đề `<h1>` và nút quay-lại-danh-sách. Modal đã có tiêu đề của
   * riêng nó, và một `<h1>` thứ hai trong dialog làm hỏng cấu trúc heading của trang nền; còn
   * nút "quay lại" trong modal thì điều hướng cả trang ra khỏi chỗ người dùng đang đứng.
   * Mọi thứ còn lại — tag rủi ro, hành động, các tab — giữ nguyên.
   */
  embedded?: boolean;
}) {
  const t = useTranslations('Customers');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();

  const router = useRouter();
  const { message } = App.useApp();
  const { has } = usePermissions();
  // Thẻ hồ sơ render ĐÚNG MỘT lần trong DOM: cột phụ ở desktop, trong tab Tổng quan ở nơi hẹp.
  // Dựng hai bản rồi ẩn một bằng CSS thì trình đọc màn hình đọc lặp toàn bộ thông tin liên hệ.
  const isDesktop = useIsDesktop();

  const canView = has(PERMISSION.CUSTOMER_VIEW);
  const canManage = has(PERMISSION.CUSTOMER_MANAGE);
  const canManageRisk = has(PERMISSION.CUSTOMER_MANAGE_RISK);
  const canViewFinance = has(PERMISSION.FINANCE_VIEW);
  const canViewBookings = has(PERMISSION.BOOKING_VIEW);
  const canCreateBooking = has(PERMISSION.BOOKING_CREATE);
  const canManageDocuments = has(PERMISSION.CUSTOMER_DOCUMENT_MANAGE);
  const canViewDocumentFiles = has(PERMISSION.CUSTOMER_DOCUMENT_FILE_VIEW);

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
        <ManagePageHeader title={t('page.title')} onBack={back} />
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

  function toggleArchived() {
    setArchived.mutate(
      { id: customerId, archived: !archived },
      {
        onSuccess: () =>
          message.success(archived ? t('actions.restored') : t('actions.archived')),
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  const actions = (
    <Space wrap>
      {canManage ? (
        <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)} disabled={archived}>
          {t('actions.edit')}
        </Button>
      ) : null}
      {canCreateBooking ? (
        <Tooltip
          title={blocked ? t('actions.createBookingBlocked') : undefined}
        >
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={blocked || archived}
            /*
             * KHÔNG dựng lại form tạo đơn ở đây: điều hướng sang luồng đơn thuê đã có, mang theo
             * tên + SĐT để nhân viên không phải gõ lại. Một form tạo đơn thứ hai là hai bộ luật
             * giá/lịch sẽ trôi khỏi nhau.
             */
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
      {canManage ? (
        <Button icon={<FileAddOutlined />} onClick={() => setActiveTab('notes')}>
          {t('actions.addNote')}
        </Button>
      ) : null}
      {canManageRisk ? (
        <Button
          icon={<SafetyCertificateOutlined />}
          danger={blocked}
          onClick={() => setRiskOpen(true)}
        >
          {t('actions.risk')}
        </Button>
      ) : null}
      {canManage ? (
        <Button
          icon={archived ? <UndoOutlined /> : <InboxOutlined />}
          loading={setArchived.isPending}
          onClick={toggleArchived}
        >
          {archived ? t('actions.restore') : t('actions.archive')}
        </Button>
      ) : null}
    </Space>
  );

  const profileCard = (
    <aside className={styles.profileCard}>
      <EntityIdentity
        name={data.fullName}
        subtitle={domainLabel('tenantCustomerSource', data.source)}
        kind="person"
        size="lg"
        initialSource={data.fullName}
      />
      <dl className={styles.profileList}>
        <div>
          <dt>{t('detail.phone')}</dt>
          {/* Gọi được VÀ chép được: ngoài quầy thì bấm gọi, ngồi máy thì dán sang Zalo/sổ tay. */}
          <dd className={styles.copyRow}>
            <a href={`tel:${data.phone}`}>{data.phone}</a>
            <CopyButton value={data.phone} label={t('detail.copyPhone')} />
          </dd>
        </div>
        {data.email ? (
          <div>
            <dt>{t('detail.email')}</dt>
            <dd className={styles.copyRow}>
              <a href={`mailto:${data.email}`}>{data.email}</a>
              <CopyButton value={data.email} label={t('detail.copyEmail')} />
            </dd>
          </div>
        ) : null}
        {data.address ? (
          <div>
            <dt>{t('detail.address')}</dt>
            <dd>{data.address}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t('detail.account')}</dt>
          <dd>
            {data.hasAccount ? (
              <Tag color="blue">{t('detail.accountLinked')}</Tag>
            ) : (
              <span className={styles.muted}>{t('detail.accountNotLinked')}</span>
            )}
          </dd>
        </div>
        <div>
          <dt>{t('detail.createdAt')}</dt>
          <dd>{fmt.date(data.createdAt)}</dd>
        </div>
      </dl>
    </aside>
  );

  const headerExtra = (
    <div className={styles.headerExtra}>
      <div className={styles.headerTags}>
        <StatusTag
          value={data.riskLevel as TenantCustomerRiskLevel}
          meta={TENANT_CUSTOMER_RISK_LEVEL_META}
          group="tenantCustomerRiskLevel"
        />
        {archived ? <Tag>{t('card.archived')}</Tag> : null}
      </div>
      {actions}
    </div>
  );

  /** Dòng liên hệ — dựng MỘT lần rồi dùng cho cả vỏ trang lẫn vỏ modal. */
  const contactLine = (
    <span className={styles.headerSub}>
      <a href={`tel:${data.phone}`}>{data.phone}</a>
      <CopyButton value={data.phone} label={t('detail.copyPhone')} />
      {data.email ? <span className={styles.headerEmail}>· {data.email}</span> : null}
    </span>
  );

  return (
    <div className={embedded ? styles.embedded : styles.page}>
      {embedded ? (
        /*
         * Trong modal: bỏ vỏ trang, nhưng GIỮ nguyên liên hệ + tag rủi ro + hành động — đó là
         * phần người dùng thật sự cần; chỉ `<h1>` và nút quay lại là thuộc về route.
         */
        <div className={styles.embeddedHeader}>
          {contactLine}
          {headerExtra}
        </div>
      ) : (
        <ManagePageHeader
          title={data.fullName}
          subtitle={contactLine}
          onBack={back}
          extra={headerExtra}
        />
      )}

      {archived ? (
        <Alert
          className={styles.banner}
          type="info"
          showIcon
          message={t('detail.archivedBannerTitle')}
          description={t('detail.archivedBannerBody')}
        />
      ) : null}

      {blocked || watchlist ? (
        <Alert
          className={styles.banner}
          type={blocked ? 'error' : 'warning'}
          showIcon
          message={
            blocked ? t('detail.blockedBannerTitle') : t('detail.watchlistBannerTitle')
          }
          description={
            <>
              {data.riskReason ? <div>{data.riskReason}</div> : null}
              <div className={styles.bannerHint}>
                {blocked ? t('detail.blockedBannerBody') : t('detail.watchlistBannerBody')}
              </div>
            </>
          }
        />
      ) : null}

      <div className={styles.summaryGrid}>
        <SummaryCard label={t('stats.completed')} value={data.completedRentalCount} />
        <SummaryCard label={t('stats.active')} value={data.activeBookingCount} />
        {canViewFinance ? (
          <>
            <SummaryCard label={t('stats.totalValue')} value={fmt.money(data.totalBookingAmount)} />
            <SummaryCard label={t('stats.paid')} value={fmt.money(data.paidAmount)} />
            <SummaryCard
              label={<LabelWithHint label={t('stats.debt')} hint={t('hints.debt')} />}
              value={fmt.money(data.debtAmount)}
              danger={!isZeroMoney(data.debtAmount)}
            />
          </>
        ) : null}
        <SummaryCard
          label={t('stats.noShowLate')}
          value={`${data.noShowCount} / ${data.lateReturnCount}`}
          danger={data.noShowCount > 0 || data.lateReturnCount > 0}
        />
        <SummaryCard
          label={t('stats.lastRental')}
          value={data.lastRentalAt ? fmt.date(data.lastRentalAt) : '—'}
        />
      </div>

      <div className={styles.body}>
        <div className={styles.main}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: 'overview',
                label: t('tabs.overview'),
                children: (
                  <div className={styles.overview}>
                    {isDesktop ? null : profileCard}
                    <section className={styles.recent}>
                      <h2 className={styles.sectionTitle}>{t('overview.recentTitle')}</h2>
                      {canViewBookings ? (
                        data.recentBookings.length > 0 ? (
                          <ul className={styles.recentList}>
                            {data.recentBookings.map((booking) => (
                              <li key={booking.id} className={styles.recentItem}>
                                <span className={styles.recentCode}>{booking.code}</span>
                                <span className={styles.recentVehicle}>{booking.vehicleName}</span>
                                <span className={styles.muted}>{fmt.date(booking.pickupAt)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className={styles.muted}>{t('overview.recentEmpty')}</p>
                        )
                      ) : (
                        <p className={styles.muted}>{t('overview.recentHidden')}</p>
                      )}
                    </section>
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
                      children: <CustomerReceiptsPanel customerId={customerId} />,
                    },
                  ]
                : []),
              {
                key: 'notes',
                label: t('tabs.notes'),
                children: (
                  <CustomerNotesPanel
                    customerId={customerId}
                    canManage={canManage}
                    disabled={archived}
                  />
                ),
              },
              {
                key: 'documents',
                label: t('tabs.documents'),
                children: (
                  <CustomerDocumentsPanel
                    customerId={customerId}
                    canManage={canManageDocuments}
                    canViewFiles={canViewDocumentFiles}
                    disabled={archived}
                  />
                ),
              },
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
