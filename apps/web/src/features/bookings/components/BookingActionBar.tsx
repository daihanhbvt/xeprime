'use client';

import { App, Button } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  HANDOVER_TYPE,
  PERMISSION,
  isBookingFinal,
  type BookingStatus,
  type HandoverType,
} from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { contractPath, receiptsPath } from '@/constants/routes';
import { useCreateContract } from '@/features/contracts/hooks/use-contract';
import { ConfirmHandoverDialog } from '@/features/handovers/components/ConfirmHandoverDialog';
import { useHandoverContext } from '@/features/handovers/hooks';
import { BookingReceiptList } from '@/features/finance/components/BookingReceiptList';
import { PaymentHistory } from '@/features/payments/components/PaymentHistory';
import { RecordPaymentModal } from '@/features/payments/components/RecordPaymentModal';
import { usePermissions } from '@/hooks/use-permissions';
import { isZeroMoney } from '@/lib/money';
import { getErrorMessage } from '@/services/api-client';
import { BookingFormDialog } from './BookingFormDialog';
import { UpdateDeliveryFeeModal } from './UpdateDeliveryFeeModal';
import type { BookingDetail } from '../types';
import styles from './BookingActionBar.module.css';

/** Lý do nút bị khoá — nói một lần, dùng cho mọi nút ghi trên đơn đã khép. */
const CLOSED_HINT = 'Đơn đã kết thúc nên không sửa được nữa';

/**
 * Thanh hành động ở CHÂN thẻ chi tiết đơn — **một hành động chính duy nhất**, mọi thứ khác lùi
 * về sau.
 *
 * Bố cục cố định theo thiết kế: mọi thao tác phụ (hợp đồng, lịch sử thu, sửa đơn, phí giao
 * nhận, thu tiền) bày thẳng bên trái; CTA theo trạng thái đứng riêng ngoài cùng bên phải. Nhờ
 * vậy mắt người dùng luôn rơi vào đúng một chỗ dù đơn đang ở chặng nào.
 *
 * CTA suy từ ngữ cảnh bàn giao (`useHandoverContext`) — dùng CHUNG query với khối `Quản lý
 * chuyến đi`, nên hai nơi không bao giờ kể hai câu chuyện khác nhau và cũng không tốn thêm một
 * request. Không có nút đổi trạng thái chung: trạng thái đơn chỉ đổi như hệ quả của một lần
 * xác nhận bàn giao thật (Wave 10).
 */
