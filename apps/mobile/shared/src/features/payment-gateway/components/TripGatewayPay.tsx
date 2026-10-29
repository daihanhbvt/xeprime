import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useLocale, useTranslations } from 'use-intl';
import {
  buildNativeTripReturnUrl,
  isPaymentOrderViewStateSettling,
  MOBILE_APP_SCHEME,
  MOBILE_CLIENT_APP,
  PAYMENT_GATEWAY_CLIENT,
  PAYMENT_ORDER_STATUS,
  PAYMENT_ORDER_TARGET,
  PAYMENT_ORDER_VIEW_STATE,
  PAYMENT_RETURN_PARAM,
  STATUS_COLOR,
  type PaymentOrderViewState,
} from '@xeprime/types';
import {
  PAYMENT_SURFACE,
  type PaymentGatewayMethod,
  type PaymentOrder,
} from '@/api/payment-gateway/api';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { useDomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { queryKeys } from '@/queries/query-keys';
import { layout } from '@/theme/layout';
import { themed, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import { useGatewayMethods, useGatewayOrder, useStartTripGatewayCheckout } from '../hooks';
import { canStartAnotherCheckout, isHoldWindowTooShort, isOutOfRange } from '../order-state';
import { PaymentMethodHeader } from './PaymentMethodHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { paymentProviderLogo, paymentProviderMark } from '../provider-logos';
import { ProviderLogoFrame } from '../ProviderLogoFrame';
import { forgetTripOrder, recallTripOrder, rememberTripOrder } from '../trip-order-memory';

/**
 * TIỀN TỐ deep link mà trình duyệt phải gặp để tự đóng — trùng tiền tố của nút "Mở lại ứng dụng" ở
 * trang quay về `/app-return` (giữ `trips/<id>` cho các bản app cũ). Trang nối thêm `paymentOrder`;
 * `+native-intent` của app khách đổi hướng link đó sang màn thanh toán `/payment/<id>`.
 */
export function tripReturnUrl(tripId: string): string {
  return buildNativeTripReturnUrl(MOBILE_APP_SCHEME[MOBILE_CLIENT_APP.CUSTOMER], tripId);
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
      busy={gateway.browsing}
      onRetry={() => void order.refetch()}
      onContinue={(url) => void openCheckout(url)}
      onSettled={refreshTrips}
    />
  );
}

/**
 * Ví điện tử MoMo / VNPAY cho TIỀN GIỮ CHỖ — bản native của nhóm "Ví điện tử" trong `CheckoutPanel`
 * + `useGatewayCheckout` (web, ADR 0058: BỔ SUNG dưới VietQR, mặc định TẮT).
 *
 * CHỌN rồi mới TRẢ, như web: danh sách ví (logo chính thức + tên; kênh vượt hạn mức nói vì sao) →
 * nút "Thanh toán qua {ví}". Chưa chọn thì nút tắt kèm lời nhắc chọn ví.
 *
 * Không vẽ gì khi server không mở phương thức nào (chưa cấu hình, luồng chưa bật, đang tải, lỗi),
 * hay khi lượt đang theo dõi còn dùng được / đang ghi nhận (mở thêm là mời trả HAI lần). Bấm ⇒
 * server mở phiên (số tiền/mã đọc từ DB) ⇒ mở trang cổng bằng trình duyệt hệ thống. Không có gì ở
 * đây nói "đã thanh toán".
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
  const colors = useColors();
  const t = useTranslations('PaymentGateway.checkout');
  const locale = useLocale() === 'en' ? 'en' : 'vi';
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const methods = useGatewayMethods(PAYMENT_SURFACE.CUSTOMER);
  const start = useStartTripGatewayCheckout(gateway.tripId);
  const [chosen, setChosen] = useState<PaymentGatewayMethod['provider'] | null>(null);
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
  /*
   * Như web (`/payment/:id`): thẻ "Ví điện tử" luôn nằm dưới VietQR, kể cả khi một lượt còn CHỜ —
   * thẻ trạng thái phía trên đã nói rõ lượt đó, và khách chọn ví khác là mở phiên MỚI (server cấp,
   * lượt cũ vẫn được IPN ghi nhận nếu lỡ trả). Chỉ ẩn khi lượt đang GHI NHẬN / đã có kết quả cần đọc.
   */
  const showOptions =
    !orderId ||
    canStartAnotherCheckout(order.data, { failedToLoad: order.isError }) ||
    order.data?.viewState === PAYMENT_ORDER_VIEW_STATE.AWAITING;
  if (!showOptions) return null;

  const tooShort = isHoldWindowTooShort(deadline);
  // Kênh đã chọn biến mất khỏi danh sách (server tắt) ⇒ lựa chọn mất theo, không suy từ state cũ.
  const picked = list.find((method) => method.provider === chosen) ?? null;
  const pickedBlocked = picked ? isOutOfRange(picked, amount) : false;
  const label = (provider: string) => domainLabel('paymentGatewayProvider', provider);

  function pay(provider: PaymentGatewayMethod['provider']) {
    if (inFlight.current || busy) return;
    inFlight.current = true;
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
    <Card>
      <YStack gap={layout.block} accessibilityLabel={t('wallet.title')}>
        <PaymentMethodHeader
          icon="wallet-outline"
          title={t('wallet.title')}
          badge={sandbox ? { label: t('wallet.sandbox'), color: STATUS_COLOR.WARNING } : null}
        />

        {tooShort ? (
          <Callout tone="warning">{t('wallet.windowTooShort')}</Callout>
        ) : (
          <>
            <YStack gap={space.sm} accessibilityRole="radiogroup">
              {list.map((method) => {
                const name = label(method.provider);
                const blocked = isOutOfRange(method, amount);
                const checked = chosen === method.provider;
                const logo = paymentProviderMark(method.provider);
                return (
                  <Pressable
                    key={method.provider}
                    accessibilityRole="radio"
                    accessibilityLabel={name}
                    accessibilityState={{ checked, disabled: busy }}
                    disabled={busy}
                    onPress={() => setChosen(method.provider)}
                  >
                    {/*
                      Một THẺ cho mỗi ví: logo trong khung ÔM theo tỉ lệ của chính nó (MoMo vuông,
                      VNPAY ngang) — khung rộng chung từng để logo vuông lọt thỏm giữa khoảng trắng.
                      Viền giữ 1px ở cả hai trạng thái để thẻ không nhảy khi chọn — trạng thái chọn
                      đọc bằng màu viền, nền và dấu tick.
                    */}
                    <XStack
                      ai="center"
                      gap={space.md}
                      px={space.md}
                      py={space.sm}
                      minHeight={sizing.touchTarget + space.md}
                      bw={1}
                      br={radius.lg}
                      bc={checked ? colors.primary : colors.border}
                      bg={checked ? colors.surfaceSelected : colors.surface}
                    >
                      {logo ? <ProviderLogoFrame logo={logo} dimmed={blocked} /> : null}
                      <YStack f={1} gap={2}>
                        <Text
                          col={blocked ? colors.textMuted : colors.text}
                          fos={fontSize.body}
                          fow={fontWeight.semibold}
                        >
                          {name}
                        </Text>
                        {blocked ? (
                          <Text col={colors.warning} fos={fontSize.bodySm}>
                            {t('wallet.outOfRange', {
                              provider: name,
                              min: method.minAmount ? fmt.money(method.minAmount) : '—',
                              max: method.maxAmount ? fmt.money(method.maxAmount) : '—',
                            })}
                          </Text>
                        ) : null}
                      </YStack>
                      <Ionicons
                        name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                        size={iconSize.lg}
                        color={checked ? colors.primary : colors.borderInput}
                      />
                    </XStack>
                  </Pressable>
                );
              })}
            </YStack>

            {picked ? null : (
              <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
                {t('pay.pickWallet')}
              </Text>
            )}
            <Button
              block
              size="lg"
              icon="wallet-outline"
              label={
                picked
                  ? t('pay.withProvider', { provider: label(picked.provider) })
                  : t('pay.submit')
              }
              loading={busy}
              disabled={!picked || pickedBlocked}
              onPress={() => {
                if (picked) pay(picked.provider);
              }}
            />
          </>
        )}

        {start.isError ? <Callout tone="danger">{errorMessage(start.error)}</Callout> : null}
        {missingLink ? <Callout tone="danger">{t('wallet.missingLink')}</Callout> : null}

        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {sandbox
            ? `${t('wallet.redirectNote')} ${t('wallet.sandboxHint')}`
            : t('wallet.redirectNote')}
        </Text>
      </YStack>
    </Card>
  );
}

