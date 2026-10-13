'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { useState } from 'react';
import { isNegativeMoney, subtractMoney } from '@xeprime/domain';
import {
  API_ERROR_CODE,
  isPaymentOrderViewStateSettling,
  PAYMENT_GATEWAY_CLIENT,
  PAYMENT_GATEWAY_MIN_HOLD_WINDOW_MINUTES,
  PAYMENT_ORDER_POLL_MS,
  PAYMENT_ORDER_VIEW_STATE,
  PERMISSION,
  type PaymentGatewayProvider,
  type PaymentOrderViewState,
} from '@xeprime/types';
import { useNow } from '@/hooks/use-now';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorCode } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { fetchGatewayMethods, fetchGatewayOrder, startGatewayCheckout } from './api';
import {
  PAYMENT_SURFACE,
  surfaceOf,
  type GatewayTarget,
  type PaymentGatewayMethod,
  type PaymentOrder,
  type PaymentSurface,
  type StartGatewayCheckoutInput,
} from './types';

/**
 * Còn hỏi lại bao lâu sau khi liên kết đã hết hạn dùng lại: một khoản trả ở phút cuối có IPN tới trễ
 * vài phút, và người đang nhìn màn hình đó xứng đáng thấy nó đổi mà không phải F5.
 */
const POLL_GRACE_AFTER_EXPIRY_MS = 5 * 60_000;

