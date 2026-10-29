import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_REQUEST_RESPOND_WINDOW,
  isAwaitingPayment,
  type BookingHoldStatus,
  type PublicListingDetail,
} from '@xeprime/types';
import type { RentalMode } from '@xeprime/domain';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import type { BookingRequestFormValues } from '../booking-schema';
import { AppHeader } from '@/components/layout/AppHeader';
import { HeaderActions } from '@/components/layout/HeaderActions';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusIcon, STATUS_TONE } from '@/components/ui/StatusIcon';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { ShopChatButton } from '@/features/chat/components/ShopChatButton';
import { useShopChatAvailable } from '@/features/chat/hooks/use-shop-chat-available';
import { useTrip } from '@/features/trips/hooks/use-trips';
import { UnpaidHoldList } from '@/features/trips/components/UnpaidHoldList';
import type { CustomerUnpaidHolds } from '@/features/trips/api';
import { useQuoteTotal } from '../hooks/use-quote-total';
import { BookingTripCard } from './BookingTripCard';
import { BookingResult, BookingResultTotal } from './BookingResult';
import { type BookingBlocked } from '../hooks/use-booking-request-flow';
import type { BookingRequestReceipt, PublicQuote } from '../api';

/**
 * Màn kết thúc của wizard — ba nhánh, và **không nhánh nào là lỗi đỏ**.
 *
 * `blocked`: tài khoản này không đặt được xe này (ADR 0038 điều 6) — tài khoản gian hàng tuyến
 * gói, hoặc xe của chính gian hàng mình. Chiếm CẢ màn chứ không phải một dòng lỗi dưới nút Gửi:
 * không có gì trong biểu mẫu sửa được để qua cổng này.
 *
 * `duplicate`: đã có một yêu cầu đang chờ cho đúng (xe, SĐT, giờ nhận) — unique một phần ở DB
 * chặn bản thứ hai. Khách không làm sai gì; việc cần làm là dẫn họ tới chỗ xem yêu cầu đã gửi.
 *
 * `done`: yêu cầu đã tới gian hàng. Nói rõ **CHƯA GIỮ XE** — yêu cầu chờ duyệt cố ý không chiếm
 * lịch (ADR 0006), nhiều khách được phép cùng hỏi một xe cùng khung giờ, ai được duyệt trước
 * thì được xe. Bỏ câu này đi là để khách tưởng xe đã là của mình.
 *
 * `holdLimit`: khách đã giữ đủ trần chuyến chưa trả (`HOLD_LIMIT_REACHED`) — liệt kê các chuyến đó
 * kèm lối trả thẳng, như màn chặn của hộp thoại đặt xe bên web.
 *
 * Chặng `awaiting_hold` (xe "Đặt ngay" vừa được hệ thống NHẬN) KHÔNG tới màn này: luồng chuyển
 * thẳng sang màn thanh toán của chuyến (web PR #183, 13/10/2026).
 */
