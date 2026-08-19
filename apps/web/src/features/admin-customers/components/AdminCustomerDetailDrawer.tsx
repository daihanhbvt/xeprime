'use client';

import { App, Descriptions, Empty, Tag } from 'antd';
import Link from 'next/link';
import {
  BOOKING_REQUEST_STATUS_META, PERMISSION, STATUS_COLOR, USER_STATUS_META, type BookingRequestStatus, type UserStatus, } from '@xeprime/types';
import { MaskedContact } from '@/components/data-display/MaskedContact';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorMessage } from '@/services/api-client';
import { useAdminCustomer, useRevealCustomerContact } from '../hooks/use-admin-customers';
import type { AdminCustomerDetail, AdminCustomerRequest } from '../types';
import styles from './AdminCustomerDetailDrawer.module.css';
import { useAppFormat, type AppFormat } from '@/i18n/use-app-format';

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
      extra={data ? <StatusTag value={data.status as UserStatus} meta={USER_STATUS_META} group="userStatus" /> : null}
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
  const fmt = useAppFormat();

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
                {customer.phoneVerified ? (
                  <Tag color={STATUS_COLOR.SUCCESS}>Đã xác thực</Tag>
                ) : null}
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
                {customer.emailVerifiedAt ? (
                  <Tag color={STATUS_COLOR.SUCCESS}>Đã xác thực</Tag>
                ) : null}
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
            children: customer.lastLoginAt
              ? fmt.dateTime(customer.lastLoginAt)
              : 'Chưa đăng nhập',
          },
          { key: 'created', label: 'Ngày tạo', children: fmt.dateTime(customer.createdAt) },
          { key: 'updated', label: 'Cập nhật', children: fmt.dateTime(customer.updatedAt) },
        ]}
      />

      <div className={styles.sectionTitle}>Yêu cầu thuê gần nhất</div>
      {customer.recentRequests.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Khách chưa gửi yêu cầu thuê nào" />
      ) : (
        <DataTable<AdminCustomerRequest>
          label="Yêu cầu thuê gần nhất"
          columns={requestColumns(fmt)}
          items={customer.recentRequests}
          minWidth={760}
          striped={false}
          empty={{ title: 'Khách chưa gửi yêu cầu thuê nào' }}
        />
      )}
    </div>
  );
}

/**
 * Cột dựng bằng HÀM chứ không phải hằng ở module scope: mốc thời gian phải theo ngôn ngữ
 * của request, mà ngôn ngữ chỉ đọc được trong cây React.
 */
const requestColumns = (fmt: AppFormat): DataTableColumn<AdminCustomerRequest>[] => [
  {
    title: 'Gian hàng · xe',
    key: 'target',
    width: 230,
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
    width: 230,
    render: (_, r) => (
      <div>
        <div>{fmt.shortDateTime(r.pickupAt)}</div>
        <div className={styles.meta}>{fmt.shortDateTime(r.returnAt)}</div>
      </div>
    ),
  },
  {
    title: 'Trạng thái',
    key: 'status',
    width: 140,
    render: (_, r) => (
      <StatusTag value={r.status as BookingRequestStatus} meta={BOOKING_REQUEST_STATUS_META} group="bookingRequestStatus" />
    ),
  },
  {
    title: 'Liên kết',
    key: 'booking',
    align: 'right',
    width: 150,
    render: (_, r) =>
      r.bookingCode ? (
        <Link href={`${ROUTES.MANAGE.ADMIN_BOOKINGS}?q=${encodeURIComponent(r.bookingCode)}`}>
          Đơn {r.bookingCode}
        </Link>
      ) : null,
  },
];