export function BookingActionBar({ booking }: { booking: BookingDetail }) {
  const router = useRouter();
  const { message } = App.useApp();
  const { has } = usePermissions();

  const canViewHandover = has(PERMISSION.HANDOVER_VIEW);
  const canConfirm = has(PERMISSION.HANDOVER_CONFIRM);
  const canContract = has(PERMISSION.CONTRACT_MANAGE);
  const canRecordPayment = has(PERMISSION.PAYMENT_RECORD);
  const canUpdate = has(PERMISSION.BOOKING_UPDATE);
  const canViewFinance = has(PERMISSION.FINANCE_VIEW);

  const { data: handover } = useHandoverContext(booking.id, canViewHandover);
  const createContract = useCreateContract();

  const [dialogType, setDialogType] = useState<HandoverType | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [feeOpen, setFeeOpen] = useState(false);

  const hasDebt = !isZeroMoney(booking.debtAmount);
  // Cùng một luật với server (`isBookingFinal`), đọc từ `@xeprime/types` — không đoán lại ở UI.
  const closed = isBookingFinal(booking.status as BookingStatus);

  /** Hành động chính DUY NHẤT, suy từ trạng thái đơn — backend vẫn là nơi chốt. */
  const primary =
    handover?.canStartPickup && !handover.pickup?.confirmedAt
      ? { type: HANDOVER_TYPE.PICKUP, label: 'Xác nhận đã giao xe' }
      : handover?.canStartReturn && !handover.return?.confirmedAt
        ? { type: HANDOVER_TYPE.RETURN, label: 'Xác nhận đã nhận xe' }
        : null;

  return (
    <>
      <div className={styles.bar}>
        {/*
          Mọi thao tác phụ đứng THẲNG ở đây, không giấu sau menu ba-chấm: nhóm này chỉ có vài
          nút và đều là việc thường ngày ở quầy — bắt bấm hai lần để tới `Thu tiền` là tính phí
          lên thao tác phổ biến nhất.
        */}
        <div className={styles.secondary}>
          {canContract ? (
            <Button
              loading={createContract.isPending}
              onClick={() =>
                createContract.mutate(booking.id, {
                  onSuccess: (contract) => router.push(contractPath.detail(contract.id)),
                  onError: (err) => message.error(getErrorMessage(err)),
                })
              }
            >
              Hợp đồng thuê xe
            </Button>
          ) : null}
          <Button onClick={() => setHistoryOpen(true)}>Sổ tiền của đơn</Button>
          {/*
            Đường sang SỔ, không phải một bề mặt tiền thứ hai: lịch sử thanh toán ở đây đã trả lời
            "đơn này thu được bao nhiêu", còn sổ trả lời "mọi phiếu của đơn này, gồm cả cọc, hoàn
            cọc và chi phí xe". Dựng lại danh sách phiếu ngay tại đây là hai chỗ cùng một dữ liệu.
          */}
          {canViewFinance ? (
            <Link href={receiptsPath.filtered({ bookingId: booking.id })}>
              <Button>Phiếu thu chi</Button>
            </Link>
          ) : null}
          {/*
            Đơn đã khép thì server từ chối mọi lần ghi (Wave 12). Nút vẫn đứng nguyên chỗ nhưng
            mờ đi và nói lý do — biến mất thì hàng nút nhảy chỗ giữa các đơn, còn để bấm được
            thì người dùng ăn 409 mà không hiểu vì sao.
          */}
          {canUpdate ? (
            <Button
              disabled={closed}
              title={closed ? CLOSED_HINT : undefined}
              onClick={() => setEditOpen(true)}
            >
              Sửa đơn
            </Button>
          ) : null}
          {canUpdate ? (
            <Button
              disabled={closed}
              title={closed ? CLOSED_HINT : undefined}
              onClick={() => setFeeOpen(true)}
            >
              Cập nhật phí giao nhận
            </Button>
          ) : null}
          {canRecordPayment ? (
            // Hết nợ thì nút vẫn đứng nguyên chỗ nhưng nói rõ là không còn gì để thu.
            <Button disabled={!hasDebt} onClick={() => setPayOpen(true)}>
              {hasDebt ? 'Thu tiền' : 'Đã thu đủ'}
            </Button>
          ) : null}
        </div>

        <div className={styles.primary}>
          {primary ? (
            <Button
              type="primary"
              size="large"
              className={styles.cta}
              disabled={!canConfirm}
              // Nút mờ mà không nói vì sao là chỗ người dùng đứng lại lâu nhất.
              title={canConfirm ? undefined : 'Cần quyền handovers.confirm để xác nhận bàn giao'}
              onClick={() => setDialogType(primary.type)}
            >
              {primary.label}
            </Button>
          ) : null}
        </div>
      </div>

      {/*
        Dựng CÓ ĐIỀU KIỆN: mỗi lần mở là một instance mới, state khởi tạo từ số liệu hiện tại —
        không cần reset trong effect (và không tạo thêm một vòng render).
      */}
      {dialogType && handover ? (
        <ConfirmHandoverDialog
          context={handover}
          type={dialogType}
          open
          onClose={() => setDialogType(null)}
        />
      ) : null}

      <ResponsiveDialog
        title="Sổ tiền của đơn"
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        size="md"
        footer={null}
      >
        <PaymentHistory bookingId={booking.id} />
        {/* Phiếu nhập tay gắn đơn cũng là tiền của đơn — trước đây chúng chỉ nằm ở sổ Thu-Chi,
            nên một khoản thu quá giờ 200k không hiện ở đâu trên màn đơn. */}
        {canViewFinance ? <BookingReceiptList bookingId={booking.id} /> : null}
      </ResponsiveDialog>

      {payOpen ? (
        <RecordPaymentModal
          bookingId={booking.id}
          debtAmount={booking.debtAmount}
          open
          onClose={() => setPayOpen(false)}
        />
      ) : null}
      {feeOpen ? (
        <UpdateDeliveryFeeModal
          bookingId={booking.id}
          currentFee={booking.deliveryFee}
          open
          onClose={() => setFeeOpen(false)}
        />
      ) : null}
      <BookingFormDialog open={editOpen} editing={booking} onClose={() => setEditOpen(false)} />
    </>
  );
}
