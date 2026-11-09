'use client';

import { App, Button } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  HANDOVER_TYPE,
  isBookingClosedWithoutTrip,
  isBookingFinal,
  PAYMENT_KIND,
  PERMISSION,
  PLAN_FEATURE,
  type BookingStatus,
  type HandoverPhotoSlot,
  type HandoverType,
} from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { contractPath, receiptsPath } from '@/constants/routes';
import { useCreateContract } from '@/features/contracts/hooks/use-contract';
import { BookingReceiptList } from '@/features/finance/components/BookingReceiptList';
import { ConfirmHandoverDialog } from '@/features/handovers/components/ConfirmHandoverDialog';
import { ConfirmReturnDialog } from '@/features/handovers/components/ConfirmReturnDialog';
import { useHandoverContext } from '@/features/handovers/hooks';
import type { HandoverContext } from '@/features/handovers/types';
import { PaymentHistory } from '@/features/payments/components/PaymentHistory';
import { RecordPaymentModal } from '@/features/payments/components/RecordPaymentModal';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { useFeature } from '@/hooks/use-feature';
import { usePermissions } from '@/hooks/use-permissions';
import { useErrorMessage } from '@/i18n/use-error-message';
import type { BookingDetail } from '../../types';
import { BookingCustomerDocumentsDialog } from '../BookingCustomerDocumentsDialog';
import { BookingFormDialog } from '../BookingFormDialog';
import { UpdateDeliveryFeeModal } from '../UpdateDeliveryFeeModal';
import styles from './BookingDetail.module.css';
import {
  depositOutstanding,
  missingPhotoSlots,
  prepRowStates,
  type PrepKey,
} from './handover-readiness';

/**
 * Lượt cảnh báo "còn thiếu" khi bấm giao/nhận xe (Figma `23845:51599`, 03/11/2026): những dòng
 * chuẩn bị + góc ảnh còn trống nháy viền đỏ cho tới khi người dùng đóng thông báo hoặc bấm
 * "Vẫn tiếp tục". Chỉ là LỜI NHẮC — không chặn bàn giao (mọi thứ trong đó đều tuỳ chọn ở server).
 */
export interface HandoverAlert {
  type: HandoverType;
  prep: readonly PrepKey[];
  slots: readonly HandoverPhotoSlot[];
}

const HANDOVER_ALERT_KEY = 'booking-handover-missing';

interface BookingDetailActionsValue {
  booking: BookingDetail;
  handover: HandoverContext | undefined;
  /** Đơn đã khép — mọi đường ghi bị server từ chối (Wave 12). */
  closed: boolean;
  /**
   * Đơn huỷ / khách không đến — chuyến không diễn ra nên không thu tiền, thu cọc hay ghi phát sinh
   * mới (server: `BOOKING_MONEY_CLOSED`). Lịch sử tiền và hoàn lại phần đã thu vẫn mở.
   */
  moneyClosed: boolean;
  can: {
    /** Thu tiền thuộc gói (ADR 0028 7A) + quyền ghi thu + đơn còn nhận tiền (`moneyClosed`). */
    collect: boolean;
    history: boolean;
    contract: boolean;
    edit: boolean;
    documents: boolean;
    /** Đang ở chặng có thể xác nhận bàn giao và người dùng được phép. */
    confirmHandover: boolean;
    managePhotos: boolean;
    /** Đánh dấu tay việc chuẩn bị bàn giao — cùng quyền soạn biên bản, phiên hỗ trợ không có. */
    markPrep: boolean;
    viewPhotos: boolean;
  };
  /** Hành động chính DUY NHẤT của đơn (giao xe / nhận xe), suy từ ngữ cảnh bàn giao. */
  primary: { type: HandoverType; label: string } | null;
  contractPending: boolean;
  openPay: () => void;
  /** Thu CỌC (giữ hộ, không giảm công nợ) — cùng hộp thu với khối "Phát sinh". */
  openDeposit: () => void;
  openHistory: () => void;
  openEdit: () => void;
  openDocuments: () => void;
  openFee: () => void;
  /**
   * Bấm "Xác nhận đã giao/nhận xe": còn thiếu thì cảnh báo + nháy viền (kèm "Vẫn tiếp tục"), đủ
   * rồi thì mở thẳng hộp xác nhận.
   */
  requestHandover: (type: HandoverType) => void;
  /** Lượt cảnh báo đang hiện — các khối tự tô viền những gì CÒN thiếu. */
  alert: HandoverAlert | null;
  openContract: () => void;
}