/** Cấu hình cổng gần như không đổi trong một phiên làm việc — đọc một lần là đủ. */
export function useGatewayMethods(surface: PaymentSurface, enabled = true) {
  return useQuery({
    queryKey: queryKeys.paymentGateway.methods(surface),
    queryFn: () => fetchGatewayMethods(surface),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Lượt này còn đáng hỏi lại không — còn đang chờ cổng/đang ghi nhận, và chưa quá hạn quá lâu. */
export function shouldPollGatewayOrder(order: PaymentOrder | undefined, now: number = Date.now()) {
  if (!order) return false;
  const state = order.viewState as PaymentOrderViewState;
  if (!isPaymentOrderViewStateSettling(state)) return false;
  /*
   * Cổng đã xác nhận không có giao dịch (khách huỷ ở cổng): không còn gì để chờ trên lượt này. Nếu
   * tiền vẫn về, đích (khoản giữ chỗ / hoá đơn) đổi và trang biết qua thông báo realtime của nó.
   */
  if (order.noTransaction) return false;
  if (state === PAYMENT_ORDER_VIEW_STATE.AWAITING) {
    return now < new Date(order.expiresAt).getTime() + POLL_GRACE_AFTER_EXPIRY_MS;
  }
  return true;
}

/**
 * Có nên mời mở một phiên cổng MỚI khi trang đang nói về lượt `order` không.
 *
 * Không, khi lượt đó còn liên kết dùng được (nút "Tiếp tục thanh toán" ở thông báo đã làm việc đó),
 * đang ghi nhận, đã xong, hay đang chờ người xử lý — mở phiên mới lúc ấy là mời khách trả HAI lần.
 * Có, khi lượt đã thất bại/huỷ/hết hạn, hoặc liên kết đã quá hạn dùng lại. Đang tải thì chưa vẽ gì
 * để không chớp nút rồi tắt.
 */
export function canStartAnotherCheckout(
  order: PaymentOrder | undefined,
  { failedToLoad }: { failedToLoad: boolean },
): boolean {
  // Không đọc được lượt (ID gõ tay, lượt của người khác): server vẫn là chốt chặn trả trùng.
  if (!order) return failedToLoad;
  switch (order.viewState as PaymentOrderViewState) {
    case PAYMENT_ORDER_VIEW_STATE.FAILED:
      return true;
    case PAYMENT_ORDER_VIEW_STATE.AWAITING:
      // Liên kết đã hết hạn dùng, hoặc cổng xác nhận phiên này không có giao dịch (khách đã huỷ).
      return order.noTransaction || order.checkoutUrl === null;
    default:
      return false;
  }
}

/**
 * Một lượt thanh toán qua cổng, TỰ HỎI LẠI khi còn chờ.
 *
 * Kết quả đến từ IPN (cổng gọi server) hoặc truy vấn phía server — không từ URL quay về. Nhịp hỏi
 * dừng ở mọi chặng kết thúc; tab ẩn thì thôi hỏi (mặc định của TanStack).
 *
 * Không thử lại khi `NOT_FOUND`: lượt của người khác hay một ID gõ tay sẽ không tự xuất hiện.
 */
export function useGatewayOrder(surface: PaymentSurface, orderId: string | null) {
  return useQuery({
    queryKey: queryKeys.paymentGateway.order(surface, orderId ?? ''),
    queryFn: () => fetchGatewayOrder(surface, orderId as string),
    enabled: Boolean(orderId),
    refetchInterval: (query) =>
      shouldPollGatewayOrder(query.state.data) ? PAYMENT_ORDER_POLL_MS : false,
    retry: (failureCount, error) =>
      getErrorCode(error) !== API_ERROR_CODE.NOT_FOUND && failureCount < 2,
  });
}

/** Mở phiên — nơi gọi chuyển trang sang `checkoutUrl` khi thành công. */
export function useStartGatewayCheckout(target: GatewayTarget) {
  return useMutation({
    mutationFn: (body: StartGatewayCheckoutInput) => startGatewayCheckout(target, body),
  });
}

/** Một kênh của cổng có thể KHÔNG dùng được cho khoản này — và vì sao, để giao diện nói đúng câu. */
export interface GatewayMethodAvailability {
  method: PaymentGatewayMethod;
  /** Số tiền nằm ngoài hạn mức một giao dịch của cổng — server cũng từ chối, đây chỉ là báo trước. */
  outOfRange: boolean;
}

/**
 * Toàn bộ phần "trả qua cổng" (MoMo/VNPAY — ADR 0058) của một khoản: kênh nào đang mở, kênh nào
 * vượt hạn mức, còn đủ thời gian để mở phiên không, và hành động mở phiên rồi rời trang.
 *
 * Tách khỏi giao diện vì trang thanh toán đặt LỰA CHỌN (danh sách ví ở cột trái) và HÀNH ĐỘNG (nút
 * "Thanh toán" ở thẻ tóm tắt bên phải) ở hai nơi khác nhau — hai nửa đó phải đọc cùng một trạng thái.
 *
 * Bấm ⇒ server mở phiên (số tiền và mã đọc từ DB — không gửi từ đây) ⇒ trình duyệt chuyển sang trang
 * của cổng. Không có gì ở đây nói "đã thanh toán": kết quả về server qua IPN, trang quay về hỏi server.
 */
export function useGatewayCheckout(
  target: GatewayTarget,
  {
    amount,
    deadline,
    enabled = true,
  }: {
    /** Số còn phải trả (VND, chuỗi) — chỉ để báo trước hạn mức; server mới là nơi quyết. */
    amount: string;
    /** Hạn của khoản (tiền giữ chỗ) — còn quá ít thì không mời mở phiên cổng. */
    deadline?: string | null;
    /** `false` = khoản đang có một lượt cổng còn dùng được / đang ghi nhận — không mời mở lượt mới. */
    enabled?: boolean;
  },
) {
  const locale = useLocale() === 'en' ? 'en' : 'vi';
  const surface = surfaceOf(target);
  const { has } = usePermissions();
  // Trả hoá đơn gói là bước cuối của MUA gói — cùng quyền. Server gác lại bằng chính quyền đó.
  const allowed = surface === PAYMENT_SURFACE.CUSTOMER || has(PERMISSION.SUBSCRIPTION_PURCHASE);
  const methodsQ = useGatewayMethods(surface, allowed && enabled);
  const start = useStartGatewayCheckout(target);
  /** Đã có liên kết và đang rời trang — giữ nút quay cho tới khi trang đổi. */
  const [redirecting, setRedirecting] = useState(false);
  const [missingLink, setMissingLink] = useState(false);
  // Nhịp nửa phút: kênh cổng tắt kịp khi hạn giữ chỗ trôi qua mốc tối thiểu lúc khách còn ở trang.
  const now = useNow(30_000);

  const methods: GatewayMethodAvailability[] =
    allowed && enabled
      ? (methodsQ.data?.methods ?? []).map((method) => ({
          method,
          outOfRange:
            (method.minAmount != null &&
              isNegativeMoney(subtractMoney(amount, method.minAmount))) ||
            (method.maxAmount != null && isNegativeMoney(subtractMoney(method.maxAmount, amount))),
        }))
      : [];

  /*
   * So hai mốc: hạn của khoản (server lưu) với đồng hồ máy. Lệch đồng hồ chỉ làm kênh hiện/ẩn sớm
   * hay muộn vài giây — server vẫn từ chối bằng `PAYMENT_HOLD_WINDOW_TOO_SHORT` theo đồng hồ của nó.
   */
  const windowTooShort =
    deadline != null &&
    new Date(deadline).getTime() - now < PAYMENT_GATEWAY_MIN_HOLD_WINDOW_MINUTES * 60_000;

  const busy = start.isPending || redirecting;

  function pay(provider: PaymentGatewayProvider) {
    // Bấm dồn khi đang mở phiên hoặc đang rời trang không mở thêm phiên nào.
    if (busy) return;
    setMissingLink(false);
    start.mutate(
      { provider, client: PAYMENT_GATEWAY_CLIENT.WEB, locale },
      {
        onSuccess: (order) => {
          if (!order.checkoutUrl) {
            setMissingLink(true);
            return;
          }
          setRedirecting(true);
          window.location.assign(order.checkoutUrl);
        },
      },
    );
  }

  return {
    methods,
    sandbox: methodsQ.data?.sandbox === true,
    windowTooShort,
    busy,
    /** Lỗi của lượt mở phiên gần nhất (server từ chối, mạng) — nơi gọi đổi ra câu qua `useErrorMessage`. */
    error: start.isError ? start.error : null,
    missingLink,
    pay,
  };
}

export type GatewayCheckout = ReturnType<typeof useGatewayCheckout>;
