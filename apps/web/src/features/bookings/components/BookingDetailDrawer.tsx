'use client';

import { CarOutlined, DollarOutlined, EditOutlined, FileTextOutlined } from '@ant-design/icons';
import { App, Button, Descriptions, Divider, Popconfirm, Space } from 'antd';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  BOOKING_STATUS_META,
  BOOKING_STATUS_TRANSITIONS,
  PERMISSION,
  type BookingStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { usePermissions } from '@/hooks/use-permissions';
import { formatDateTime } from '@/lib/datetime';
import { formatMoneyVnd, isZeroMoney } from '@/lib/money';
import { getErrorMessage } from '@/services/api-client';
import { contractPath } from '@/constants/routes';
import { useCreateContract } from '@/features/contracts/hooks/use-contract';
import { HandoverPanel } from '@/features/handovers/components/HandoverPanel';
import { PaymentHistory } from '@/features/payments/components/PaymentHistory';
import { RecordPaymentModal } from '@/features/payments/components/RecordPaymentModal';
import { BOOKING_TRANSITION_LABEL, DESTRUCTIVE_TRANSITIONS, serviceTypeLabel } from '../constants';
import { useBooking } from '../hooks/use-booking';
import { useTransitionBooking } from '../hooks/use-booking-mutations';
import type { BookingDetail } from '../types';
import { UpdateDeliveryFeeModal } from './UpdateDeliveryFeeModal';
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
  /**
   * Biên bản bàn giao nằm trong drawer này, và drawer đóng được bằng Esc/bấm nền — đóng lúc
   * đó sẽ nuốt mất dữ liệu đang gõ ở quầy. Nên chính drawer phải hỏi trước, dùng đúng hộp
   * xác nhận "Bỏ thay đổi / Tiếp tục chỉnh sửa" của cả kho.
   */
  const [handoverDirty, setHandoverDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  function requestClose() {
    if (handoverDirty) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }

  return (
    <>
      <DetailDrawer
        title={data ? `Đơn ${data.code}` : 'Chi tiết đơn'}
        size="md"
        open={Boolean(bookingId)}
        onClose={requestClose}
        loading={isLoading || !data}
        extra={
          data ? (
            <StatusTag value={data.status as BookingStatus} meta={BOOKING_STATUS_META} />
          ) : null
        }
      >
        {data ? (
          <BookingDetailBody booking={data} onEdit={onEdit} onHandoverDirty={setHandoverDirty} />
        ) : null}
      </DetailDrawer>

      <ResponsiveDialog
        open={confirmClose}
        title="Bỏ các thay đổi chưa lưu?"
        size="sm"
        onClose={() => setConfirmClose(false)}
        onOk={() => {
          setConfirmClose(false);
          setHandoverDirty(false);
          onClose();
        }}
        okText="Bỏ thay đổi"
        cancelText="Tiếp tục chỉnh sửa"
        destructive
      >
        Biên bản bàn giao đang mở còn dữ liệu chưa lưu.
      </ResponsiveDialog>
    </>
  );
}

