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
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  PERMISSION,
  TENANT_CUSTOMER_RISK_LEVEL,
  TENANT_CUSTOMER_RISK_LEVEL_META,
  TENANT_CUSTOMER_SOURCE_LABEL,
  type TenantCustomerRiskLevel,
  type TenantCustomerSource,
} from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ROUTES } from '@/constants/routes';
import { useIsDesktop } from '@/hooks/use-media-query';
import { usePermissions } from '@/hooks/use-permissions';
import { formatDate } from '@/lib/datetime';
import { formatMoneyVnd, isZeroMoney } from '@/lib/money';
import { getErrorMessage } from '@/services/api-client';
import { CUSTOMER_HINTS } from '../constants';
import { useCustomer, useSetCustomerArchived } from '../hooks/use-customers';
import { CustomerBookingHistory } from './CustomerBookingHistory';
import { CustomerDocumentsPanel } from './CustomerDocumentsPanel';
import { CustomerFormModal } from './CustomerFormModal';
import { CustomerNotesPanel } from './CustomerNotesPanel';
import { CustomerRiskModal } from './CustomerRiskModal';
import styles from './CustomerDetailView.module.css';

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
export function CustomerDetailView({ customerId }: { customerId: string }) {
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
        <ManagePageHeader title="Khách hàng" onBack={back} />
        <Result
          status="403"
          title="Bạn chưa có quyền xem sổ khách"
          subTitle='Liên hệ chủ gian hàng để được cấp quyền "Khách hàng".'
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.page}>
        <ManagePageHeader title="Hồ sơ khách hàng" onBack={back} />
        <Skeleton active avatar paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={styles.page}>
        <ManagePageHeader title="Hồ sơ khách hàng" onBack={back} />
        <Result
          status="warning"
          title="Không mở được hồ sơ khách"
          subTitle={error ? getErrorMessage(error) : undefined}
          extra={
            <Space>
              <Button onClick={() => void refetch()} loading={isFetching}>
                Thử lại
              </Button>
              <Button type="primary" onClick={back}>
                Về sổ khách
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
          message.success(archived ? 'Đã khôi phục hồ sơ khách' : 'Đã lưu trữ hồ sơ khách'),
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  }

  const actions = (
    <Space wrap>
      {canManage ? (
        <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)} disabled={archived}>
          Sửa hồ sơ
        </Button>
      ) : null}
      {canCreateBooking ? (
        <Tooltip
          title={
            blocked
              ? 'Khách đang bị từ chối phục vụ — đổi mức rủi ro trước khi lập đơn mới'
              : undefined
          }
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
            Tạo đơn thuê
          </Button>
        </Tooltip>
      ) : null}
      {canManage ? (
        <Button icon={<FileAddOutlined />} onClick={() => setActiveTab('notes')}>
          Thêm ghi chú
        </Button>
      ) : null}
      {canManageRisk ? (
        <Button
          icon={<SafetyCertificateOutlined />}
          danger={blocked}
          onClick={() => setRiskOpen(true)}
        >
          Mức rủi ro
        </Button>
      ) : null}
      {canManage ? (
        <Button
          icon={archived ? <UndoOutlined /> : <InboxOutlined />}
          loading={setArchived.isPending}
          onClick={toggleArchived}
        >
          {archived ? 'Khôi phục' : 'Lưu trữ'}
        </Button>
      ) : null}
    </Space>
  );

  const profileCard = (
    <aside className={styles.profileCard}>
      <EntityIdentity
        name={data.fullName}
        subtitle={TENANT_CUSTOMER_SOURCE_LABEL[data.source as TenantCustomerSource] ?? data.source}
        kind="person"
        size="lg"
        initialSource={data.fullName}
      />
      <dl className={styles.profileList}>
        <div>
          <dt>Số điện thoại</dt>
          {/* Gọi được VÀ chép được: ngoài quầy thì bấm gọi, ngồi máy thì dán sang Zalo/sổ tay. */}
          <dd className={styles.copyRow}>
            <a href={`tel:${data.phone}`}>{data.phone}</a>
            <CopyButton value={data.phone} label="Sao chép số điện thoại" />
          </dd>
        </div>
        {data.email ? (
          <div>
            <dt>Email</dt>
            <dd className={styles.copyRow}>
              <a href={`mailto:${data.email}`}>{data.email}</a>
              <CopyButton value={data.email} label="Sao chép email" />
            </dd>
          </div>
        ) : null}
        {data.address ? (
          <div>
            <dt>Địa chỉ</dt>
            <dd>{data.address}</dd>
          </div>
        ) : null}
        <div>
          <dt>Tài khoản XePrime</dt>
          <dd>
            {data.hasAccount ? (
              <Tag color="blue">Đã liên kết</Tag>
            ) : (
              <span className={styles.muted}>Chưa liên kết</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Vào sổ từ</dt>
          <dd>{formatDate(data.createdAt)}</dd>
        </div>
      </dl>
    </aside>
  );

  return (
    <div className={styles.page}>
      <ManagePageHeader
        title={data.fullName}
        subtitle={
          <span className={styles.headerSub}>
            <a href={`tel:${data.phone}`}>{data.phone}</a>
            <CopyButton value={data.phone} label="Sao chép số điện thoại" />
            {data.email ? <span className={styles.headerEmail}>· {data.email}</span> : null}
          </span>
        }
        onBack={back}
        extra={
          <div className={styles.headerExtra}>
            <div className={styles.headerTags}>
              <StatusTag
                value={data.riskLevel as TenantCustomerRiskLevel}
                meta={TENANT_CUSTOMER_RISK_LEVEL_META}
              />
              {archived ? <Tag>Đã lưu trữ</Tag> : null}
            </div>
            {actions}
          </div>
        }
      />

      {archived ? (
        <Alert
          className={styles.banner}
          type="info"
          showIcon
          message="Hồ sơ đang lưu trữ"
          description="Lịch sử thuê vẫn giữ nguyên và mở được từ đơn cũ. Khôi phục hồ sơ để chỉnh sửa hoặc ghi chú thêm."
        />
      ) : null}

      {blocked || watchlist ? (
        <Alert
          className={styles.banner}
          type={blocked ? 'error' : 'warning'}
          showIcon
          message={
            blocked ? 'Gian hàng đang từ chối phục vụ khách này' : 'Khách được đánh dấu cần lưu ý'
          }
          description={
            <>
              {data.riskReason ? <div>{data.riskReason}</div> : null}
              <div className={styles.bannerHint}>
                {blocked
                  ? 'Yêu cầu và đơn MỚI bị chặn ở gian hàng này. Khách chỉ nhận được thông báo trung tính, không biết lý do nội bộ.'
                  : 'Đây chỉ là lời nhắc cho người trực — không thao tác nào bị chặn.'}
              </div>
            </>
          }
        />
      ) : null}

      <div className={styles.summaryGrid}>
        <SummaryCard label="Chuyến đã hoàn tất" value={data.completedRentalCount} />
        <SummaryCard label="Đơn đang chạy / sắp tới" value={data.activeBookingCount} />
        {canViewFinance ? (
          <>
            <SummaryCard
              label="Tổng giá trị thuê"
              value={formatMoneyVnd(data.totalBookingAmount)}
            />
            <SummaryCard label="Đã thu" value={formatMoneyVnd(data.paidAmount)} />
            <SummaryCard
              label={<LabelWithHint label="Còn nợ" hint={CUSTOMER_HINTS.debt} />}
              value={formatMoneyVnd(data.debtAmount)}
              danger={!isZeroMoney(data.debtAmount)}
            />
          </>
        ) : null}
        <SummaryCard
          label="Không nhận xe / trả muộn"
          value={`${data.noShowCount} / ${data.lateReturnCount}`}
          danger={data.noShowCount > 0 || data.lateReturnCount > 0}
        />
        <SummaryCard
          label="Lần thuê gần nhất"
          value={data.lastRentalAt ? formatDate(data.lastRentalAt) : '—'}
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
                label: 'Tổng quan',
                children: (
                  <div className={styles.overview}>
                    {isDesktop ? null : profileCard}
                    <section className={styles.recent}>
                      <h2 className={styles.sectionTitle}>Hoạt động gần đây</h2>
                      {canViewBookings ? (
                        data.recentBookings.length > 0 ? (
                          <ul className={styles.recentList}>
                            {data.recentBookings.map((booking) => (
                              <li key={booking.id} className={styles.recentItem}>
                                <span className={styles.recentCode}>{booking.code}</span>
                                <span className={styles.recentVehicle}>{booking.vehicleName}</span>
                                <span className={styles.muted}>{formatDate(booking.pickupAt)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className={styles.muted}>Khách chưa có chuyến nào.</p>
                        )
                      ) : (
                        <p className={styles.muted}>
                          Bạn chưa có quyền xem đơn thuê nên phần này được ẩn.
                        </p>
                      )}
                    </section>
                  </div>
                ),
              },
              ...(canViewBookings
                ? [
                    {
                      key: 'history',
                      label: 'Lịch sử thuê',
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
              {
                key: 'notes',
                label: 'Ghi chú nội bộ',
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
                label: 'Giấy tờ',
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