export function RequestResultStep({
  blocked,
  holdLimit = false,
  unpaidHolds,
  duplicate,
  receipt,
  values,
  rentalMode,
  listing,
  quote,
  onClose,
  onLeave,
}: {
  blocked?: BookingBlocked | null;
  /** Đã chạm trần giữ chỗ — `unpaidHolds` là dữ liệu lời nhắc nếu đọc được (khách có phiên). */
  holdLimit?: boolean;
  unpaidHolds?: CustomerUnpaidHolds | undefined;
  duplicate: boolean;
  receipt: BookingRequestReceipt | null;
  values: BookingRequestFormValues;
  /** Theo ngày / theo giờ — dòng tóm tắt dịch vụ của thẻ chuyến, như web. */
  rentalMode: RentalMode;
  listing: PublicListingDetail;
  /**
   * Báo giá ĐÃ ÁP MÃ của chính luồng vừa gửi (`quoteWithPromo`) — cùng nguồn web đọc ở màn
   * "đã gửi". Không tự gọi lại báo giá công khai ở đây: báo giá đó KHÔNG nhận mã khuyến mãi, nên
   * màn kết quả sẽ hiện nguyên giá trong khi bảng giá khách vừa bấm qua đã trừ mã.
   */
  quote: PublicQuote | null;
  onClose: () => void;
  /** Rời luồng sang màn thanh toán một chuyến đang giữ (`replace`) — dọn bản nháp. */
  onLeave?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.flow');
  const router = useRouter();

  const tTrips = useTranslations('Trips');
  const goToTrips = () => router.replace(ROUTES.booking.list());

  if (holdLimit) {
    return (
      <>
        <AppHeader right={<HeaderActions />} />
        <Screen edges={['left', 'right', 'bottom']}>
          <YStack gap={layout.block} pt={layout.section}>
            <YStack ai="center" gap={space.xs}>
              <StatusIcon icon="time" tone={STATUS_TONE.WARNING} />
              <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold} ta="center">
                {unpaidHolds
                  ? tTrips('unpaid.limitTitle', { limit: unpaidHolds.limit })
                  : tTrips('unpaid.limitTitleFallback')}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.body} ta="center">
                {unpaidHolds
                  ? tTrips('unpaid.limitBodyBooking', { limit: unpaidHolds.limit })
                  : tTrips('unpaid.limitBodyFallback')}
              </Text>
            </YStack>
            {unpaidHolds && unpaidHolds.items.length > 0 ? (
              <UnpaidHoldList items={unpaidHolds.items} onNavigate={onLeave} replace />
            ) : null}
            {/*
              Hai nút MỘT hàng có icon (người dùng chốt 28/10/2026): "Đóng" viền bên trái, "Xem
              chuyến của tôi" vàng chính bên phải — lối đi tiếp chính là trả một chuyến đang giữ.
            */}
            <XStack gap={space.sm}>
              <Button
                label={t('blocked.close')}
                icon="close-outline"
                variant="secondary"
                block={false}
                onPress={onClose}
              />
              <YStack f={1}>
                <Button
                  label={tTrips('unpaid.viewTrips')}
                  icon="car-sport-outline"
                  variant="gradient"
                  onPress={goToTrips}
                />
              </YStack>
            </XStack>
          </YStack>
        </Screen>
      </>
    );
  }

  if (blocked) {
    return (
      <>
        <AppHeader right={<HeaderActions />} />
        <Screen edges={['left', 'right', 'bottom']} centered>
          <Card>
            <YStack ai="center" gap={layout.block}>
              <StatusIcon icon="alert" tone={STATUS_TONE.DANGER} />
              <YStack ai="center" gap={space.xs}>
                <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold} ta="center">
                  {t(`blocked.${blocked}.title`)}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.body} ta="center">
                  {t(`blocked.${blocked}.body`)}
                </Text>
              </YStack>
              <YStack alignSelf="stretch" gap={space.sm}>
                {/*
                  Không có lối "vào khu quản lý" ở đây (web có, vì site partner cùng trình duyệt):
                  luồng đặt xe chỉ có ở app khách, và `ROUTES.manage.*` của app này là màn handoff
                  mở app Partner — nhảy sang app kia giữa luồng đặt xe là bỏ khách ở app khác với
                  một tài khoản khác (ADR 0053). Nhánh "xe của chính mình" cũng chỉ có nút đóng.
                */}
                <Button label={t('blocked.close')} variant="ghost" onPress={onClose} />
              </YStack>
            </YStack>
          </Card>
        </Screen>
      </>
    );
  }

  if (duplicate) {
    return (
      <>
        <AppHeader right={<HeaderActions />} />
        <Screen edges={['left', 'right', 'bottom']} centered>
          <Card>
            <YStack ai="center" gap={layout.block}>
              <StatusIcon icon="alert" tone={STATUS_TONE.DANGER} />
              <YStack ai="center" gap={space.xs}>
                <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold} ta="center">
                  {t('duplicate.title')}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.body} ta="center">
                  {t('duplicate.body')}
                </Text>
              </YStack>
              <YStack alignSelf="stretch" gap={space.sm}>
                <Button variant="gradient" icon="document-text-outline" label={t('duplicate.viewTrips')} size="lg" onPress={goToTrips} />
                <Button label={t('duplicate.close')} variant="ghost" onPress={onClose} />
              </YStack>
            </YStack>
          </Card>
        </Screen>
      </>
    );
  }

  return (
    <DoneResult
      values={values}
      rentalMode={rentalMode}
      listing={listing}
      receipt={receipt}
      quote={quote}
    />
  );
}

