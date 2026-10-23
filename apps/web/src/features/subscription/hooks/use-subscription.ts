'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { API_ERROR_CODE, SUBSCRIPTION_INVOICE_STATUS, planVehicleScopeOf } from '@xeprime/types';
import { useBadgeRealtime } from '@/features/badges/BadgeRealtimeProvider';
import { getErrorCode } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import {
  fetchInvoice,
  fetchInvoices,
  fetchPaymentInfo,
  fetchMySubscription,
  fetchPendingInvoices,
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
 * KHÔNG polling khi không còn hoá đơn nào chờ tiền — xem `usePendingInvoices`.
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
 * Các hoá đơn gói ĐANG chờ tiền — tối đa MỘT mỗi phạm vi loại xe (ADR 0040 · ADR 0065), tự hỏi
 * lại trong lúc chờ.
 *
 * Đây là thứ làm cho màn thanh toán "sống lại" sau một lần F5: nó không đọc state nào của
 * component, chỉ đọc server. Đóng trình duyệt giữa lúc chuyển khoản rồi mở lại vẫn thấy đúng mã,
 * đúng số còn thiếu.
 *
 * `refetchInterval` là HÀM: nó tự tắt khi danh sách không còn hoá đơn nào chờ tiền. Một con số cố
 * định sẽ polling mãi mãi trên một màn hình đã xong việc — và trang gói thì mở rất lâu.
 */
export function usePendingInvoices(enabled = true) {
  const { live } = useBadgeRealtime();
  const pollMs = live ? INVOICE_POLL_LIVE_MS : INVOICE_POLL_FALLBACK_MS;
  return useQuery({
    queryKey: queryKeys.subscription.pendingInvoice(),
    queryFn: fetchPendingInvoices,
    enabled,
    refetchInterval: (query) => ((query.state.data ?? []).some(isAwaitingPayment) ? pollMs : false),
  });
}

/**
 * MỘT hoá đơn — trang thanh toán `/payment/:invoiceId`. Hỏi lại theo cùng nhịp với
 * `usePendingInvoices` (lưới an toàn — đường chính là thông báo `subscription_activated` làm mới
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
 * Một hoá đơn vừa RỜI trạng thái chờ ⇒ hỏi lại scope thật.
 *
 * Tiền về là webhook SePay lật hoá đơn `paid`, bật thuê bao và hoàn tất onboarding trong MỘT
 * transaction (ADR 0040). Client không biết điều đó xảy ra lúc nào, nên `usePendingInvoices` hỏi
 * lại theo nhịp. Lượt hỏi mà một mã ĐÃ THẤY đang chờ biến khỏi danh sách là tín hiệu duy nhất đáng
 * tin, và hook này biến nó thành một lần làm mới `/auth/me` + nhánh gói. Điều hướng thì để nơi gọi
 * lo, sau khi scope mới thật sự về.
 *
 * Theo dõi TẬP mã đang chờ, không phải "có/không": gian hàng có hoá đơn xe máy lẫn ô tô cùng chờ
 * (ADR 0065) trả xong mã xe máy thì danh sách vẫn còn một phần tử — một cờ boolean sẽ không thấy
 * gì đổi, và gói xe máy vừa bật không hiện ra cho tới lần F5.
 *
 * Mã chưa từng thấy đang chờ thì không tính — mở trang khi chưa có hoá đơn nào không làm mới gì.
 * Cũng chạy đúng khi hoá đơn hết hạn (`void`): scope không đổi, màn hình quay về bộ chọn gói.
 */
export function useSyncScopeWhenInvoiceSettles(enabled = true): void {
  const queryClient = useQueryClient();
  const pending = usePendingInvoices(enabled);
  const awaitingKey = (pending.data ?? [])
    .filter(isAwaitingPayment)
    .map((invoice) => invoice.id)
    .sort()
    .join(',');
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (pending.isPending) return;
    const now = new Set(awaitingKey ? awaitingKey.split(',') : []);
    const settled = [...seen.current].some((id) => !now.has(id));
    seen.current = now;
    if (!settled) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
    // Gói hiện hành đổi cùng lúc — khối gói phải nói con số mới, không phải bậc cũ.
    void queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
  }, [awaitingKey, pending.isPending, queryClient]);
}

/**
 * `enabled` cho nơi gọi TẮT hẳn lượt đọc khi người xem không có `subscription.view` (vd thẻ gói
 * trên Tổng quan của một nhân viên) — gọi rồi nuốt 403 là một dòng lỗi vô ích trong log.
 */
export function useMySubscription(enabled = true) {
  return useQuery({ queryKey: queryKeys.subscription.me(), queryFn: fetchMySubscription, enabled });
}

/**
 * Danh mục gói đang bán — PHẲNG, mỗi bậc mang `vehicleScope` (ADR 0065). Các làn chia nhóm bằng
 * `packagePlansForScope` trên chính danh sách này: một lượt đọc cho mọi nơi (bảng giá, tên bậc trên
 * hoá đơn), cùng thứ tự `sortOrder` mà `GET /subscription/plan-catalog` nhóm lại.
 */
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
 * Mua/gia hạn MỘT phạm vi — invalidate cả nhánh: hoá đơn mới đổi lịch sử, hoá đơn chờ CÙNG phạm
 * vi bị void, và danh sách chờ giờ có đúng mã vừa tạo.
 *
 * `setQueryData` cho danh sách chờ NGAY từ kết quả mutation, trước khi lượt invalidate kịp quay
 * về: màn onboarding đọc chính key đó để quyết định hiện bộ chọn hay hiện hoá đơn chờ, nên chờ một
 * round-trip nữa là một nhịp nhấp nháy đúng vào lúc người dùng vừa bấm. Hoá đơn cũ cùng phạm vi bị
 * thay — server vừa void nó — còn hoá đơn của phạm vi kia giữ nguyên.
 */
export function usePurchaseSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PurchaseSubscriptionInput) => purchaseSubscription(body),
    onSuccess: (invoice) => {
      const scope = planVehicleScopeOf(invoice.vehicleScope);
      queryClient.setQueryData<SubscriptionInvoice[]>(
        queryKeys.subscription.pendingInvoice(),
        (current) => [
          invoice,
          ...(current ?? []).filter((other) => planVehicleScopeOf(other.vehicleScope) !== scope),
        ],
      );
      // Nơi gọi có thể chuyển ngay sang trang thanh toán của hoá đơn này — trang đó mở ra có sẵn dữ liệu.
      queryClient.setQueryData(queryKeys.subscription.invoice(invoice.id), invoice);
      void queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
    },
  });
}
