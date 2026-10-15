import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useLocale, useTranslations } from 'use-intl';
import {
  isPaymentOrderViewStateSettling,
  MOBILE_APP_SCHEME,
  MOBILE_CLIENT_APP,
  PAYMENT_GATEWAY_CLIENT,
  PAYMENT_ORDER_STATUS,
  PAYMENT_ORDER_TARGET,
  PAYMENT_ORDER_VIEW_STATE,
  PAYMENT_RETURN_PARAM,
  type PaymentOrderViewState,
} from '@xeprime/types';
import {
  PAYMENT_SURFACE,
  type PaymentGatewayMethod,
  type PaymentOrder,
} from '@/api/payment-gateway/api';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { useDomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { queryKeys } from '@/queries/query-keys';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { useGatewayMethods, useGatewayOrder, useStartTripGatewayCheckout } from '../hooks';
import { canStartAnotherCheckout, isHoldWindowTooShort, isOutOfRange } from '../order-state';
import { forgetTripOrder, recallTripOrder, rememberTripOrder } from '../trip-order-memory';

/** Deep link quay về đúng chuyến — trùng với nút "Mở lại ứng dụng" mà trang quay về (server dựng) hiện. */
export function tripReturnUrl(tripId: string): string {
  return `${MOBILE_APP_SCHEME[MOBILE_CLIENT_APP.CUSTOMER]}://trips/${encodeURIComponent(tripId)}`;
}

function firstParam(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v ? v : null;
}

/**
 * Trạng thái lối MoMo / VNPAY của MỘT chuyến — dùng chung cho khối thông báo (đứng NGOÀI panel giữ
 * chỗ, như `TripGatewayReturn` bên web) và các nút trả (trong slot của panel). Panel chỉ vẽ slot khi
 * khoản còn chờ tiền; thông báo của lượt (đã ghi nhận / hoàn trùng / cần hỗ trợ) phải sống tiếp
 * sau đó.
 *
 * Lượt đang theo dõi nằm ở tham số route `paymentOrder` (cùng tên với web) VÀ ở kho bền theo
 * `tripId` — để nó sống qua lần Android giết tiến trình khi khách đang ở app ví. Mất lượt là nút
 * trả hiện lại, tức mời khách trả lần hai qua cổng kia.
 */
export function useTripGateway(tripId: string) {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const routeOrderId = firstParam(params[PAYMENT_RETURN_PARAM.TRIP_ORDER]);
  const queryClient = useQueryClient();
  const [storedOrderId, setStoredOrderId] = useState<string | null>(null);
  const orderId = routeOrderId ?? storedOrderId;
  const [browsing, setBrowsing] = useState(false);
  const order = useGatewayOrder(PAYMENT_SURFACE.CUSTOMER, orderId);
  const refetchOrder = order.refetch;

  // Route không mang lượt thì đọc lại từ kho bền lúc mở màn.
  useEffect(() => {
    if (routeOrderId) return;
    let alive = true;
    void recallTripOrder(tripId).then((remembered) => {
      if (alive && remembered) setStoredOrderId(remembered);
    });
    return () => {
      alive = false;
    };
  }, [tripId, routeOrderId]);

  // Lượt đã xong hẳn (tiền vào đích / thất bại) ⇒ không còn gì phải nhớ qua lần khởi động sau.
  const viewState = order.data?.viewState;
  useEffect(() => {
    if (!orderId) return;
    if (
      viewState === PAYMENT_ORDER_VIEW_STATE.COMPLETED ||
      viewState === PAYMENT_ORDER_VIEW_STATE.FAILED
    ) {
      void forgetTripOrder(tripId, orderId);
    }
  }, [tripId, orderId, viewState]);

  const refreshTrips = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
  }, [queryClient]);

  const track = useCallback(
    (created: PaymentOrder) => {
      queryClient.setQueryData(
        queryKeys.paymentGateway.order(PAYMENT_SURFACE.CUSTOMER, created.id),
        created,
      );
      setStoredOrderId(created.id);
      router.setParams({ [PAYMENT_RETURN_PARAM.TRIP_ORDER]: created.id });
      void rememberTripOrder(tripId, created.id, created.expiresAt);
    },
    [queryClient, router, tripId],
  );

  const openCheckout = useCallback(
    async (url: string) => {
      setBrowsing(true);
      try {
        await WebBrowser.openAuthSessionAsync(url, tripReturnUrl(tripId));
      } finally {
        setBrowsing(false);
        // Kết quả hỏi SERVER, không đọc từ URL mà trình duyệt trả về.
        void refetchOrder();
        refreshTrips();
      }
    },
    [tripId, refetchOrder, refreshTrips],
  );

  return { tripId, orderId, order, browsing, track, openCheckout, refreshTrips };
}

export type TripGatewayState = ReturnType<typeof useTripGateway>;

