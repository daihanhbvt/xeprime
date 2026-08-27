'use client';

import { App, Button } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
import { HandoverSupplementDialog } from '@/features/handovers/components/HandoverSupplementDialog';
import { useHandoverContext } from '@/features/handovers/hooks';
import { BookingReceiptList } from '@/features/finance/components/BookingReceiptList';
import { PaymentHistory } from '@/features/payments/components/PaymentHistory';
import { RecordPaymentModal } from '@/features/payments/components/RecordPaymentModal';
import { usePermissions } from '@/hooks/use-permissions';
import { useErrorMessage } from '@/i18n/use-error-message';
import { isZeroMoney } from '@/lib/money';
import { BookingFormDialog } from './BookingFormDialog';
import { BookingStatusActions } from './BookingStatusActions';
import type { BookingDetail } from '../types';
import styles from './BookingActionBar.module.css';

/**
 * Thanh hành động ở CHÂN thẻ chi tiết đơn — **một hành động chính duy nhất**, mọi thứ khác lùi
 * về sau.
 *
 * Bố cục cố định theo thiết kế: mọi thao tác phụ (quyết định trạng thái, hợp đồng, lịch sử thu,
 * sửa đơn, thu tiền) bày thẳng bên trái; CTA theo trạng thái đứng riêng ngoài cùng bên phải. Nhờ
 * vậy mắt người dùng luôn rơi vào đúng một chỗ dù đơn đang ở chặng nào.
 *
 * CTA suy từ ngữ cảnh bàn giao (`useHandoverContext`) — dùng CHUNG query với khối `Quản lý
 * chuyến đi`, nên hai nơi không bao giờ kể hai câu chuyện khác nhau và cũng không tốn thêm một
 * request.
 *
 * **Không có bộ đổi trạng thái tự do**, nhưng CÓ hai quyết định khép đơn được kiểm soát
 * (`BookingStatusActions`: hủy đơn · ghi nhận khách không đến). Ranh giới nằm ở chỗ: `active`
 * và `completed` không bao giờ đặt được bằng một cú bấm trên thanh này — chúng là HỆ QUẢ của
 * một lần xác nhận bàn giao thật, với giờ giao/nhận và KM đi kèm (Wave 10). Một dropdown "đổi
 * trạng thái" xoá đúng ranh giới đó.
 *
 * Cũng KHÔNG có "Xác nhận đơn": sự xác nhận của gian hàng đã xảy ra ở `Duyệt & giữ xe` trên
 * yêu cầu thuê — đó là thứ tạo ra chính đơn này.
 */