type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

const useToneIcon = themed<
  Record<NoticeTone, { icon: keyof typeof Ionicons.glyphMap; color: string }>
>((colors) => ({
  info: { icon: 'information-circle', color: colors.info },
  success: { icon: 'checkmark-circle', color: colors.success },
  warning: { icon: 'alert-circle', color: colors.warning },
  danger: { icon: 'close-circle', color: colors.danger },
}));

/**
 * Khung thẻ của MỘT lượt cổng — cùng ngôn ngữ với thẻ phương thức (`PaymentMethodHeader` và hàng
 * ví): logo chính thức trong khung cố định · tiêu đề · số tiền màu giá · chỉ báo trạng thái, rồi
 * lời giải thích nhạt và các nút. Mọi `viewState` dùng chung khung này để đọc ra là CÙNG một lượt
 * đi qua các chặng, không phải mỗi chặng một kiểu hộp.
 */
function GatewayStatusCard({
  providerCode,
  title,
  amount,
  tone,
  live,
  badge,
  sandbox,
  body,
  children,
}: {
  providerCode: string;
  title: string;
  amount?: string;
  tone: NoticeTone;
  live?: boolean;
  badge?: string;
  sandbox?: boolean;
  body: string;
  children?: ReactNode;
}) {
  const colors = useColors();
  const TONE_ICON = useToneIcon();
  const t = useTranslations('PaymentGateway.order');
  const locale = useLocale() === 'en' ? 'en' : 'vi';
  const logo = paymentProviderLogo(providerCode, locale);
  const mark = TONE_ICON[tone];
  return (
    <Card>
      <YStack gap={layout.block}>
        <XStack ai="center" gap={space.md}>
          {logo ? <ProviderLogoFrame logo={logo} /> : null}
          <YStack f={1} gap={2}>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
              {title}
            </Text>
            {amount ? (
              <Text col={colors.price} fos={fontSize.h4} fow={fontWeight.bold}>
                {amount}
              </Text>
            ) : null}
          </YStack>
          {live ? (
            <ActivityIndicator size="small" color={colors.info} />
          ) : (
            <Ionicons name={mark.icon} size={iconSize.lg} color={mark.color} />
          )}
        </XStack>
        {badge || sandbox ? (
          <XStack gap={space.xs} flexWrap="wrap">
            {badge ? <StatusBadge label={badge} color={STATUS_COLOR.PROCESSING} size="sm" /> : null}
            {sandbox ? (
              <StatusBadge label={t('sandbox')} color={STATUS_COLOR.WARNING} size="sm" />
            ) : null}
          </XStack>
        ) : null}
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {body}
        </Text>
        {children ? <YStack gap={space.xs}>{children}</YStack> : null}
      </YStack>
    </Card>
  );
}

