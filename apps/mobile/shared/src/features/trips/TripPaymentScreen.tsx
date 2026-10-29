import { APP_FEATURES } from '@/lib/app-features';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  BOOKING_HOLD_STATUS,
  HOLD_COUNTDOWN_URGENT_MINUTES,
  isAwaitingPayment,
  PAYMENT_RETURN_PARAM,
  SERVICE_TYPE,
  STATUS_COLOR,
  type BookingHoldStatus,
} from '@xeprime/types';
import { dayjs, LIST_SEPARATOR, payAtPickupAmount } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Countdown } from '@/components/ui/Countdown';
import { DataRow, Divider } from '@/components/ui/DataRow';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { getErrorCode } from '@/lib/api-client';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { elevation } from '@/theme/elevation';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { BankTransferDetails } from '@/features/payment-gateway/components/BankTransferDetails';
import {
  TripGatewayNotice,
  TripGatewayPay,
  useTripGateway,
  type TripGatewayState,
} from '@/features/payment-gateway/components/TripGatewayPay';
import { PaymentMethodHeader } from '@/features/payment-gateway/components/PaymentMethodHeader';
import { useGatewayMethods } from '@/features/payment-gateway/hooks';
import { PAYMENT_SURFACE } from '@/api/payment-gateway/api';
import { useListingSpecSummary } from '@/features/booking-requests/hooks/use-listing-spec-summary';
import { FreeCancelCountdown } from './components/FreeCancelCountdown';
import { TripHoldPanel } from './components/TripHoldPanel';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { isPaymentSuccessFresh } from './trip-flow';
import { useTrip } from './hooks/use-trips';
import type { CustomerTripDetail } from './api';
import { useFreeCancelNote } from './use-free-cancel-note';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/**
 * MÀN THANH TOÁN tiền giữ chỗ — bản native của `TripPaymentView` (web `/payment/:tripId`,
 * 13/10/2026).
 *
 * Tách khỏi màn chuyến vì hai màn trả lời hai câu khác nhau: màn chuyến kể chuyến đi, màn này chỉ có
 * MỘT việc — trả khoản giữ chỗ trước khi hết giờ. Khách tới đây ngay khi chuyến được nhận (luồng đặt
 * xe "Đặt ngay"), từ nút "Thanh toán ngay" của màn chuyến, và từ lời nhắc ở "Chuyến của tôi".
 *
 * Màn KHÔNG BAO GIỜ tự nói "đã thanh toán" vì một cú chạm hay một lượt quét: chuyến chỉ thành đơn
 * khi đối soát xác nhận đủ tiền (ADR 0044 điều 2). Màn đổi sang "đặt xe thành công" khi CHÍNH khoản
 * giữ chỗ đổi trạng thái — push/huy hiệu làm mới nó, nhịp hỏi lại của `useTrip` là lưới an toàn.
 * Không có nút tự khai "Tôi đã chuyển khoản" (web gỡ cùng đợt).
 */
export function TripPaymentScreen({ tripId }: { tripId: string }) {
  const t = useTranslations('Trips.payment');
  const router = useRouter();
  const trip = useTrip(tripId);
  // Vòng quay chỉ khi KHÁCH kéo — `isRefetching` bật cả ở nhịp poll hold và lượt quay về tiền cảnh.
  const pull = usePullRefresh(trip.refetch);
  const detailHref = ROUTES.booking.detail(tripId);

  const header = <AppHeader title={t('appTitle')} onBack={() => goBackOr(router, detailHref)} />;

  if (trip.isPending) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']}>
          <MiniRowsSkeleton rows={8} />
        </Screen>
      </>
    );
  }

  if (trip.isError || !trip.data) {
    const notFound = getErrorCode(trip.error) === API_ERROR_CODE.NOT_FOUND;
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          {notFound ? (
            <ScreenMessage
              icon="card-outline"
              title={t('notFoundTitle')}
              description={t('notFoundBody')}
              actionLabel={t('backToTrips')}
              onAction={() => router.replace(ROUTES.booking.list())}
            />
          ) : (
            <ScreenError
              error={trip.error}
              title={t('loadErrorTitle')}
              onRetry={() => void trip.refetch()}
            />
          )}
        </Screen>
      </>
    );
  }

  return (
    <TripPaymentBody
      trip={trip.data}
      refetch={pull.onRefresh}
      refreshing={pull.refreshing}
    />
  );
}

