'use client';

import { App, Descriptions, Tag } from 'antd';
import Link from 'next/link';
import {
  BOOKING_STATUS_META, PERMISSION, SERVICE_TYPE_LABEL, TENANT_STATUS_META, type BookingStatus, type ServiceType, type TenantStatus, } from '@xeprime/types';
import { MaskedContact } from '@/components/data-display/MaskedContact';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { isZeroMoney } from '@/lib/money';
import { getErrorMessage } from '@/services/api-client';
import { useAdminBooking, useRevealBookingContact } from '../hooks/use-admin-bookings';
import type { AdminBookingDetail } from '../types';
import styles from './AdminBookingDetailDrawer.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

export function AdminBookingDetailDrawer({
  bookingId,
  onClose,
}: {
  bookingId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError, refetch } = useAdminBooking(bookingId);

  return (
    <DetailDrawer
      title={data ? `Đơn ${data.code}` : 'Đơn thuê'}
      size="md"
      open={Boolean(bookingId)}
      onClose={onClose}
      extra={
        data ? <StatusTag value={data.status as BookingStatus} meta={BOOKING_STATUS_META} group="bookingStatus" /> : null
      }
      loading={!isError && (isLoading || !data)}
      error={isError}
      errorTitle="Không tải được thông tin đơn"
      onRetry={() => void refetch()}
    >
      {/* `key` ép remount khi đổi đơn: SĐT đã bỏ che của đơn trước không được rớt sang đơn sau. */}
      {data ? <Body key={data.id} booking={data} /> : null}
    </DetailDrawer>
  );
}

function Body({ booking }: { booking: AdminBookingDetail }) {
  const fmt = useAppFormat();

  const { message } = App.useApp();
  const { has } = usePermissions();
  const reveal = useRevealBookingContact(booking.id);

  return (
    <div>
      <Descriptions
        column={1}
        size="small"
        bordered
        items={[
          { key: 'customer', label: 'Khách', children: booking.customerName },
          {
            key: 'phone',
            label: 'SĐT khách',
            children: (
              <MaskedContact
                masked={booking.customerPhoneMasked}
                revealed={reveal.data?.customerPhone}
                canReveal={has(PERMISSION.PLATFORM_CUSTOMER_PII_VIEW)}
                loading={reveal.isPending}
                onReveal={() =>
                  reveal.mutate(undefined, {
                    onError: (err) => message.error(getErrorMessage(err)),
                  })
                }
              />
            ),
          },
          {
            key: 'tenant',
            label: 'Gian hàng',
            children: (
              <span className={styles.inline}>
                <Link
                  href={`${ROUTES.MANAGE.ADMIN_TENANTS}?q=${encodeURIComponent(booking.tenantName)}`}
                >
                  {booking.tenantName}
                </Link>
                <StatusTag value={booking.tenantStatus as TenantStatus} meta={TENANT_STATUS_META} group="tenantStatus" />
              </span>
            ),
          },
          {
            key: 'vehicle',
            label: 'Xe',
            children: (
              <Link
                href={`${ROUTES.MANAGE.ADMIN_VEHICLES}?q=${encodeURIComponent(booking.vehicleName)}`}
              >
                {booking.vehicleName}
                {booking.vehiclePlateNumber ? ` · ${booking.vehiclePlateNumber}` : ''}
              </Link>
            ),
          },
          {
            key: 'service',
            label: 'Dịch vụ',
            children: SERVICE_TYPE_LABEL[booking.serviceType as ServiceType] ?? booking.serviceType,
          },
          {
            key: 'plan',
            label: 'Kế hoạch',
            children: fmt.shortDateTimeRange(booking.pickupAt, booking.returnAt),
          },
          {
            key: 'actual',
            label: 'Thực tế',
            children:
              booking.actualPickupAt || booking.actualReturnAt
                ? fmt.shortDateTimeRange(booking.actualPickupAt, booking.actualReturnAt)
                : 'Chưa giao/nhận xe',
          },
        ]}
      />

      <div className={styles.sectionTitle}>Tiền</div>
      <Descriptions
        column={1}
        size="small"
        bordered
        items={[
          { key: 'base', label: 'Tiền thuê', children: fmt.money(booking.baseAmount) },
          ...(isZeroMoney(booking.deliveryFee)
            ? []
            : [
                {
                  key: 'delivery',
                  label: 'Phí giao xe',
                  children: fmt.money(booking.deliveryFee),
                },
              ]),
          ...(isZeroMoney(booking.discountAmount)
            ? []
            : [
                {
                  key: 'discount',
                  label: 'Giảm giá',
                  children: `− ${fmt.money(booking.discountAmount)}`,
                },
              ]),
          { key: 'total', label: 'Tổng cộng', children: fmt.money(booking.totalAmount) },
          { key: 'deposit', label: 'Đặt cọc', children: fmt.money(booking.depositAmount) },
          { key: 'paid', label: 'Đã thu', children: fmt.money(booking.paidAmount) },
          {
            key: 'debt',
            label: 'Còn nợ',
            children: (
              <span className={isZeroMoney(booking.debtAmount) ? undefined : styles.debt}>
                {fmt.money(booking.debtAmount)}
              </span>
            ),
          },
        ]}
      />

      <div className={styles.sectionTitle}>Hồ sơ</div>
      <div className={styles.tags}>
        <Tag>{booking.receiptCount} phiếu thu/chi</Tag>
        <Tag>{booking.paymentCount} lần thanh toán</Tag>
        <Tag color={booking.hasContract ? 'green' : undefined}>
          {booking.hasContract ? 'Đã lập hợp đồng' : 'Chưa có hợp đồng'}
        </Tag>
      </div>

      {booking.note ? <div className={styles.note}>{booking.note}</div> : null}

      <div className={styles.footer}>
        Người tạo: {booking.createdByName ?? '—'} · Tạo {fmt.dateTime(booking.createdAt)} · Cập
        nhật {fmt.dateTime(booking.updatedAt)}
      </div>
    </div>
  );
}
