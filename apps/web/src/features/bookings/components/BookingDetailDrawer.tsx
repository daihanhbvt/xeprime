'use client';

import { EditOutlined } from '@ant-design/icons';
import { App, Button, Descriptions, Drawer, Popconfirm, Space, Spin } from 'antd';
import {
  BOOKING_STATUS_META,
  BOOKING_STATUS_TRANSITIONS,
  PERMISSION,
  type BookingStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { usePermissions } from '@/hooks/use-permissions';
import { formatDateTime } from '@/lib/datetime';
import { formatMoneyVnd } from '@/lib/money';
import { getErrorMessage } from '@/services/api-client';
import { BOOKING_TRANSITION_LABEL, DESTRUCTIVE_TRANSITIONS, serviceTypeLabel } from '../constants';
import { useBooking } from '../hooks/use-booking';
import { useTransitionBooking } from '../hooks/use-booking-mutations';
import type { BookingDetail } from '../types';
import styles from './BookingDetailDrawer.module.css';

export function BookingDetailDrawer({
  bookingId,
  onClose,
  onEdit,
}: {
  bookingId: string | null;
  onClose: () => void;
  onEdit: (booking: BookingDetail) => void;
}) {
  const { data, isLoading } = useBooking(bookingId);

  return (
    <Drawer
      title={data ? `Đơn ${data.code}` : 'Chi tiết đơn'}
      width={520}
      open={Boolean(bookingId)}
      onClose={onClose}
      extra={
        data ? (
          <StatusTag value={data.status as BookingStatus} meta={BOOKING_STATUS_META} />
        ) : null
      }
    >
      {isLoading || !data ? (
        <div className={styles.center}>
          <Spin />
        </div>
      ) : (
        <BookingDetailBody booking={data} onEdit={onEdit} />
      )}
    </Drawer>
  );
}

function BookingDetailBody({
  booking,
  onEdit,
}: {
  booking: BookingDetail;
  onEdit: (booking: BookingDetail) => void;
}) {
  const { message } = App.useApp();
  const { has } = usePermissions();
  const transition = useTransitionBooking(booking.id);

  const canManage = has(PERMISSION.BOOKING_UPDATE);
  const nextStatuses = BOOKING_STATUS_TRANSITIONS[booking.status as BookingStatus] ?? [];

  function runTransition(to: BookingStatus) {
    transition.mutate(
      { status: to },
      {
        onSuccess: () => message.success('Đã cập nhật trạng thái'),
        onError: (error) => message.error(getErrorMessage(error)),
      },
    );
  }

  return (
    <div>
      <Descriptions column={1} size="small" bordered items={detailItems(booking)} />

      {canManage ? (
        <div className={styles.actions}>
          <Button icon={<EditOutlined />} onClick={() => onEdit(booking)}>
            Sửa
          </Button>
          <Space wrap>
            {nextStatuses.map((to) => {
              const destructive = DESTRUCTIVE_TRANSITIONS.includes(to);
              const label = BOOKING_TRANSITION_LABEL[to];
              return destructive ? (
                <Popconfirm
                  key={to}
                  title={`${label}?`}
                  okText={label}
                  okButtonProps={{ danger: true }}
                  cancelText="Đóng"
                  onConfirm={() => runTransition(to)}
                >
                  <Button danger loading={transition.isPending}>
                    {label}
                  </Button>
                </Popconfirm>
              ) : (
                <Button
                  key={to}
                  type="primary"
                  loading={transition.isPending}
                  onClick={() => runTransition(to)}
                >
                  {label}
                </Button>
              );
            })}
          </Space>
        </div>
      ) : null}
    </div>
  );
}

function detailItems(b: BookingDetail) {
  return [
    { key: 'customer', label: 'Khách hàng', children: b.customerName },
    { key: 'phone', label: 'Điện thoại', children: b.customerPhone ?? '—' },
    { key: 'vehicle', label: 'Xe', children: b.vehiclePlate ? `${b.vehicleName} · ${b.vehiclePlate}` : b.vehicleName },
    { key: 'service', label: 'Dịch vụ', children: serviceTypeLabel(b.serviceType) },
    { key: 'pickup', label: 'Nhận xe', children: formatDateTime(b.pickupAt) },
    { key: 'return', label: 'Trả xe', children: formatDateTime(b.returnAt) },
    { key: 'base', label: 'Tiền thuê', children: formatMoneyVnd(b.baseAmount) },
    { key: 'delivery', label: 'Phí giao xe', children: formatMoneyVnd(b.deliveryFee) },
    { key: 'discount', label: 'Giảm giá', children: formatMoneyVnd(b.discountAmount) },
    { key: 'total', label: 'Tổng tiền', children: formatMoneyVnd(b.totalAmount) },
    { key: 'deposit', label: 'Tiền cọc', children: formatMoneyVnd(b.depositAmount) },
    { key: 'paid', label: 'Đã thanh toán', children: formatMoneyVnd(b.paidAmount) },
    ...(b.note ? [{ key: 'note', label: 'Ghi chú', children: b.note }] : []),
  ];
}
