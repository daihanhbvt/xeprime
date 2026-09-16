'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SUBSCRIPTION_INVOICE_STATUS } from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';
import {
  fetchInvoices,
  fetchPaymentInfo,
  fetchMySubscription,
  fetchPendingInvoice,
  fetchTenantPlans,
  purchaseSubscription,
} from '../api';
import type { PurchaseSubscriptionInput, SubscriptionInvoice } from '../types';

/**
 * Nhịp hỏi lại trạng thái hoá đơn trong lúc chờ đối soát ngân hàng.
 *
 * 8 giây: SePay đẩy webhook trong vài giây sau khi tiền về, nên nhịp nhanh hơn chỉ tốn request
 * mà không sớm hơn được; nhịp chậm hơn thì người vừa chuyển khoản ngồi nhìn một màn hình không
 * đổi và bắt đầu nghi ngờ mình chuyển sai.
 *
 * KHÔNG polling khi hoá đơn đã ở trạng thái kết thúc (`paid`/`void`) — xem `usePendingInvoice`.
 */
const INVOICE_POLL_MS = 8_000;

/** Hoá đơn còn có thể nhận thêm tiền ⇒ còn đáng hỏi lại. */
function isAwaitingPayment(invoice: SubscriptionInvoice | null | undefined): boolean {
  return (
    invoice?.status === SUBSCRIPTION_INVOICE_STATUS.ISSUED ||
    invoice?.status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID
  );
}

/**
 * Hoá đơn gói ĐANG chờ tiền, tự hỏi lại trong lúc chờ (ADR 0040).
 *
 * Đây là thứ làm cho màn thanh toán "sống lại" sau một lần F5: nó không đọc state nào của
 * component, chỉ đọc server. Đóng trình duyệt giữa lúc chuyển khoản rồi mở lại vẫn thấy đúng mã,
 * đúng số còn thiếu, đúng QR.
 *
 * `refetchInterval` là HÀM: nó nhận kết quả mới nhất và tự tắt khi hoá đơn tới trạng thái kết
 * thúc. Một con số cố định sẽ polling mãi mãi trên một màn hình đã xong việc — và trang "Gói của
 * tôi" thì mở rất lâu.
 *
 * `refetchIntervalInBackground` để mặc định (false): tab bị ẩn thì thôi hỏi. Kích hoạt gói là
 * việc của webhook, không phải của một tab còn mở — quay lại tab là có một lượt fetch ngay.
 */
export function usePendingInvoice(enabled = true) {
  return useQuery({
    queryKey: queryKeys.subscription.pendingInvoice(),
    queryFn: fetchPendingInvoice,
    enabled,
    refetchInterval: (query) => (isAwaitingPayment(query.state.data) ? INVOICE_POLL_MS : false),
  });
}

export function useMySubscription() {
  return useQuery({ queryKey: queryKeys.subscription.me(), queryFn: fetchMySubscription });
}

export function useTenantPlans(enabled = true) {
  return useQuery({
    queryKey: queryKeys.subscription.plans(),
    queryFn: fetchTenantPlans,
    enabled,
  });
}

/** Thông tin nhận tiền của nền tảng — đổi khi ops đổi tài khoản, tức gần như không bao giờ. */
export function usePaymentInfo(enabled = true) {
  return useQuery({
    queryKey: queryKeys.subscription.paymentInfo(),
    queryFn: fetchPaymentInfo,
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useSubscriptionInvoices(page: number) {
  return useQuery({
    queryKey: queryKeys.subscription.invoices(page),
    queryFn: () => fetchInvoices(page),
  });
}

/**
 * Mua/gia hạn — invalidate cả nhánh: hoá đơn mới đổi lịch sử, hoá đơn chờ cũ bị void, và
 * `pendingInvoice` giờ trả về đúng mã vừa tạo.
 *
 * `setQueryData` cho `pendingInvoice` NGAY từ kết quả mutation, trước khi lượt invalidate kịp
 * quay về: màn onboarding đọc chính key đó để quyết định hiện form hay hiện QR, nên chờ một
 * round-trip nữa là một nhịp nhấp nháy đúng vào lúc người dùng vừa bấm.
 */
export function usePurchaseSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PurchaseSubscriptionInput) => purchaseSubscription(body),
    onSuccess: (invoice) => {
      queryClient.setQueryData(queryKeys.subscription.pendingInvoice(), invoice);
      void queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
    },
  });
}