export function BookingActionBar({ booking }: { booking: BookingDetail }) {
  const t = useTranslations('Bookings.actionBar');
  const router = useRouter();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();

  const canViewHandover = has(PERMISSION.HANDOVER_VIEW);
  const canConfirm = has(PERMISSION.HANDOVER_CONFIRM);
  const canManageHandover = has(PERMISSION.HANDOVER_MANAGE);
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
  const [supplementOpen, setSupplementOpen] = useState(false);

  /** Đã lập biên bản chiều nào chưa — chưa có thì không có gì để bổ sung. */
  const hasHandover = Boolean(handover?.pickup || handover?.return);
  const hasDebt = !isZeroMoney(booking.debtAmount);
  // Cùng một luật với server (`isBookingFinal`), đọc từ `@xeprime/types` — không đoán lại ở UI.
  const closed = isBookingFinal(booking.status as BookingStatus);

  /** Hành động chính DUY NHẤT, suy từ trạng thái đơn — backend vẫn là nơi chốt. */
  const primary =
    handover?.canStartPickup && !handover.pickup?.confirmedAt
      ? { type: HANDOVER_TYPE.PICKUP, label: t('confirmPickup') }
      : handover?.canStartReturn && !handover.return?.confirmedAt
        ? { type: HANDOVER_TYPE.RETURN, label: t('confirmReturn') }
        : null;

  return (
    <>
      <div className={styles.bar}>
        {/*
          Mọi thao tác phụ đứng THẲNG ở đây, không giấu sau menu ba-chấm: đều là việc thường
          ngày ở quầy, và bắt bấm hai lần để tới `Thu tiền` là tính phí lên thao tác phổ biến
          nhất.

          Giữ được điều đó bằng cách BỚT NÚT chứ không phải bằng menu (20/08): thanh này từng
          phình tới bảy nút vì mỗi việc nhỏ lại mọc một nút riêng. Hai cái bỏ đi không mất chức
          năng nào — `Phiếu thu chi` thành một link ngay trong hộp `Lịch sử tiền` (cùng dữ liệu,
          chỉ khác chỗ xem), còn `Cập nhật phí giao nhận` dời xuống đứng CẠNH chính con số nó
          sửa ở khối chi phí.
        */}
        <div className={styles.secondary}>
          {/*
            Quyết định trạng thái đứng ĐẦU hàng: chúng là việc phải làm với đơn, còn phần còn
            lại của hàng là tra cứu. Tự ẩn khi đơn không còn quyết định nào (đang thuê / đã khép),
            nên chỗ này không cần biết gì về máy trạng thái.
          */}
          <BookingStatusActions
            booking={booking}
            pickupConfirmed={Boolean(handover?.pickup?.confirmedAt)}
          />
          {canContract ? (
            <Button
              loading={createContract.isPending}
              onClick={() =>
                createContract.mutate(booking.id, {
                  onSuccess: (contract) => router.push(contractPath.detail(contract.id)),
                  onError: (err) => message.error(errorMessage(err)),
                })
              }
            >
              {t('contract')}
            </Button>
          ) : null}
          {/*
            "Lịch sử tiền" chứ không phải "Sổ tiền của đơn": hộp này liệt kê các lần thu và các
            phiếu của ĐƠN, còn "sổ" là cuốn sổ Thu-Chi của cả gian hàng — hai thứ khác nhau mà
            gọi cùng một chữ thì người dùng tưởng mình đang mở nhầm chỗ.
          */}
          <Button onClick={() => setHistoryOpen(true)}>{t('moneyHistory')}</Button>
          {/*
            Đơn đã khép thì server từ chối mọi lần ghi (Wave 12). Nút vẫn đứng nguyên chỗ nhưng
            mờ đi và nói lý do — biến mất thì hàng nút nhảy chỗ giữa các đơn, còn để bấm được
            thì người dùng ăn 409 mà không hiểu vì sao.
          */}
          {canUpdate ? (
            <Button
              disabled={closed}
              title={closed ? t('closedHint') : undefined}
              onClick={() => setEditOpen(true)}
            >
              {t('edit')}
            </Button>
          ) : null}
          {canRecordPayment ? (
            // Hết nợ thì nút vẫn đứng nguyên chỗ nhưng nói rõ là không còn gì để thu.
            <Button disabled={!hasDebt} onClick={() => setPayOpen(true)}>
              {hasDebt ? t('collect') : t('collected')}
            </Button>
          ) : null}
          {/*
            Lối BỔ SUNG ảnh cho biên bản đã lập. Luồng nhanh Wave 10 cho xác nhận trong một cú
            bấm, nên quên đính ảnh là chuyện thường ngày — không có nút này thì bằng chứng nằm
            lại trong điện thoại nhân viên mãi mãi. Chỉ hiện khi thật sự đã có biên bản.
          */}
          {canManageHandover && hasHandover ? (
            <Button onClick={() => setSupplementOpen(true)}>{t('handoverPhotos')}</Button>
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
              title={canConfirm ? undefined : t('confirmPermissionHint')}
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
      {supplementOpen && handover ? (
        <HandoverSupplementDialog
          context={handover}
          open
          onClose={() => setSupplementOpen(false)}
        />
      ) : null}

      {dialogType && handover ? (
        <ConfirmHandoverDialog
          context={handover}
          type={dialogType}
          open
          onClose={() => setDialogType(null)}
        />
      ) : null}

      <ResponsiveDialog
        title={t('moneyHistoryTitle')}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        size="md"
        footer={null}
      >
        <PaymentHistory bookingId={booking.id} />
        {/* Phiếu nhập tay gắn đơn cũng là tiền của đơn — trước đây chúng chỉ nằm ở sổ Thu-Chi,
            nên một khoản thu quá giờ 200k không hiện ở đâu trên màn đơn. */}
        {canViewFinance ? (
          <>
            <BookingReceiptList bookingId={booking.id} />
            {/*
              Đường sang cuốn sổ đầy đủ nằm Ở ĐÂY chứ không phải một nút riêng trên thanh hành
              động: nó chỉ có nghĩa khi người ta ĐANG xem tiền của đơn và muốn xem rộng hơn.
            */}
            <Link
              href={receiptsPath.filtered({ bookingId: booking.id })}
              className={styles.ledgerLink}
            >
              {t('openLedger')}
            </Link>
          </>
        ) : null}
      </ResponsiveDialog>

      {payOpen ? (
        <RecordPaymentModal
          bookingId={booking.id}
          debtAmount={booking.debtAmount}
          open
          onClose={() => setPayOpen(false)}
        />
      ) : null}
      <BookingFormDialog open={editOpen} editing={booking} onClose={() => setEditOpen(false)} />
    </>
  );
}