function BookingDetailBody({
  booking,
  onEdit,
  onHandoverDirty,
}: {
  booking: BookingDetail;
  onEdit: (booking: BookingDetail) => void;
  onHandoverDirty: (dirty: boolean) => void;
}) {
  const { message } = App.useApp();
  const { has } = usePermissions();
  const router = useRouter();
  const transition = useTransitionBooking(booking.id);
  const createContract = useCreateContract();
  const [payOpen, setPayOpen] = useState(false);
  const [feeOpen, setFeeOpen] = useState(false);

  const canManage = has(PERMISSION.BOOKING_UPDATE);
  const canRecordPayment = has(PERMISSION.PAYMENT_RECORD);
  const canContract = has(PERMISSION.CONTRACT_MANAGE);
  const hasDebt = !isZeroMoney(booking.debtAmount);
  const nextStatuses = BOOKING_STATUS_TRANSITIONS[booking.status as BookingStatus] ?? [];
  const statusLabel = BOOKING_STATUS_META[booking.status as BookingStatus]?.label ?? booking.status;

  function openContract() {
    createContract.mutate(booking.id, {
      onSuccess: (contract) => router.push(contractPath.detail(contract.id)),
      onError: (err) => message.error(getErrorMessage(err)),
    });
  }

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
          {/*
            Hành động PHỤ (Wave 9): chốt phí giao nhận sau khi đã thoả thuận với khách ngoài ứng
            dụng. Cố ý KHÔNG phải nút chính của đơn — chuyển trạng thái mới là việc chính.
          */}
          <Button icon={<CarOutlined />} onClick={() => setFeeOpen(true)}>
            Cập nhật phí giao nhận
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

      <Divider titlePlacement="start" className={styles.paymentDivider}>
        Bàn giao &amp; Nhận lại
      </Divider>
      {/* Bàn giao là một BƯỚC của đơn (Wave 7) — sống ngay trong chi tiết đơn, không phải
          một mục điều hướng riêng. Panel tự lo quyền/loading/lỗi của chính nó. */}
      <HandoverPanel
        bookingId={booking.id}
        bookingStatus={statusLabel}
        onDirtyChange={onHandoverDirty}
      />

      <Divider titlePlacement="start" className={styles.paymentDivider}>
        Thanh toán
      </Divider>
      {canRecordPayment ? (
        <Button
          icon={<DollarOutlined />}
          type="primary"
          ghost
          block
          disabled={!hasDebt}
          onClick={() => setPayOpen(true)}
        >
          {hasDebt ? `Thu tiền (còn nợ ${formatMoneyVnd(booking.debtAmount)})` : 'Đã thu đủ'}
        </Button>
      ) : null}
      <PaymentHistory bookingId={booking.id} />

      {canContract ? (
        <>
          <Divider titlePlacement="start" className={styles.paymentDivider}>
            Hợp đồng
          </Divider>
          <Button
            icon={<FileTextOutlined />}
            block
            loading={createContract.isPending}
            onClick={openContract}
          >
            Tạo / Xem hợp đồng
          </Button>
        </>
      ) : null}

      <RecordPaymentModal
        bookingId={booking.id}
        debtAmount={booking.debtAmount}
        open={payOpen}
        onClose={() => setPayOpen(false)}
      />

      <UpdateDeliveryFeeModal
        bookingId={booking.id}
        currentFee={booking.deliveryFee}
        open={feeOpen}
        onClose={() => setFeeOpen(false)}
      />
    </div>
  );
}

function detailItems(b: BookingDetail) {
  return [
    { key: 'customer', label: 'Khách hàng', children: b.customerName },
    { key: 'phone', label: 'Điện thoại', children: b.customerPhone ?? '—' },
    {
      key: 'vehicle',
      label: 'Xe',
      children: b.vehiclePlate ? `${b.vehicleName} · ${b.vehiclePlate}` : b.vehicleName,
    },
    { key: 'service', label: 'Dịch vụ', children: serviceTypeLabel(b.serviceType) },
    { key: 'pickup', label: 'Nhận xe', children: formatDateTime(b.pickupAt) },
    { key: 'return', label: 'Trả xe', children: formatDateTime(b.returnAt) },
    { key: 'base', label: 'Tiền thuê', children: formatMoneyVnd(b.baseAmount) },
    {
      key: 'delivery',
      label: 'Phí giao nhận',
      // 0 là "Miễn phí" — mặc định của mọi đơn cho tới khi chủ xe chốt phí đã thoả thuận.
      children: isZeroMoney(b.deliveryFee) ? 'Miễn phí' : formatMoneyVnd(b.deliveryFee),
    },
    { key: 'discount', label: 'Giảm giá', children: formatMoneyVnd(b.discountAmount) },
    { key: 'total', label: 'Tổng tiền', children: formatMoneyVnd(b.totalAmount) },
    { key: 'deposit', label: 'Tiền cọc', children: formatMoneyVnd(b.depositAmount) },
    { key: 'paid', label: 'Đã thanh toán', children: formatMoneyVnd(b.paidAmount) },
    { key: 'debt', label: 'Còn nợ', children: formatMoneyVnd(b.debtAmount) },
    ...(b.note ? [{ key: 'note', label: 'Ghi chú', children: b.note }] : []),
  ];
}
