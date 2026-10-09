import { useCallback, useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useErrorMessage } from '@/i18n/use-error-message';
import { getErrorCode } from '@/lib/api-client';
import type {
  ApproveBookingRequestInput,
  BookingRequestDecisionTarget,
  CancelBookingRequestInput,
} from '../api';
import { ApproveRequestSheet } from '../components/ApproveRequestSheet';
import { ApproveSuccessSheet } from '../components/ApproveSuccessSheet';
import { CancelRequestSheet } from '../components/CancelRequestSheet';
import { RejectRequestSheet } from '../components/RejectRequestSheet';
import { cancelErrorKey, decisionErrorKey } from '../decision-error';
import {
  useApproveBookingRequest,
  useCancelBookingRequest,
  useRejectBookingRequest,
} from './use-booking-requests';

export type BookingRequestDecisionAction = 'approve' | 'reject' | 'cancel';

export interface BookingRequestDecisions {
  openApprove: (target: BookingRequestDecisionTarget) => void;
  openReject: (target: BookingRequestDecisionTarget) => void;
  openCancel: (target: BookingRequestDecisionTarget) => void;
  /**
   * Quyết định nào đang chạy cho yêu cầu `id` — web `decisionActionFor`. Thẻ khoá cả ba nút trong
   * lúc đó: bấm đúp "Duyệt" là gửi hai lượt, lượt thứ hai chỉ trả về một lỗi khó hiểu.
   */
  decisionActionFor: (id: string) => BookingRequestDecisionAction | null;
  /** Bốn tấm trượt (duyệt · kết quả duyệt · từ chối · huỷ) — gắn MỘT lần ở cuối màn gọi. */
  sheets: ReactNode;
}

/**
 * Duyệt / từ chối / huỷ một yêu cầu — bản native của `useBookingRequestDecisions` bên web.
 *
 * Tồn tại để "Chuyến cho thuê" của chủ xe tuyến hoa hồng (PR #158) đi qua CÙNG ba mutation, cùng
 * bảng lỗi có lối đi tiếp (`decisionErrorKey` / `cancelErrorKey`) và cùng bốn tấm trượt với hộp
 * thư gian hàng — quy tắc thuê dài hạn, hạn phản hồi và lỗi trùng lịch không trôi khỏi nhau.
 *
 * Lượt duyệt KHÔNG toast: tấm kết quả đọc `bookingId` của bản ghi server vừa trả để nói đúng một
 * trong hai kết cục (ADR 0044 điều 2) — "đã tạo đơn" là câu sai ở nhánh mặc định.
 */
export function useBookingRequestDecisions(): BookingRequestDecisions {
  const t = useTranslations('BookingRequests');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const approve = useApproveBookingRequest();
  const reject = useRejectBookingRequest();
  const cancel = useCancelBookingRequest();

  const [approving, setApproving] = useState<BookingRequestDecisionTarget | null>(null);
  const [approved, setApproved] = useState<BookingRequestDecisionTarget | null>(null);
  const [rejecting, setRejecting] = useState<BookingRequestDecisionTarget | null>(null);
  /** Chuyến ĐÃ NHẬN đang chờ huỷ (ADR 0045 điều 1) — khác hẳn `rejecting` về đường tiền. */
  const [cancelling, setCancelling] = useState<BookingRequestDecisionTarget | null>(null);

  function decisionError(error: unknown): string {
    const key = decisionErrorKey(getErrorCode(error));
    return key ? t(key) : errorMessage(error);
  }

  function confirmApprove(body?: ApproveBookingRequestInput) {
    if (!approving) return;
    approve.mutate(
      { id: approving.id, ...(body ? { body } : {}) },
      {
        onSuccess: (result) => {
          setApproving(null);
          setApproved(result);
        },
        onError: (error) => toast.showError(decisionError(error)),
      },
    );
  }

  function confirmReject(reason: string) {
    if (!rejecting) return;
    reject.mutate(
      { id: rejecting.id, reason },
      {
        onSuccess: () => {
          toast.showSuccess(t('reject.success'));
          setRejecting(null);
        },
        onError: (error) => toast.showError(decisionError(error)),
      },
    );
  }

  function confirmCancel(body: CancelBookingRequestInput) {
    if (!cancelling) return;
    cancel.mutate(
      { id: cancelling.id, body },
      {
        onSuccess: () => {
          toast.showSuccess(t('cancel.success'));
          setCancelling(null);
        },
        // Khách chuyển khoản đúng lúc này ⇒ yêu cầu đã thành đơn, lệnh huỷ nhận 409 có lối đi tiếp.
        onError: (error) => {
          const key = cancelErrorKey(getErrorCode(error));
          toast.showError(key ? t(key) : errorMessage(error));
        },
      },
    );
  }

  // Gắn CÓ ĐIỀU KIỆN — `defaultValues` của tấm trượt chỉ đọc lúc dựng.
  const sheets = (
    <>
      {approving ? (
        <ApproveRequestSheet
          open
          onClose={() => setApproving(null)}
          request={approving}
          onConfirm={confirmApprove}
          loading={approve.isPending}
        />
      ) : null}
      {approved ? (
        <ApproveSuccessSheet request={approved} onClose={() => setApproved(null)} />
      ) : null}
      {rejecting ? (
        <RejectRequestSheet
          open
          onClose={() => setRejecting(null)}
          request={rejecting}
          onConfirm={confirmReject}
          loading={reject.isPending}
        />
      ) : null}
      {cancelling ? (
        <CancelRequestSheet
          open
          onClose={() => setCancelling(null)}
          request={cancelling}
          onConfirm={confirmCancel}
          loading={cancel.isPending}
        />
      ) : null}
    </>
  );

  const approvingId = approve.isPending ? approve.variables?.id : undefined;
  const rejectingId = reject.isPending ? reject.variables?.id : undefined;
  const cancellingId = cancel.isPending ? cancel.variables?.id : undefined;
  // Ổn định giữa các lần render — chỉ đổi khi một mutation đổi trạng thái, nên danh sách gọi nó
  // chỉ vẽ lại các thẻ đúng lúc đó.
  const decisionActionFor = useCallback(
    (id: string): BookingRequestDecisionAction | null => {
      if (approvingId === id) return 'approve';
      if (rejectingId === id) return 'reject';
      if (cancellingId === id) return 'cancel';
      return null;
    },
    [approvingId, rejectingId, cancellingId],
  );

  return {
    openApprove: setApproving,
    openReject: setRejecting,
    openCancel: setCancelling,
    decisionActionFor,
    sheets,
  };
}