/**
 * Thông báo của lượt đang theo dõi — sống ĐỘC LẬP với trạng thái khoản giữ chỗ cho các KẾT QUẢ
 * (đã ghi nhận / hoàn trùng / cần hỗ trợ / thất bại).
 *
 * Riêng lượt còn CHỜ TRẢ (`awaiting`) thì chỉ có nghĩa khi khoản giữ chỗ còn chờ tiền: lượt được nhớ
 * tới 24h sau hạn, nên khi khoản đã trả bằng đường khác (VietQR/SePay) hay đã hết hạn mà vẫn mời
 * "Tiếp tục thanh toán" là mời khách trả HAI lần. Khi đó ẩn lời mời và quên lượt luôn — cũng như lượt
 * `awaiting` đã quá hạn (không còn `checkoutUrl`): không còn kết quả nào để chờ báo.
 */
export function TripGatewayNotice({
  gateway,
  holdAwaitingPayment,
}: {
  gateway: TripGatewayState;
  /** Khoản giữ chỗ của chuyến còn ở `pending`/`underpaid` (`isAwaitingPayment`). */
  holdAwaitingPayment: boolean;
}) {
  const { tripId, orderId, order, openCheckout, refreshTrips } = gateway;
  const awaiting = order.data?.viewState === PAYMENT_ORDER_VIEW_STATE.AWAITING;
  const stale = awaiting && (!holdAwaitingPayment || !order.data?.checkoutUrl);
  useEffect(() => {
    if (orderId && stale) void forgetTripOrder(tripId, orderId);
  }, [tripId, orderId, stale]);

  if (!orderId) return null;
  if (awaiting && !holdAwaitingPayment) return null;
  return (
    <GatewayOrderNotice
      order={order.data}
      loading={order.isPending}
      failed={order.isError}
      onRetry={() => void order.refetch()}
      onContinue={(url) => void openCheckout(url)}
      onSettled={refreshTrips}
    />
  );
}

/**
 * Các nút MoMo / VNPAY cho TIỀN GIỮ CHỖ — bản native của `TripGatewayOptions` (ADR 0058: BỔ SUNG
 * dưới VietQR, mặc định TẮT).
 *
 * Không vẽ gì khi server không mở phương thức nào (chưa cấu hình, luồng chưa bật, đang tải, lỗi),
 * hay khi lượt đang theo dõi còn dùng được / đã xong (mở thêm là mời trả HAI lần). Bấm ⇒ server mở
 * phiên (số tiền/mã đọc từ DB) ⇒ mở trang cổng bằng trình duyệt hệ thống. Không có gì ở đây nói
 * "đã thanh toán".
 */
export function TripGatewayPay({
  gateway,
  amount,
  deadline,
}: {
  gateway: TripGatewayState;
  /** Số còn phải trả — chỉ để báo trước hạn mức của cổng; server mới quyết. */
  amount: string;
  /** Hạn của khoản giữ chỗ — còn quá ít thì không mời mở phiên cổng. */
  deadline?: string | null;
}) {
  const t = useTranslations('PaymentGateway.checkout');
  const locale = useLocale() === 'en' ? 'en' : 'vi';
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const methods = useGatewayMethods(PAYMENT_SURFACE.CUSTOMER);
  const start = useStartTripGatewayCheckout(gateway.tripId);
  const [chosen, setChosen] = useState<string | null>(null);
  const [missingLink, setMissingLink] = useState(false);
  /**
   * Chốt chống BẤM DỒN: `busy` là state, hai lần chạm trong cùng một khung hình đều đọc giá trị cũ
   * (`false`) và cùng gọi `mutate` ⇒ hai phiên cổng. Ref đổi ngay, không đợi render.
   */
  const inFlight = useRef(false);

  const list = methods.data?.methods ?? [];
  if (list.length === 0) return null;

  const { orderId, order, browsing, track, openCheckout } = gateway;
  const sandbox = methods.data?.sandbox === true;
  const busy = start.isPending || browsing;
  const showOptions =
    !orderId || canStartAnotherCheckout(order.data, { failedToLoad: order.isError });
  if (!showOptions) return null;

  function pay(provider: PaymentGatewayMethod['provider']) {
    if (inFlight.current || busy) return;
    inFlight.current = true;
    setChosen(provider);
    setMissingLink(false);
    start.mutate(
      { provider, client: PAYMENT_GATEWAY_CLIENT.NATIVE, locale },
      {
        onSuccess: (created) => {
          track(created);
          if (!created.checkoutUrl) {
            setMissingLink(true);
            return;
          }
          void openCheckout(created.checkoutUrl);
        },
        onSettled: () => {
          inFlight.current = false;
        },
      },
    );
  }

  return (
    <YStack gap={space.sm} accessibilityLabel={t('wallet.title')}>
      <XStack ai="center" gap={space.xs} flexWrap="wrap">
        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
          {t('wallet.title')}
        </Text>
        {sandbox ? (
          <Text col={colors.warning} fos={fontSize.bodySm} fow={fontWeight.medium}>
            {t('wallet.sandbox')}
          </Text>
        ) : null}
      </XStack>

      {isHoldWindowTooShort(deadline) ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('wallet.windowTooShort')}
        </Text>
      ) : (
        list.map((method) => {
          const label = domainLabel('paymentGatewayProvider', method.provider);
          const blocked = isOutOfRange(method, amount);
          return (
            <YStack key={method.provider} gap={space.xs}>
              <Button
                block
                variant="secondary"
                label={t('pay.withProvider', { provider: label })}
                loading={busy && chosen === method.provider}
                disabled={blocked || (busy && chosen !== method.provider)}
                onPress={() => pay(method.provider)}
              />
              {blocked ? (
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('wallet.outOfRange', {
                    provider: label,
                    min: method.minAmount ? fmt.money(method.minAmount) : '—',
                    max: method.maxAmount ? fmt.money(method.maxAmount) : '—',
                  })}
                </Text>
              ) : null}
            </YStack>
          );
        })
      )}

      {start.isError ? <Callout tone="danger">{errorMessage(start.error)}</Callout> : null}
      {missingLink ? <Callout tone="danger">{t('wallet.missingLink')}</Callout> : null}

      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {sandbox ? `${t('wallet.redirectNote')} ${t('wallet.sandboxHint')}` : t('wallet.redirectNote')}
      </Text>
    </YStack>
  );
}