/** Trạng thái MỘT lượt — mọi chữ theo `viewState` do SERVER tính (bản native của `GatewayOrderNotice`). */
export function GatewayOrderNotice({
  order,
  loading,
  failed,
  busy = false,
  onRetry,
  onContinue,
  onSettled,
}: {
  order: PaymentOrder | undefined;
  loading: boolean;
  failed: boolean;
  /** Trình duyệt cổng đang mở — khoá các nút để không mở chồng phiên. */
  busy?: boolean;
  onRetry: () => void;
  onContinue: (checkoutUrl: string) => void;
  /** Gọi MỘT lần mỗi khi lượt rời các chặng còn chờ — nơi gọi làm mới dữ liệu đích. */
  onSettled?: (order: PaymentOrder) => void;
}) {
  const colors = useColors();
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
          <Button
            variant="secondary"
            icon="refresh-outline"
            label={tCommon('actions.retry')}
            onPress={onRetry}
          />
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
  const card = {
    providerCode: order.provider,
    sandbox: order.sandbox,
  };

  switch (order.viewState as PaymentOrderViewState) {
    case PAYMENT_ORDER_VIEW_STATE.AWAITING:
      /*
       * Cổng đã KÝ XÁC NHẬN chưa có giao dịch nào — thường là khách vừa bấm Huỷ ở trang cổng. Không
       * quay "đang chờ" nữa và không mời mở lại liên kết vừa bị huỷ; các kênh trả ở ngay bên dưới
       * (server mở phiên MỚI). Tiền vẫn về trên phiên này thì màn tự đổi như thường.
       */
      if (order.noTransaction) {
        return (
          <GatewayStatusCard
            {...card}
            tone="warning"
            title={t('noTransactionTitle', { provider })}
            body={t('noTransactionBody', { provider })}
          />
        );
      }
      return order.checkoutUrl ? (
        <GatewayStatusCard
          {...card}
          tone="info"
          live
          badge={t('awaitingBadge')}
          title={t('awaitingHeading', { provider })}
          amount={amount}
          body={t('awaitingBody', { provider })}
        >
          <Button
            block
            label={t('continue')}
            icon="open-outline"
            loading={busy}
            onPress={() => onContinue(order.checkoutUrl as string)}
          />
        </GatewayStatusCard>
      ) : (
        <GatewayStatusCard
          {...card}
          tone="warning"
          title={t('expiredTitle', { provider })}
          body={t('expiredBody')}
        />
      );
    case PAYMENT_ORDER_VIEW_STATE.CONFIRMING:
      return (
        <GatewayStatusCard
          {...card}
          tone="info"
          live
          title={t('confirmingTitle', { provider, amount })}
          body={t('confirmingBody')}
        />
      );
    case PAYMENT_ORDER_VIEW_STATE.COMPLETED:
      return (
        <GatewayStatusCard
          {...card}
          tone="success"
          title={t('completedTitle', { amount, provider })}
          body={
            order.targetType === PAYMENT_ORDER_TARGET.SUBSCRIPTION_INVOICE
              ? t('completedInvoice', { code: order.targetCode })
              : t('completedHold', { code: order.targetCode })
          }
        />
      );
    case PAYMENT_ORDER_VIEW_STATE.DUPLICATE_REFUNDED:
      return (
        <GatewayStatusCard
          {...card}
          tone="info"
          title={t('duplicateRefundedTitle', { amount, provider })}
          body={t('duplicateRefundedBody', { code: order.targetCode })}
        />
      );
    case PAYMENT_ORDER_VIEW_STATE.NEEDS_SUPPORT:
      return (
        <GatewayStatusCard
          {...card}
          tone="warning"
          title={t('needsSupportTitle', { amount })}
          body={t('needsSupportBody', { code: order.id })}
        />
      );
    default:
      return (
        <GatewayStatusCard
          {...card}
          tone="danger"
          title={
            order.status === PAYMENT_ORDER_STATUS.CANCELLED
              ? t('cancelledTitle', { provider })
              : order.status === PAYMENT_ORDER_STATUS.EXPIRED
                ? t('expiredResultTitle', { provider })
                : t('failedTitle', { provider })
          }
          body={t('failedBody', { code: order.id })}
        />
      );
  }
}
