'use client';

import { App } from 'antd';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { API_ERROR_CODE, SERVICE_TYPE } from '@xeprime/types';

import { useErrorMessage } from '@/i18n/use-error-message';
import { getErrorCode } from '@/services/api-client';

import { ApproveBookingRequestDialog } from '../components/ApproveBookingRequestDialog';
import { ApproveLongTermDialog } from '../components/ApproveLongTermDialog';
import { ApproveSuccessDialog } from '../components/ApproveSuccessDialog';
import { RejectBookingRequestDialog } from '../components/RejectBookingRequestDialog';
import type { ApproveBookingRequestInput, BookingRequestDecisionTarget } from '../types';
import { useApproveBookingRequest, useRejectBookingRequest } from './use-booking-request-mutations';

export interface BookingRequestDecisions {
  /** Mở hộp thoại duyệt đúng loại dịch vụ (thuê dài hạn phải chốt ngày giờ nhận — ADR 0011). */
  openApprove: (request: BookingRequestDecisionTarget) => void;
  openReject: (request: BookingRequestDecisionTarget) => void;
  /** Quyết định đang chạy trên ĐÚNG yêu cầu này — để khoá nút của riêng nó. */
  decisionActionFor: (id: string) => 'approve' | 'reject' | null;
  /** Bốn hộp thoại của luồng quyết định. Đặt một lần ở cuối cây của màn dùng nó. */
  dialogs: ReactNode;
}

/**
 * Luồng QUYẾT ĐỊNH một yêu cầu thuê: duyệt · duyệt thuê dài hạn · từ chối · báo kết quả.
 *
 * Tách khỏi `BookingRequestsView` ngày 08/09/2026 khi khu tài khoản có bề mặt thứ hai cần đúng
 * luồng này ("Chuyến của tôi" phía chủ xe). Đây là chỗ dễ trôi nhất nếu chép: nó cầm hai
 * mutation, bốn hộp thoại, quy tắc "thuê dài hạn đi hộp thoại khác", và hai mã lỗi có LỐI ĐI
 * TIẾP riêng. Một bản sao thiếu một nhánh lỗi là một màn hình nuốt mất 409 trùng lịch.
 *
 * Hook KHÔNG cầm quyền: màn gọi tự quyết có render nút duyệt hay không theo
 * `booking_requests.approve`. Guard backend mới là lớp chặn thật (CLAUDE.md §3).
 *
 * Cố ý KHÔNG ôm luôn "nhắn tin cho khách" và bốn overlay chi tiết: chúng có đích khác nhau ở
 * từng bề mặt (hộp thư mở chat của gian hàng; khu tài khoản thì chưa), nên chúng ở lại phía
 * màn gọi.
 */
