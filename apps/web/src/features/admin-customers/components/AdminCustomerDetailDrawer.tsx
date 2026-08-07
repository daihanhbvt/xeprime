'use client';

import { App, Descriptions, Empty, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import {
  BOOKING_REQUEST_STATUS_META,
  PERMISSION,
  USER_STATUS_META,
  type BookingRequestStatus,
  type UserStatus,
} from '@xeprime/types';
import { MaskedContact } from '@/components/data-display/MaskedContact';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { formatDateTime } from '@/lib/datetime';
import { getErrorMessage } from '@/services/api-client';
import { useAdminCustomer, useRevealCustomerContact } from '../hooks/use-admin-customers';
import type { AdminCustomerDetail, AdminCustomerRequest } from '../types';
import styles from './AdminCustomerDetailDrawer.module.css';

export function AdminCustomerDetailDrawer({
  customerId,
  onClose,
}: {
  customerId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError, refetch } = useAdminCustomer(customerId);

  return (
    <DetailDrawer
      title={data ? data.displayName : 'Khách thuê'}
      // 640px cũ → bậc `lg` (720px): panel có bảng yêu cầu gần đây lồng bên trong.
      size="lg"
      open={Boolean(customerId)}
      onClose={onClose}
      extra={data ? <StatusTag value={data.status as UserStatus} meta={USER_STATUS_META} /> : null}
      loading={!isError && (isLoading || !data)}
      error={isError}
      errorTitle="Không tải được thông tin khách"
      onRetry={() => void refetch()}
    >
      {/* `key` ép remount khi đổi khách: thông tin đã bỏ che của khách trước không rớt sang sau. */}
      {data ? <Body key={data.id} customer={data} /> : null}
    </DetailDrawer>
  );
}

function Body({ customer }: { customer: AdminCustomerDetail }) {
  const { message } = App.useApp();
  const { has } = usePermissions();
  const reveal = useRevealCustomerContact(customer.id);

  const canReveal = has(PERMISSION.PLATFORM_CUSTOMER_PII_VIEW);
  const onReveal = () =>
    reveal.mutate(undefined, { onError: (err) => message.error(getErrorMessage(err)) });

  return (
    <div>
      <Descriptions
        column={1}
        size="small"
        bordered
        items={[
          {
            key: 'phone',
            label: 'SĐT',
            children: (
              <span className={styles.inline}>
                <MaskedContact
                  masked={customer.phoneMasked}
                  revealed={reveal.data?.phone}
                  canReveal={canReveal}
                  loading={reveal.isPending}
                  onReveal={onReveal}
                />
                {customer.phoneVerified ? <Tag color="green">Đã xác thực</Tag> : null}
              </span>
            ),
          },
          {
            key: 'email',
            label: 'Email',
            children: (
              <span className={styles.inline}>
                <MaskedContact
                  masked={customer.emailMasked}
                  revealed={reveal.data?.email}
                  canReveal={canReveal}
                  loading={reveal.isPending}
                  onReveal={onReveal}
                />
                {customer.emailVerifiedAt ? <Tag color="green">Đã xác thực</Tag> : null}
              </span>
            ),
          },
          {
            key: 'activity',
            label: 'Hoạt động',
            children: `${customer.requestCount} yêu cầu · ${customer.bookedCount} thành đơn · ${customer.reviewCount} đánh giá · ${customer.conversationCount} hội thoại`,
          },
          {
            key: 'lastLogin',
            label: 'Đăng nhập gần nhất',
            children: customer.lastLoginAt ? formatDateTime(customer.lastLoginAt) : 'Chưa đăng nhập',
          },
          { key: 'created', label: 'Ngày tạo', children: formatDateTime(customer.createdAt) },
          { key: 'updated', label: 'Cập nhật', children: formatDateTime(customer.updatedAt) },
        ]}
      />

      <div className={styles.sectionTitle}>Yêu cầu thuê gần nhất</div>
      {customer.recentRequests.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Khách chưa gửi yêu cầu thuê nào"
        />
      ) : (
        <Table<AdminCustomerRequest>
          rowKey="id"
          size="small"
          columns={REQUEST_COLUMNS}
          dataSource={customer.recentRequests}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      )}
    </div>
  );
}

const REQUEST_COLUMNS: ColumnsType<AdminCustomerRequest> = [
  {
    title: 'Gian hàng · xe',
    key: 'target',
    render: (_, r) => (
      <div>
        <div>{r.tenantName}</div>
        <div className={styles.meta}>{r.vehicleName}</div>
      </div>
    ),
  },
  {
    title: 'Thuê từ → đến',
    key: 'period',
    render: (_, r) => (
      <div>
        <div>{formatDateTime(r.pickupAt)}</div>
        <div className={styles.meta}>{formatDateTime(r.returnAt)}</div>
      </div>
    ),
  },
  {
    title: 'Trạng thái',
    key: 'status',
    render: (_, r) => (
      <StatusTag value={r.status as BookingRequestStatus} meta={BOOKING_REQUEST_STATUS_META} />
    ),
  },
  {
    title: '',
    key: 'booking',
    align: 'right',
    render: (_, r) =>
      r.bookingCode ? (
        <Link href={`${ROUTES.MANAGE.ADMIN_BOOKINGS}?q=${encodeURIComponent(r.bookingCode)}`}>
          Đơn {r.bookingCode}
        </Link>
      ) : null,
  },
];