/**
 * Nhánh "đã gửi xong" — thẻ chuyến đầy đủ như web (`BookingTripCard` bố cục `receipt`) kèm dòng tổng.
 *
 * Là component riêng vì nó gọi hook (`useQuoteTotal`), mà hook không đặt được trong thân
 * `RequestResultStep` do nhánh `duplicate` return sớm.
 */
function DoneResult({
  values,
  rentalMode,
  listing,
  receipt,
  quote,
}: {
  values: BookingRequestFormValues;
  rentalMode: RentalMode;
  listing: PublicListingDetail;
  receipt: BookingRequestReceipt | null;
  quote: PublicQuote | null;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.flow');
  const router = useRouter();

  /** Đặt ngay mà không có tiền giữ chỗ ⇒ đơn đã ra đời; còn lại là yêu cầu đang chờ chủ xe. */
  const confirmed = Boolean(receipt?.autoAccepted);

  const breakdown = quote?.breakdown ?? null;
  const total = useQuoteTotal(breakdown);
  const tNav = useTranslations('Navigation.public');
  // Hỏi cổng nhắn tin Ở ĐÂY: ô `f={1}` bọc nút vẫn giữ chỗ khi nút tự ẩn, nên phải bỏ cả ô.
  const canChat = useShopChatAvailable(listing.shopSlug, listing.shopChatOpen);

  /*
   * Mọi lối LUI ở màn này về TRANG CHỦ (người dùng chốt 28/10/2026): yêu cầu đã gửi xong, quay về
   * luồng đặt xe hay trang xe là mở lại một việc đã làm xong. Gồm nút lui trên thanh đầu và phím
   * Back của Android.
   */
  const goHome = useCallback(() => router.replace(ROUTES.explore.home()), [router]);
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        goHome();
        return true;
      });
      return () => sub.remove();
    }, [goHome]),
  );

  /*
   * TỰ CHUYỂN khi chủ xe NHẬN chuyến — như web `BookingSuccessStep` (PR #233): theo dõi chuyến vừa
   * gửi; khoản giữ chỗ vừa mở (chờ thanh toán) thì đưa khách thẳng sang màn thanh toán. Đơn đã ra
   * đời ngay (`autoAccepted`) thì không theo dõi gì. Lắng nghe thêm bằng một nhịp hỏi lại định kỳ:
   * `useTrip` chỉ tự hỏi khi ĐÃ chờ thanh toán, còn ở đây ta đang chờ chính cái mốc đó.
   */
  const tripId = !confirmed && receipt?.id ? receipt.id : '';
  const tripQ = useTrip(tripId);
  const hold = tripQ.data?.hold;
  const awaitingPayment = hold != null && isAwaitingPayment(hold.status as BookingHoldStatus);
  const redirected = useRef(false);
  const { refetch } = tripQ;
  useEffect(() => {
    if (!tripId || awaitingPayment) return;
    const timer = setInterval(() => void refetch(), APPROVAL_POLL_MS);
    return () => clearInterval(timer);
  }, [tripId, awaitingPayment, refetch]);
  useEffect(() => {
    if (!awaitingPayment || redirected.current || !receipt?.id) return;
    redirected.current = true;
    // Đường như web (người dùng chốt 28/10/2026): Chuyến của tôi → Chi tiết chuyến → Thanh toán giữ
    // chỗ (QR). Lui từ màn QR về chi tiết chuyến, lui tiếp về Chuyến của tôi.
    router.replace(ROUTES.booking.list());
    router.push(ROUTES.booking.detail(receipt.id));
    router.push(ROUTES.booking.payment(receipt.id));
  }, [awaitingPayment, receipt?.id, router]);

  /*
   * "Xem chi tiết" ⇒ chi tiết chuyến ĐÈ LÊN danh sách "Chuyến": lui từ chi tiết về danh sách chuyến
   * (người dùng chốt 28/10/2026), không về màn "Đã gửi" hay luồng đặt xe đã xong.
   */
  const openTrip = () => {
    router.replace(ROUTES.booking.list());
    if (receipt?.id) router.push(ROUTES.booking.detail(receipt.id));
  };

  return (
    <>
      <AppHeader onBack={goHome} right={<HeaderActions />} />
      <Screen
        edges={['left', 'right', 'bottom']}
        /*
          Ba nút DÍNH ĐÁY, MỘT hàng (người dùng chốt 28/10/2026; Figma `21836:55889`): Trang chủ ·
          nhắn chủ xe · Xem chi tiết. Nút nhắn tự ẩn với chủ xe cá nhân chưa có đơn (ADR 0073 —
          `ShopChatButton` hỏi server), như web; khi đó hai nút còn lại chia hàng.
        */
        footer={
          /*
            HAI hàng (người dùng chốt 28/10/2026): "Nhắn tin cho chủ xe" trải hết hàng trên; "Trang
            chủ" + "Xem chi tiết" hàng dưới — CẢ BA vàng gradient (người dùng chốt 28/10/2026). Nút nhắn tự ẩn với chủ xe cá nhân
            chưa có đơn (ADR 0073) — khi đó chỉ còn hàng dưới.
          */
          <YStack gap={space.sm}>
            {canChat ? (
              <ShopChatButton
                shopSlug={listing.shopSlug}
                vehicleId={listing.id}
                publicChatOpen={listing.shopChatOpen}
                label={t('done.chatHost')}
                variant="primary"
              />
            ) : null}
            <XStack gap={space.sm}>
              <YStack f={1}>
                <Button
                  label={tNav('home')}
                  icon="home-outline"
                  variant="gradient"
                  onPress={goHome}
                />
              </YStack>
              <YStack f={1}>
                <Button
                  variant="gradient"
                  icon="document-text-outline"
                  label={t('done.viewDetail')}
                  onPress={openTrip}
                />
              </YStack>
            </XStack>
          </YStack>
        }
      >
        {/*
          Khung chung của hộp kết quả (web `BookingSuccessStep` → `BookingResult`). Chặng chờ tiền
          KHÔNG tới màn này: luồng đã chuyển thẳng sang màn thanh toán của chuyến (web PR #183).
        */}
        <BookingResult
          variant="sent"
          title={confirmed ? t('done.confirmedTitle') : t('done.title')}
          lead={
            confirmed
              ? t('done.autoAccepted')
              : // Hạn thật (động theo giờ nhận, ADR 0066) hiện ở trang chuyến; ở đây chỉ nói trần.
                t('done.pendingBody', { hours: BOOKING_REQUEST_RESPOND_WINDOW.MAX_MINUTES / 60 })
          }
          code={
            receipt?.id
              ? {
                  label: t('done.requestCodeLabel'),
                  value: receipt.id,
                  copyLabel: t('done.copyRequestCode'),
                }
              : null
          }
          footer={null}
        >
          {/* Thẻ chuyến `receipt` + dòng tổng `BookingResultTotal` (số khách PHẢI CHUẨN BỊ). */}
          <BookingTripCard listing={listing} values={values} rentalMode={rentalMode} variant="review">
            {total ? (
              <BookingResultTotal variant="sent" label={total.label} amount={total.amount} />
            ) : null}
          </BookingTripCard>

          {/*
            Web `BookingSuccessStep .note`: yêu cầu chờ duyệt KHÔNG giữ lịch (ADR 0044 điều 1). Nền
            `color-primary-subtle`, bo `radius-control`, đệm `space-12`, chữ body `text-secondary`,
            icon thông tin màu `color-warning` — không viền.
          */}
          {confirmed ? null : (
            <XStack
              ai="flex-start"
              gap={space.sm}
              p={NOTE_PADDING}
              br={radius.control}
              bg={colors.primarySubtle}
            >
              <Ionicons name="information-circle-outline" size={iconSize.sm} color={colors.warning} />
              <Text f={1} col={colors.textMuted} fos={fontSize.body}>
                {t('done.notReserved')}
              </Text>
            </XStack>
          )}
        </BookingResult>
      </Screen>
    </>
  );
}

/** Nhịp hỏi lại chuyến vừa gửi để bắt lượt chủ xe NHẬN (tự chuyển sang thanh toán). */
const APPROVAL_POLL_MS = 15_000;

/** `BookingSuccessStep .note { padding: var(--xp-space-12) }`. */
const NOTE_PADDING = toPx(XP_TOKENS['space-12']);