export function useBookingRequestDecisions(): BookingRequestDecisions {
  const t = useTranslations('BookingRequests');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();

  const approve = useApproveBookingRequest();
  const reject = useRejectBookingRequest();

  const [approveTarget, setApproveTarget] = useState<BookingRequestDecisionTarget | null>(null);
  const [longTermTarget, setLongTermTarget] = useState<BookingRequestDecisionTarget | null>(null);
  const [rejectTarget, setRejectTarget] = useState<BookingRequestDecisionTarget | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);
  /** Yêu cầu vừa duyệt xong — mở hộp kết quả kèm lối sang đơn vừa tạo. */
  const [approvedResult, setApprovedResult] = useState<BookingRequestDecisionTarget | null>(null);

  function decisionActionFor(id: string): 'approve' | 'reject' | null {
    if (approve.isPending && approve.variables?.id === id) return 'approve';
    if (reject.isPending && reject.variables?.id === id) return 'reject';
    return null;
  }

  /**
   * Hai lỗi có LỐI ĐI TIẾP riêng, nên chúng không được rơi vào câu chung:
   *
   *  - trùng lịch (409, từ constraint DB — ADR 0006): chọn khung giờ khác hoặc xe khác;
   *  - quá hạn phản hồi: không còn gì để bấm, việc cần làm là gọi cho khách.
   *
   * Dùng chung cho cả duyệt và từ chối vì cả hai đều qua cùng cửa `claimPending` ở server.
   */
  function decisionErrorText(err: unknown): string {
    const code = getErrorCode(err);
    if (code === API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT) return t('approve.scheduleConflict');
    if (code === API_ERROR_CODE.BOOKING_REQUEST_EXPIRED) return t('approve.expired');
    return errorMessage(err);
  }

  /**
   * Dịch vụ theo ngày: lịch đã có trên yêu cầu → hỏi xác nhận rồi duyệt. THUÊ DÀI HẠN: khách
   * mới nêu nguyện vọng, gian hàng phải chốt ngày giờ nhận trong hộp thoại (ADR 0011).
   */
  function openApprove(row: BookingRequestDecisionTarget) {
    setApproveError(null);
    if (row.serviceType === SERVICE_TYPE.LONG_TERM) setLongTermTarget(row);
    else setApproveTarget(row);
  }

  function openReject(row: BookingRequestDecisionTarget) {
    setRejectError(null);
    setRejectTarget(row);
  }

  function confirmApprove(row: BookingRequestDecisionTarget, body?: ApproveBookingRequestInput) {
    setApproveError(null);
    approve.mutate(
      { id: row.id, body },
      {
        /*
         * Kết quả mở thành một HỘP THOẠI, không phải toast: duyệt xong là đã có một đơn thuê
         * thật và người trực còn nguyên một chuỗi việc trên chính đơn đó. Toast báo xong rồi
         * biến mất bỏ họ lại giữa danh sách yêu cầu, phải tự đi tìm đơn mình vừa tạo.
         */
        onSuccess: (approved) => {
          setApproveTarget(null);
          setLongTermTarget(null);
          setApprovedResult(approved);
        },
        // Trùng lịch (409): GIỮ hộp thoại mở để chọn giờ khác, không mất dữ liệu đã nhập.
        onError: (err) => setApproveError(decisionErrorText(err)),
      },
    );
  }

  function confirmReject(reason: string) {
    if (!rejectTarget) return;
    setRejectError(null);
    reject.mutate(
      { id: rejectTarget.id, reason },
      {
        onSuccess: () => {
          message.success(t('reject.success'));
          setRejectTarget(null);
        },
        // Hộp thoại ở lại: lý do vừa gõ là công sức thật, không được nuốt mất vì một lần lỗi.
        onError: (err) => setRejectError(decisionErrorText(err)),
      },
    );
  }

  const dialogs = (
    <>
      {/* Dựng có điều kiện: mỗi lần duyệt là một instance mới, không giữ lại đơn của lần trước. */}
      {approvedResult ? (
        <ApproveSuccessDialog
          request={approvedResult}
          open
          onClose={() => setApprovedResult(null)}
        />
      ) : null}

      <ApproveBookingRequestDialog
        request={approveTarget}
        submitting={approve.isPending}
        error={approveError}
        onCancel={() => {
          setApproveTarget(null);
          setApproveError(null);
        }}
        onConfirm={() => approveTarget && confirmApprove(approveTarget)}
      />

      <ApproveLongTermDialog
        request={longTermTarget}
        submitting={approve.isPending}
        error={approveError}
        onCancel={() => {
          setLongTermTarget(null);
          setApproveError(null);
        }}
        onConfirm={(body) => longTermTarget && confirmApprove(longTermTarget, body)}
      />

      <RejectBookingRequestDialog
        request={rejectTarget}
        submitting={reject.isPending}
        error={rejectError}
        onCancel={() => {
          setRejectTarget(null);
          setRejectError(null);
        }}
        onConfirm={confirmReject}
      />
    </>
  );

  return { openApprove, openReject, decisionActionFor, dialogs };
}
