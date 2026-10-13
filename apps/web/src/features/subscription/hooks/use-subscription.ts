'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { API_ERROR_CODE, SUBSCRIPTION_INVOICE_STATUS } from '@xeprime/types';
import { useBadgeRealtime } from '@/features/badges/BadgeRealtimeProvider';
import { getErrorCode } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import {
  fetchInvoice,
  fetchInvoices,
  fetchPaymentInfo,
  fetchMySubscription,
  fetchPendingInvoice,
  fetchTenantPlans,
  purchaseSubscription,
} from '../api';
import type { PurchaseSubscriptionInput, SubscriptionInvoice } from '../types';

/**
 * Nhịp hỏi lại hoá đơn đang chờ tiền — chỉ là LƯỚI AN TOÀN, không phải đường chính.
 *
 * Đường chính là thông báo `subscription_activated` mà webhook phát trong transaction kích hoạt:
 * bản chiếu huy hiệu đẩy nó tới trình duyệt và `refreshNotificationAffected` làm mới nhánh
 * `subscription` ngay lúc đó. Hỏi lại vài giây một lần trên một hoá đơn sống tới ba ngày là mỗi
 * tab đang mở bắn một dòng request đều đặn vào API và Postgres để nhận cùng một câu trả lời.
 *
 *  - Nghe được bản chiếu: hai phút — chỉ bắt ca worker chết hoặc bản chiếu lệch, cùng nhịp lưới
 *    an toàn của huy hiệu (`BadgeRealtimeProvider`).
 *  - Không nghe được (chưa bật Firestore, mất quyền, rớt mạng): hai mươi giây — cùng nhịp màn chờ
 *    tiền giữ chỗ (`useTrip`).
 *
 * Người chuyển khoản trên điện thoại rồi quay lại tab không phải đợi nhịp nào:
 * `refetchOnWindowFocus` (mặc định của TanStack) hỏi lại ngay khi tab có focus.
 *
 * KHÔNG polling khi hoá đơn đã ở trạng thái kết thúc (`paid`/`void`) — xem `usePendingInvoice`.
 */
const INVOICE_POLL_LIVE_MS = 120_000;
const INVOICE_POLL_FALLBACK_MS = 20_000;

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
  const { live } = useBadgeRealtime();
  const pollMs = live ? INVOICE_POLL_LIVE_MS : INVOICE_POLL_FALLBACK_MS;
  return useQuery({
    queryKey: queryKeys.subscription.pendingInvoice(),
    queryFn: fetchPendingInvoice,
    enabled,
    refetchInterval: (query) => (isAwaitingPayment(query.state.data) ? pollMs : false),
  });
}

/**
 * MỘT hoá đơn — trang thanh toán `/payment/:invoiceId`. Hỏi lại theo cùng nhịp với
 * `usePendingInvoice` (lưới an toàn — đường chính là thông báo `subscription_activated` làm mới
 * nhánh `subscription`), và dừng hẳn khi hoá đơn tới trạng thái kết thúc.
 *
 * Không thử lại khi `NOT_FOUND`: id gõ tay hay hoá đơn của gian hàng khác sẽ không tự xuất hiện.
 */
export function useSubscriptionInvoice(id: string) {
  const { live } = useBadgeRealtime();
  const pollMs = live ? INVOICE_POLL_LIVE_MS : INVOICE_POLL_FALLBACK_MS;
  return useQuery({
    queryKey: queryKeys.subscription.invoice(id),
    queryFn: () => fetchInvoice(id),
    enabled: Boolean(id),
    refetchInterval: (query) => (isAwaitingPayment(query.state.data) ? pollMs : false),
    retry: (failureCount, error) =>
      getErrorCode(error) !== API_ERROR_CODE.NOT_FOUND && failureCount < 2,
  });
}

/**
 * Hoá đơn vừa RỜI trạng thái chờ ⇒ hỏi lại scope thật.
 *
 * Tiền về là webhook SePay lật hoá đơn `paid`, bật thuê bao và hoàn tất onboarding trong MỘT
 * transaction (ADR 0040). Client không biết điều đó xảy ra lúc nào, nên `usePendingInvoice` hỏi
 * lại theo nhịp và tự dừng khi hoá đơn tới trạng thái kết thúc. Lượt hỏi CUỐI CÙNG đó — lượt trả
 * về `null` — là tín hiệu duy nhất đáng tin, và hook này biến nó thành một lần làm mới
 * `/auth/me`. Điều hướng thì để nơi gọi lo, sau khi scope mới thật sự về.
 *
 * Dùng ở CẢ HAI màn dẫn tới cùng một khoảnh khắc: bước 2 của onboarding gian hàng trả phí, và
 * bước 3 của luồng nâng cấp từ tuyến hoa hồng. Thiếu nó ở màn thứ hai, người vừa chuyển khoản
 * xong sẽ thấy màn thanh toán lặng lẽ quay về BẢNG GIÁ — vì hoá đơn hết "chờ" trong khi scope
 * vẫn nói họ ở tuyến hoa hồng.
 *
 * `seenAwaiting` là thứ phân biệt "vừa trả xong" với "chưa bao giờ tạo hoá đơn": cả hai đều cho
 * `data === null`, và làm mới scope ở ca thứ hai là một lượt gọi vô ích mỗi lần trang mở.
 *
 * Cũng chạy đúng khi hoá đơn hết hạn (`void`): scope không đổi, màn hình quay về bộ chọn gói.
 */
export function useSyncScopeWhenInvoiceSettles(enabled = true): void {
  const queryClient = useQueryClient();
  const pending = usePendingInvoice(enabled);
  const status = pending.data?.status ?? null;
  const awaiting =
    status === SUBSCRIPTION_INVOICE_STATUS.ISSUED ||
    status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID;
  const seenAwaiting = useRef(false);

  useEffect(() => {
    if (awaiting) {
      seenAwaiting.current = true;
      return;
    }
    if (!seenAwaiting.current) return;
    seenAwaiting.current = false;
    void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
    // Gói hiện hành đổi cùng lúc — khối "Gói & hạn mức" phải nói con số mới, không phải bậc cũ.
    void queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
  }, [awaiting, queryClient]);
}

/**
 * `enabled` cho nơi gọi TẮT hẳn lượt đọc khi người xem không có `subscription.view` (vd thẻ gói
 * trên Tổng quan của một nhân viên) — gọi rồi nuốt 403 là một dòng lỗi vô ích trong log.
 */
export function useMySubscription(enabled = true) {
  return useQuery({ queryKey: queryKeys.subscription.me(), queryFn: fetchMySubscription, enabled });
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
 * quay về: màn onboarding đọc chính key đó để quyết định hiện form hay hiện hoá đơn chờ, nên chờ
 * một round-trip nữa là một nhịp nhấp nháy đúng vào lúc người dùng vừa bấm. Cùng lý do cho
 * `invoice(id)` — trang thanh toán mà nơi gọi chuyển tới ngay sau đó.
 */
export function usePurchaseSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PurchaseSubscriptionInput) => purchaseSubscription(body),
    onSuccess: (invoice) => {
      queryClient.setQueryData(queryKeys.subscription.pendingInvoice(), invoice);
      // Nơi gọi chuyển ngay sang trang thanh toán của hoá đơn này — trang đó mở ra có sẵn dữ liệu.
      queryClient.setQueryData(queryKeys.subscription.invoice(invoice.id), invoice);
      void queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
    },
  });
}