const BookingDetailActionsContext = createContext<BookingDetailActionsValue | null>(null);

export function useBookingDetailActions(): BookingDetailActionsValue {
  const value = useContext(BookingDetailActionsContext);
  if (!value)
    throw new Error('useBookingDetailActions phải nằm trong BookingDetailActionsProvider');
  return value;
}

/**
 * MỌI thao tác của trang chi tiết đơn ở MỘT chỗ — quyền, cổng gói, trạng thái hộp thoại.
 *
 * Design 02/11/2026 (Figma `23768:29928`) rải các nút ra nhiều nơi: hợp đồng · lịch sử thu ·
 * thu tiền ở đầu trang, "Chỉnh sửa" trên thẻ khách, "Xác nhận đã thu" trong danh sách chuẩn bị,
 * nút bàn giao ở cột phải. Mỗi chỗ chỉ gọi `open…` của context này, nên một hộp thoại chỉ có
 * MỘT bản trong cây và một luật quyền — không có hai nút "Thu tiền" với hai cổng khác nhau.
 *
 * **Không có bộ đổi trạng thái tự do**: `active`/`completed` chỉ đến từ một lần xác nhận bàn
 * giao thật; huỷ / khách không đến đi qua `BookingStatusActions`.
 */
export function BookingDetailActionsProvider({
  booking,
  children,
}: {
  booking: BookingDetail;
  children: ReactNode;
}) {
  const t = useTranslations('Bookings.actionBar');
  const router = useRouter();
  const { message, notification } = App.useApp();
  const tAlert = useTranslations('Bookings.detailPage.handoverAlert');
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();

  const canViewHandover = has(PERMISSION.HANDOVER_VIEW);
  const canConfirm = has(PERMISSION.HANDOVER_CONFIRM);
  const canViewFinance = has(PERMISSION.FINANCE_VIEW);
  // Phiên hỗ trợ không bao giờ xác nhận bàn giao (ADR 0050 §10) — nút ẩn hẳn, không mờ.
  const inSupport = useSupportHides(SUPPORT_HIDDEN_AREA.HANDOVER_ACTIONS);
  // Trục NĂNG LỰC theo gói (ADR 0027 điều 2), kiểm NỐI TIẾP với quyền.
  const contractsFeature = useFeature(PLAN_FEATURE.CONTRACTS);
  const financeFeature = useFeature(PLAN_FEATURE.FINANCE);

  const { data: handover } = useHandoverContext(booking.id, canViewHandover);
  const createContract = useCreateContract();
  const closed = isBookingFinal(booking.status as BookingStatus);
  const moneyClosed = isBookingClosedWithoutTrip(booking.status as BookingStatus);

  const [dialogType, setDialogType] = useState<HandoverType | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [feeOpen, setFeeOpen] = useState(false);
  const [alert, setAlert] = useState<HandoverAlert | null>(null);

  const primary =
    handover?.canStartPickup && !handover.pickup?.confirmedAt
      ? { type: HANDOVER_TYPE.PICKUP, label: t('confirmPickup') }
      : handover?.canStartReturn && !handover.return?.confirmedAt
        ? { type: HANDOVER_TYPE.RETURN, label: t('confirmReturn') }
        : null;

  const can: BookingDetailActionsValue['can'] = {
    collect: has(PERMISSION.PAYMENT_RECORD) && financeFeature.isVisible && !moneyClosed,
    history: financeFeature.isVisible,
    contract: has(PERMISSION.CONTRACT_MANAGE) && contractsFeature.isVisible,
    edit: has(PERMISSION.BOOKING_UPDATE) && !closed,
    documents: Boolean(booking.tenantCustomerId) && has(PERMISSION.CUSTOMER_DOCUMENT_MANAGE),
    confirmHandover: canConfirm && !inSupport,
    managePhotos: has(PERMISSION.HANDOVER_MANAGE) && !inSupport,
    markPrep: has(PERMISSION.HANDOVER_MANAGE) && !inSupport && !closed,
    viewPhotos: canViewHandover,
  };

  function requestHandover(type: HandoverType) {
    /*
     * Nhận lại xe (06/11/2026): hộp "Xác nhận đã nhận lại xe" tự chụp ảnh và đếm x/N ảnh ngay trong
     * thân — cảnh báo "còn thiếu" của trang chỉ còn cho chiều giao xe.
     */
    if (type === HANDOVER_TYPE.RETURN) {
      setAlert(null);
      setDialogType(type);
      return;
    }
    const prep = booking.handoverPrep
      ? prepRowStates(booking.handoverPrep, can)
          .filter((row) => !row.done)
          .map((row) => row.key)
      : [];
    const slots = missingPhotoSlots(handover?.pickup?.photos, booking.vehicleType);
    if (prep.length === 0 && slots.length === 0) {
      setAlert(null);
      setDialogType(type);
      return;
    }

    setAlert({ type, prep, slots });
    notification.open({
      key: HANDOVER_ALERT_KEY,
      type: 'error',
      placement: 'topRight',
      className: styles.alertNotice,
      duration: 10,
      title: tAlert('title'),
      description: tAlert('bodyPickup'),
      actions: (
        <Button
          type="link"
          danger
          className={styles.alertContinue}
          onClick={() => {
            notification.destroy(HANDOVER_ALERT_KEY);
            setAlert(null);
            setDialogType(type);
          }}
        >
          {tAlert('continue')}
        </Button>
      ),
      onClose: () => setAlert(null),
    });
    // Đưa việc thiếu ĐẦU TIÊN vào tầm mắt — nút giao xe nằm ở cột phải, việc thiếu ở cột trái.
    const firstId = prep.length > 0 ? HANDOVER_PREP_ANCHOR : HANDOVER_PHOTOS_ANCHOR;
    document.getElementById(firstId)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }

  const value: BookingDetailActionsValue = {
    booking,
    handover,
    closed,
    moneyClosed,
    can,
    primary,
    contractPending: createContract.isPending,
    openPay: () => setPayOpen(true),
    openDeposit: () => setDepositOpen(true),
    openHistory: () => setHistoryOpen(true),
    openEdit: () => setEditOpen(true),
    openDocuments: () => setDocumentsOpen(true),
    openFee: () => setFeeOpen(true),
    requestHandover,
    alert,
    openContract: () =>
      createContract.mutate(booking.id, {
        onSuccess: (contract) => router.push(contractPath.detail(contract.id)),
        onError: (err) => message.error(errorMessage(err)),
      }),
  };

  return (
    <BookingDetailActionsContext.Provider value={value}>
      {children}

      {/*
        Dựng CÓ ĐIỀU KIỆN: mỗi lần mở là một instance mới, không mang state của lần trước. Hộp chỉ
        mở qua `requestHandover` (nút xác nhận) — vào trang, kể cả từ thẻ danh sách, không mở sẵn.
      */}
      {dialogType === HANDOVER_TYPE.PICKUP && handover ? (
        <ConfirmHandoverDialog context={handover} open onClose={() => setDialogType(null)} />
      ) : null}
      {dialogType === HANDOVER_TYPE.RETURN ? (
        <ConfirmReturnDialog booking={booking} onClose={() => setDialogType(null)} />
      ) : null}

      <ResponsiveDialog
        title={t('moneyHistoryTitle')}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        size="md"
        footer={null}
      >
        <PaymentHistory bookingId={booking.id} />
        {canViewFinance ? (
          <>
            <BookingReceiptList bookingId={booking.id} />
            <Link
              href={receiptsPath.filtered({ bookingId: booking.id })}
              className={styles.ledgerLink}
            >
              {t('openLedger')}
            </Link>
          </>
        ) : null}
      </ResponsiveDialog>

      {depositOpen && booking.handoverPrep ? (
        <RecordPaymentModal
          bookingId={booking.id}
          debtAmount={depositOutstanding(booking.handoverPrep)}
          kind={PAYMENT_KIND.DEPOSIT}
          open
          onClose={() => setDepositOpen(false)}
        />
      ) : null}
      {payOpen ? (
        <RecordPaymentModal
          bookingId={booking.id}
          debtAmount={booking.debtAmount}
          open
          onClose={() => setPayOpen(false)}
        />
      ) : null}
      <BookingFormDialog open={editOpen} editing={booking} onClose={() => setEditOpen(false)} />
      {documentsOpen && booking.tenantCustomerId ? (
        <BookingCustomerDocumentsDialog
          customerId={booking.tenantCustomerId}
          customerName={booking.customerName}
          open
          onClose={() => setDocumentsOpen(false)}
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
    </BookingDetailActionsContext.Provider>
  );
}

/** Mốc cuộn tới khi cảnh báo còn thiếu — id của khối chuẩn bị và khối ảnh bàn giao. */
export const HANDOVER_PREP_ANCHOR = 'booking-handover-prep';
export const HANDOVER_PHOTOS_ANCHOR = 'booking-handover-photos';
