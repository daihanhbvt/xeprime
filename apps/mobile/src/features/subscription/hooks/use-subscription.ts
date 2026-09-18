import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SUBSCRIPTION_INVOICE_STATUS } from '@xeprime/types';
import { useAppActive, useRefetchOnForeground } from '@/hooks/use-app-active';
import { queryKeys } from '@/queries/query-keys';
import {
  subscriptionApi,
  type PurchaseSubscriptionInput,
  type SubscriptionInvoice,
} from '@/api/subscription/api';

/**
 * Nhịp hỏi lại trạng thái hoá đơn trong lúc chờ đối soát ngân hàng — cùng 8 giây với web.
 *
 * SePay đẩy webhook trong vài giây sau khi tiền về, nên nhịp nhanh hơn chỉ tốn request mà không
 * sớm hơn được; nhịp chậm hơn thì người vừa chuyển khoản ngồi nhìn một màn hình không đổi và bắt
 * đầu nghi ngờ mình chuyển sai.
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
 * Đây là thứ làm cho màn thanh toán sống lại sau khi app bị tắt: nó không đọc state nào của màn,
 * chỉ đọc server. Mở lại app giữa lúc chuyển khoản vẫn thấy đúng mã, đúng số còn thiếu, đúng QR.
 *
 * `refetchInterval` là HÀM: nó nhận kết quả mới nhất và tự tắt khi hoá đơn tới trạng thái kết
 * thúc. Một con số cố định sẽ polling mãi mãi trên một màn đã xong việc — và màn "Gói của tôi"
 * thì mở rất lâu.
 *
 * ## `useAppActive` là BẮT BUỘC ở đây, khác web
 *
 * Web viết được `refetchInterval` trần vì tab bị ẩn thì trình duyệt tự dừng nó. React Native không
 * có `document.visibilityState`, nên `focusManager` của TanStack coi app là đang focus MÃI MÃI —
 * nhịp 8 giây tiếp tục chạy khi máy nằm trong túi. Và đúng màn này là màn bị đưa xuống nền nhiều
 * nhất trong cả app: luồng của nó là "rời app → mở app ngân hàng → quay lại". Một hoá đơn `issued`
 * chờ hàng giờ trước khi void, tức là hàng nghìn request cho một màn không ai nhìn.
 *
 * `useRefetchOnForeground` lo nửa còn lại: quay về từ app ngân hàng phải thấy kết quả NGAY, không
 * phải đợi hết một nhịp — webhook SePay thường đã chạy xong trong lúc người dùng còn ở bên kia.
 */
export function usePendingInvoice(enabled = true) {
  const appActive = useAppActive();
  const query = useQuery({
    queryKey: queryKeys.subscription.pendingInvoice(),
    queryFn: () => subscriptionApi.pendingInvoice(),
    enabled,
    refetchInterval: (q) => (appActive && isAwaitingPayment(q.state.data) ? INVOICE_POLL_MS : false),
  });

  const { refetch } = query;
  useRefetchOnForeground(
    useCallback(() => {
      if (enabled) void refetch();
    }, [enabled, refetch]),
  );

  return query;
}

/** Bản native của `features/subscription/hooks/use-subscription.ts` — cùng khoá, cùng luật. */
export function useMySubscription(enabled = true) {
  return useQuery({
    queryKey: queryKeys.subscription.me(),
    queryFn: () => subscriptionApi.me(),
    enabled,
  });
}

export function useTenantPlans(enabled = true) {
  return useQuery({
    queryKey: queryKeys.subscription.plans(),
    queryFn: () => subscriptionApi.plans(),
    enabled,
  });
}

/** Thông tin nhận tiền của nền tảng — đổi khi ops đổi tài khoản, tức gần như không bao giờ. */
export function usePaymentInfo(enabled = true) {
  return useQuery({
    queryKey: queryKeys.subscription.paymentInfo(),
    queryFn: () => subscriptionApi.paymentInfo(),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useSubscriptionInvoices(page: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.subscription.invoices(page),
    queryFn: () => subscriptionApi.invoices(page),
    enabled,
  });
}

/**
 * Mua/gia hạn — invalidate cả nhánh: hoá đơn mới đổi lịch sử, hoá đơn chờ cũ bị void, và
 * `pendingInvoice` giờ trả về đúng mã vừa tạo.
 *
 * `setQueryData` cho `pendingInvoice` NGAY từ kết quả mutation, trước khi lượt invalidate kịp quay
 * về: màn onboarding đọc chính khoá đó để quyết định hiện bộ chọn gói hay hiện QR, nên chờ thêm
 * một round-trip là một nhịp nhấp nháy đúng vào lúc người dùng vừa bấm.
 */
export function usePurchaseSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PurchaseSubscriptionInput) => subscriptionApi.purchase(body),
    onSuccess: (invoice) => {
      queryClient.setQueryData(queryKeys.subscription.pendingInvoice(), invoice);
      void queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
    },
  });
}