function TripPaymentBody({
  trip,
  refetch,
  refreshing,
}: {
  trip: CustomerTripDetail;
  refetch: () => void;
  refreshing: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Trips.payment');
  const router = useRouter();
  const detailHref = ROUTES.booking.detail(trip.id);
  /** Lượt MoMo/VNPAY — thông báo đứng TRÊN mọi thứ: đó là câu trả lời người vừa quay về đang tìm. */
  const gateway = useTripGateway(trip.id);
  const hold = trip.hold ?? null;
  const awaiting = hold != null && isAwaitingPayment(hold.status as BookingHoldStatus);

  /*
   * Khoản KHÉP thì đưa vùng cuộn về ĐẦU màn. Khách thường đang cuộn tận khối ví (cuối màn) lúc tiền
   * về, và nội dung "đã thanh toán" ngắn hơn hẳn — vị trí cuộn cũ nằm QUÁ đáy nội dung mới nên màn
   * hiện trắng trơn dưới thanh tiêu đề (đo trên máy 15/10/2026 sau lượt VNPAY: chi tiết chuyến được
   * mở đè lên, bấm Quay lại gặp màn trắng). Cuộn cả lúc màn được FOCUS lại, vì Android không vẽ lại
   * vùng cuộn của màn đang bị che.
   */
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (!awaiting) scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [awaiting]);
  useFocusEffect(
    useCallback(() => {
      if (!awaiting) scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [awaiting]),
  );

  return (
    <>
      {/* Figma: "Bước n / N" + vạch nằm TRONG thanh trên, dưới tiêu đề. */}
      <AppHeader
        title={t('appTitle')}
        onBack={() => goBackOr(router, detailHref)}
        {...(awaiting ? { below: <PaymentStepBar /> } : {})}
      />
      <Screen
        scrollRef={scrollRef}
        edges={['left', 'right', 'bottom']}
        refreshing={refreshing}
        onRefresh={refetch}
      >
        <YStack gap={layout.section}>
          {/* "Bước 3/4 · Thanh toán giữ chỗ" + thanh 4 đoạn (Figma `21850:69916`) — chỉ khi còn chờ trả. */}
          <TripGatewayNotice gateway={gateway} holdAwaitingPayment={awaiting} />
          {awaiting && hold ? (
            <AwaitingHold trip={trip} hold={hold} gateway={gateway} />
          ) : (
            <HoldSettled trip={trip} hold={hold} />
          )}
        </YStack>
      </Screen>
    </>
  );
}

/** Khoản còn đang chờ tiền — chọn kênh và trả (web `CheckoutPanel`, xếp chồng một cột). */
function AwaitingHold({
  trip,
  hold,
  gateway,
}: {
  trip: CustomerTripDetail;
  hold: Hold;
  gateway: TripGatewayState;
}) {
  const colors = useColors();
  const t = useTranslations('Trips.payment');
  const tHold = useTranslations('Trips.hold');
  const tCheckout = useTranslations('PaymentGateway.checkout');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const router = useRouter();

  const underpaid = hold.status === BOOKING_HOLD_STATUS.UNDERPAID;
  /*
   * Huỷ miễn phí tới khi nào — hoặc KHÔNG có — và huỷ muộn thì mất gì: báo TRƯỚC khi trả
   * (ADR 0032 điều 5 · ADR 0064). Cùng một câu với web `useFreeCancelNote`.
   */
  const freeCancelNote = useFreeCancelNote()(hold);
  const customerTotal = trip.estimate?.fees?.customerTotalAmount ?? null;
  // Cùng helper web: server tính sẵn, snapshot cũ lùi về tổng − giữ chỗ.
  const payAtPickup = payAtPickupAmount(trip.estimate?.fees);
  // Dòng thông số dưới tên xe ("5 chỗ · Số tự động · Xăng") — như `TripPaymentCheckout` web.
  const specs = useListingSpecSummary(trip.vehicle);
  /** "Thứ Tư, 14/10/2026 08:00" — thứ + mốc đầy đủ, như web. */
  const point = (iso: string) =>
    t('summary.point', { weekday: fmt.weekdayLong(dayjs(iso)), dateTime: fmt.dateTime(iso) });
  /** Tab đang mở — VietQR mặc định (kênh không phí, luôn có). */
  const [tab, setTab] = useState<'transfer' | 'wallet'>('transfer');
  // MoMo/VNPAY TẠM ẨN ở app theo `APP_FEATURES` (28/10/2026) — chỉ còn chuyển khoản VietQR.
  const gatewayMethods = useGatewayMethods(PAYMENT_SURFACE.CUSTOMER).data?.methods.length ?? 0;
  const walletAvailable = APP_FEATURES.walletGateways && gatewayMethods > 0;

  return (
    <YStack gap={layout.section}>
      {/*
        THỨ TỰ của Figma `21850:69916` (và web: cột phương thức trước, thẻ tóm tắt sau): chọn phương
        thức → "Thông tin thanh toán" (số phải trả, đồng hồ, chuyến, lưu ý). Nghiệp vụ giữ nguyên.
      */}
      <YStack gap={space.md}>
        <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
          {tCheckout('methodsTitle')}
        </Text>

        {underpaid ? (
          <Callout tone="warning">
            {tHold('partialIntro', { paid: fmt.money(hold.paidAmount) })}
          </Callout>
        ) : null}

        {/* Tab VietQR | Ví điện tử — tab ví chỉ có khi server mở ít nhất một cổng (ADR 0058). */}
        {walletAvailable ? (
          <XStack p={4} gap={4} br={radius.control} bg={colors.surfaceMuted}>
            {(['transfer', 'wallet'] as const).map((key) => {
              const active = tab === key;
              return (
                <Pressable
                  key={key}
                  style={{ flex: 1 }}
                  onPress={() => setTab(key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <YStack
                    minHeight={40}
                    ai="center"
                    jc="center"
                    br={radius.md}
                    bg={active ? colors.surface : 'transparent'}
                    style={active ? elevation.xs : undefined}
                  >
                    <Text
                      col={active ? colors.text : colors.textMuted}
                      fos={fontSize.body}
                      fow={active ? fontWeight.semibold : fontWeight.medium}
                    >
                      {key === 'transfer' ? tCheckout('tabTransfer') : tCheckout('wallet.title')}
                    </Text>
                  </YStack>
                </Pressable>
              );
            })}
          </XStack>
        ) : null}

        {tab === 'transfer' || !walletAvailable ? (
          /* Chuyển khoản VietQR — kênh không phí, đối soát tự động, và là kênh DUY NHẤT luôn có. */
          <Card>
            <YStack gap={layout.block}>
              <PaymentMethodHeader
                icon="qr-code-outline"
                title={tCheckout('transfer.title')}
                badge={{ label: tCheckout('transfer.badge'), color: STATUS_COLOR.SUCCESS }}
                subtitle={tCheckout('transfer.hint')}
              />
              <BankTransferDetails
                account={hold.paymentInfo}
                amount={hold.remainingAmount}
                code={hold.code}
              />
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {tCheckout('pay.transferAuto')}
              </Text>
            </YStack>
          </Card>
        ) : (
          /*
            Ví điện tử qua cổng (ADR 0058) — `TripGatewayPay` tự ẩn khi lượt đang theo dõi còn dùng
            được / đang ghi nhận (mở thêm là mời trả HAI lần).
          */
          <TripGatewayPay gateway={gateway} amount={hold.remainingAmount} deadline={hold.expiresAt} />
        )}
      </YStack>

      {/* "Thông tin thanh toán" — Figma: viền vàng, "Xem chi tiết" ở đầu, số giữ chỗ + đồng hồ dưới cùng. */}
      <YStack
        gap={space.sm}
        p={space.md}
        br={radius.card}
        bw={1}
        bc={colors.primaryGlow}
        bg={colors.surface}
      >
        {/* Tiêu đề + lối sang trang chi tiết CHÍNH chuyến này (đủ bảng kê, chính sách, chủ xe) — web #230. */}
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text f={1} col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
            {tCheckout('summary.title')}
          </Text>
          <Pressable
            onPress={() => router.push(ROUTES.booking.detail(trip.id))}
            accessibilityRole="link"
            hitSlop={space.sm}
          >
            <Text col={colors.primaryHover} fos={fontSize.body} fow={fontWeight.semibold}>
              {t('summary.viewDetail')}
            </Text>
          </Pressable>
        </XStack>
        {/* Ảnh xe bên trái, tên + thông số bên phải (Figma `21850:70592`). */}
        <XStack ai="center" gap={12}>
          <YStack w={PAY_VEHICLE_PHOTO.width} h={PAY_VEHICLE_PHOTO.height} br={radius.md} ov="hidden" bg={colors.surfaceMuted}>
            {trip.vehicle.imageUrl ? (
              <Image
                source={{ uri: trip.vehicle.imageUrl }}
                style={PAY_VEHICLE_PHOTO}
                contentFit="cover"
                cachePolicy="memory-disk"
                accessibilityLabel={trip.vehicle.name}
              />
            ) : null}
          </YStack>
          <YStack f={1} minWidth={0} gap={2}>
            <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
              {trip.vehicle.name}
            </Text>
            {specs.length > 0 ? (
              <Text col={colors.textMuted} fos={fontSize.body}>
                {specs.join(LIST_SEPARATOR)}
              </Text>
            ) : null}
          </YStack>
        </XStack>
        <Divider />
        {trip.pickupAt && trip.returnAt ? (
          <>
            <DataRow label={t('summary.pickupAt')} value={point(trip.pickupAt)} />
            <DataRow label={t('summary.returnAt')} value={point(trip.returnAt)} />
          </>
        ) : trip.serviceType === SERVICE_TYPE.LONG_TERM ? (
          /* Dài hạn chưa chốt lịch (ADR 0011): kể gói + nguyện vọng như web, không có mốc nhận/trả. */
          <>
            <DataRow
              label={t('summary.package')}
              value={fmt.packageLabel(trip.longTermPackageMonths) ?? '—'}
            />
            <DataRow label={t('summary.pickupWish')} value={fmt.pickupWish(trip)} />
          </>
        ) : null}
        <DataRow label={t('service')} value={dl('serviceType', trip.serviceType)} />
        {customerTotal != null ? (
          <DataRow label={t('summary.customerTotal')} value={fmt.money(customerTotal)} />
        ) : null}
        {payAtPickup ? (
          <YStack gap={2}>
            <XStack ai="center" jc="space-between" gap={space.sm}>
              <Text f={1} col={colors.textMuted} fos={fontSize.body}>
                {t('summary.payOwner')}
              </Text>
              {/* Figma: "Trả chủ xe" tô xanh — tiền mặt trả tay chủ xe, XePrime không thu hộ. */}
              <Text col={colors.success} fos={fontSize.body} fow={fontWeight.semibold}>
                {fmt.money(payAtPickup)}
              </Text>
            </XStack>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('summary.payOwnerNote')}
            </Text>
          </YStack>
        ) : null}
        <DataRow label={tCheckout('summary.code')} value={hold.code} strong />
        <Divider />
        <YStack gap={space.xs}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {underpaid ? t('summary.remainingLabel') : t('summary.amountLabel')}
          </Text>
          <Text col={colors.primaryHover} fos={fontSize.lead} fow={fontWeight.semibold}>
            {fmt.money(hold.remainingAmount)}
          </Text>
          <Countdown
            deadline={hold.expiresAt}
            urgentMs={HOLD_COUNTDOWN_URGENT_MINUTES * 60_000}
            labels={{
              remaining: t('summary.countdown'),
              expired: tHold('countdownExpired'),
            }}
          />
          <FreeCancelCountdown hold={hold} />
        </YStack>
        {/* Hộp lưu ý nền vàng nhạt trong thẻ (Figma). Cùng khoá + thứ tự với web (`summary.notes.*`). */}
        <YStack gap={space.xs} p={12} br={radius.control} bg={colors.primarySubtle}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
            {t('summary.notes.auto')}
          </Text>
          <Text col={colors.warning} fos={fontSize.bodySm}>
            {`• ${t('summary.notes.expires')}`}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {`• ${freeCancelNote}`}
          </Text>
          {payAtPickup == null ? (
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {`• ${tHold('restAtHandover')}`}
            </Text>
          ) : null}
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('summary.notes.safety')}
          </Text>
        </YStack>
      </YStack>
    </YStack>
  );
}

/**
 * Khoản đã KHÉP (hoặc chuyến không có khoản nào) — nói kết cục và chỉ đường đi tiếp. Không còn gì
 * để trả ở đây, nên không dựng lại phương thức thanh toán nào.
 */
function HoldSettled({ trip, hold }: { trip: CustomerTripDetail; hold: Hold | null }) {
  const t = useTranslations('Trips.payment');
  const router = useRouter();
  const fmt = useAppFormat();
  const params = useLocalSearchParams<{ [PAYMENT_RETURN_PARAM.TRIP_ORDER]?: string }>();
  /*
   * CHỐT một lần, ở lần ĐẦU có tín hiệu — vừa quay về từ cổng, hoặc `paidAt` có giá trị — chứ
   * không phải lúc dựng màn: tiền có thể về khi màn đã mở, và chốt lúc dựng thì khối thành công không bao giờ hiện cho đúng khoản vừa trả. Đã chốt
   * thì nhịp hỏi lại không làm khối biến mất khi vượt mốc 30′ lúc khách đang đọc.
   */
  const returned = Boolean(params[PAYMENT_RETURN_PARAM.TRIP_ORDER]);
  const paidAt = hold?.paidAt ?? null;
  const [freshLatch, setFreshLatch] = useState<boolean | null>(() =>
    paidAt || returned ? isPaymentSuccessFresh(paidAt, returned) : null,
  );
  // Chỉnh state NGAY trong lượt render (mẫu "derived state" của React) — chạy đúng một lần vì
  // nhánh chỉ mở khi chưa chốt.
  if (freshLatch === null && (paidAt || returned)) {
    setFreshLatch(isPaymentSuccessFresh(paidAt, returned));
  }
  const successFresh = freshLatch ?? false;
  const toast = useAppToast();
  const dl = useDomainLabel();
  const tSuccess = useTranslations('Trips.payment.success');
  const paid =
    hold?.status === BOOKING_HOLD_STATUS.PAID || hold?.status === BOOKING_HOLD_STATUS.RELEASED;
  /*
   * Vừa trả đủ ⇒ sang THẲNG trang chuyến kèm lời báo "Thanh toán thành công" — như web #233
   * (`TripPaymentView`): không còn hộp chúc mừng. `replace` để nút lui không đưa khách về một trang
   * thanh toán đã xong. Mở lại sau nhiều ngày (không còn "tươi") thì chỉ còn kết cục bên dưới.
   */
  const announced = useRef(false);
  useEffect(() => {
    if (!paid || !successFresh || !hold || announced.current) return;
    announced.current = true;
    const amount = fmt.money(hold.paidAmount);
    toast.showSuccess(
      hold.paidVia
        ? tSuccess('lead', { amount, channel: dl('holdPaymentChannel', hold.paidVia) })
        : tSuccess('leadNoChannel', { amount }),
    );
    router.replace(ROUTES.booking.detail(trip.id));
  }, [paid, successFresh, hold, fmt, dl, tSuccess, toast, router, trip.id]);

  const viewTrip = (
    <Button variant="gradient"
      size="lg"
      icon="document-text-outline"
      label={t('viewTrip')}
      onPress={() => router.replace(ROUTES.booking.detail(trip.id))}
    />
  );

  if (!hold) {
    return (
      <YStack gap={space.md}>
        <Callout tone="info" title={t('noHoldTitle')}>
          {t('noHoldBody')}
        </Callout>
        {viewTrip}
      </YStack>
    );
  }

  if (hold.status === BOOKING_HOLD_STATUS.PAID || hold.status === BOOKING_HOLD_STATUS.RELEASED) {
    /*
     * Khoảnh khắc tiền về (trong 30′, hoặc vừa quay về từ cổng) ⇒ khối "Thanh toán thành công" của
     * web. Mở lại sau nhiều ngày thì chỉ còn kết cục, không chúc mừng lần hai.
     */
    // Đang chuyển sang trang chuyến (effect trên) — không vẽ kết cục chớp qua.
    if (successFresh) return null;
    return (
      <YStack gap={space.md}>
        {hold.refund ? <TripHoldPanel hold={hold} tripId={trip.id} /> : null}
        <Callout tone="success" title={t('paidTitle')}>
          {t('paidBody', { amount: fmt.money(hold.paidAmount), code: hold.code })}
        </Callout>
        {viewTrip}
        <Button
          size="lg"
          variant="secondary"
          icon="list-outline"
          label={t('backToTrips')}
          onPress={() => router.replace(ROUTES.booking.list())}
        />
      </YStack>
    );
  }

  // Hết hạn / huỷ / có khoản hoàn: `TripHoldPanel` đã biết nói từng ca (kể cả ô khai tài khoản hoàn).
  return (
    <YStack gap={space.md}>
      <TripHoldPanel hold={hold} tripId={trip.id} />
      {viewTrip}
    </YStack>
  );
}

/** Chặng THỨ HAI trong ba chặng như web `BookingJourney` (Gửi yêu cầu · Thanh toán · Đã xác nhận). */
const PAYMENT_STEP = 2;
const JOURNEY_STEPS = 3;

/**
 * "Bước 2 / 3 · Thanh toán giữ chỗ" + thanh 3 đoạn — dáng Figma `21850:69916`, số chặng như web (3).
 * Thay thẻ "Tiến trình yêu cầu" dạng danh sách dọc. Tô vàng TỚI chặng đang đứng (2/3 ⇒ hai đoạn), phần sau xám.
 */
function PaymentStepBar() {
  const colors = useColors();
  const tFlow = useTranslations('BookingRequests.flow');
  return (
    <YStack gap={space.sm}>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {tFlow('journey.caption', {
          current: PAYMENT_STEP,
          total: JOURNEY_STEPS,
          label: tFlow('journey.steps.payment'),
        })}
      </Text>
      <XStack gap={space.sm}>
        {Array.from({ length: JOURNEY_STEPS }, (_, index) => (
          <YStack
            key={index}
            f={1}
            h={4}
            br={radius.pill}
            bg={index < PAYMENT_STEP ? colors.primary : colors.border}
          />
        ))}
      </XStack>
    </YStack>
  );
}

/** Ảnh xe của thẻ "Thông tin thanh toán" — 100 × 56 (16:9), Figma `21850:70592`. */
const PAY_VEHICLE_PHOTO = { width: 100, height: 56 };