/** Trạng thái MỘT lượt — mọi chữ theo `viewState` do SERVER tính (bản native của `GatewayOrderNotice`). */
export function GatewayOrderNotice({
  order,
  loading,
  failed,
  onRetry,
  onContinue,
  onSettled,
}: {
  order: PaymentOrder | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onContinue: (checkoutUrl: string) => void;
  /** Gọi MỘT lần mỗi khi lượt rời các chặng còn chờ — nơi gọi làm mới dữ liệu đích. */
  onSettled?: (order: PaymentOrder) => void;
}) {
  const t = useTranslations('PaymentGateway.order');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const lastState = useRef<string | null>(null);
  useEffect(() => {
    if (!order) return;
    const previous = lastState.current;
    lastState.current = order.viewState;
    if (
      previous !== order.viewState &&
      !isPaymentOrderViewStateSettling(order.viewState as PaymentOrderViewState)
    ) {
      onSettled?.(order);
    }
  }, [order, onSettled]);

  if (!order) {
    if (failed) {
      return (
        <YStack gap={space.xs}>
          <Callout tone="danger">{t('loadError')}</Callout>
          <Button variant="secondary" label={tCommon('actions.retry')} onPress={onRetry} />
        </YStack>
      );
    }
    return loading ? (
      <Callout tone="info">
        <XStack ai="center" gap={space.xs}>
          <ActivityIndicator size="small" color={colors.info} />
          <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
            {t('loading')}
          </Text>
        </XStack>
      </Callout>
    ) : null;
  }

  const provider = domainLabel('paymentGatewayProvider', order.provider);
  const amount = fmt.money(order.amount);
  const sandbox = order.sandbox ? ` (${t('sandbox')})` : '';

  switch (order.viewState as PaymentOrderViewState) {
    case PAYMENT_ORDER_VIEW_STATE.AWAITING:
      return order.checkoutUrl ? (
        <YStack gap={space.xs}>
          <Callout tone="info" title={t('awaitingTitle', { provider, amount })}>
            {`${t('awaitingBody')}${sandbox}`}
          </Callout>
          <Button
            variant="secondary"
            label={t('continue')}
            onPress={() => onContinue(order.checkoutUrl as string)}
          />
        </YStack>
      ) : (
        <Callout tone="warning" title={t('expiredTitle', { provider })}>
          {t('expiredBody')}
        </Callout>
      );
    case PAYMENT_ORDER_VIEW_STATE.CONFIRMING:
      return (
        <Callout tone="info" title={t('confirmingTitle', { provider, amount })}>
          {t('confirmingBody')}
        </Callout>
      );
    case PAYMENT_ORDER_VIEW_STATE.COMPLETED:
      return (
        <Callout tone="success" title={t('completedTitle', { amount, provider })}>
          {`${
            order.targetType === PAYMENT_ORDER_TARGET.SUBSCRIPTION_INVOICE
              ? t('completedInvoice', { code: order.targetCode })
              : t('completedHold', { code: order.targetCode })
          }${sandbox}`}
        </Callout>
      );
    case PAYMENT_ORDER_VIEW_STATE.DUPLICATE_REFUNDED:
      return (
        <Callout tone="info" title={t('duplicateRefundedTitle', { amount, provider })}>
          {t('duplicateRefundedBody', { code: order.targetCode })}
        </Callout>
      );
    case PAYMENT_ORDER_VIEW_STATE.NEEDS_SUPPORT:
      return (
        <Callout tone="warning" title={t('needsSupportTitle', { amount })}>
          {t('needsSupportBody', { code: order.id })}
        </Callout>
      );
    default:
      return (
        <Callout
          tone="warning"
          title={
            order.status === PAYMENT_ORDER_STATUS.CANCELLED
              ? t('cancelledTitle', { provider })
              : order.status === PAYMENT_ORDER_STATUS.EXPIRED
                ? t('expiredResultTitle', { provider })
                : t('failedTitle', { provider })
          }
        >
          {t('failedBody', { code: order.id })}
        </Callout>
      );
  }
}
