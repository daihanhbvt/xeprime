import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_REQUEST_STATUS,
  PICKUP_PREFERENCE,
  SERVICE_TYPE,
  type PublicListingDetail,
} from '@xeprime/types';
import { dayjs, LIST_SEPARATOR } from '@xeprime/domain';
import type { BookingRequestFormValues } from '../booking-schema';
import { AppHeader } from '@/components/layout/AppHeader';
import { HeaderActions } from '@/components/layout/HeaderActions';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { IconButton } from '@/components/ui/IconButton';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusIcon, STATUS_TONE } from '@/components/ui/StatusIcon';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useAddressPreview } from '@/features/locations/hooks/use-address-preview';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { ChatWithShopButton } from '@/features/chat/components/ChatWithShopButton';
import { TripHoldPanel } from '@/features/trips/components/TripHoldPanel';
import { useTrip } from '@/features/trips/hooks/use-trips';
import { useCopy } from '@/hooks/use-copy';
import {
  BOOKING_BLOCKED,
  usePublicQuote,
  type BookingBlocked,
} from '../hooks/use-booking-request-flow';
import { toQuoteParams } from '../quote-params';
import type { BookingRequestReceipt } from '../api';

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
 * `done` + `awaiting_hold`: **chặng thứ tư** — xe bật "Đặt ngay" nên hệ thống vừa NHẬN chuyến
 * (ADR 0044 điều 2). Chỗ đã được giữ, đồng hồ đang chạy, và việc tiếp theo thuộc về KHÁCH chứ
 * không phải chủ xe. Màn này vì thế đổi tiêu đề, bỏ câu "chưa giữ xe", dựng MÃ QR ngay tại đây và
 * đổi nút chính thành đường về chính chuyến đó. Nói "chủ xe sẽ phản hồi" ở chặng này là lý do
 * khách đóng app rồi mất chuyến — và mất luôn khoản tiền họ chưa kịp chuyển.
 */
export function RequestResultStep({
  blocked,
  duplicate,
  receipt,
  values,
  listing,
  onClose,
}: {
  blocked?: BookingBlocked | null;
  duplicate: boolean;
  receipt: BookingRequestReceipt | null;
  values: BookingRequestFormValues;
  listing: PublicListingDetail;
  onClose: () => void;
}) {
  const t = useTranslations('BookingRequests.flow');
  const router = useRouter();

  const goToTrips = () => router.replace(ROUTES.booking.list());

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
                  Chỉ nhánh tài khoản gian hàng có lối đi tiếp. Nhánh "xe của chính mình" cố ý
                  KHÔNG mời đổi tài khoản: xe đó vẫn là của họ ở mọi tài khoản khác, nên lời mời
                  đó dẫn tới đúng một lần từ chối nữa.
                */}
                {blocked === BOOKING_BLOCKED.SHOP_ACCOUNT ? (
                  <Button
                    label={t('blocked.shopAccount.manage')}
                    size="lg"
                    onPress={() => router.replace(ROUTES.manage.home())}
                  />
                ) : null}
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
                <Button label={t('duplicate.viewTrips')} size="lg" onPress={goToTrips} />
                <Button label={t('duplicate.close')} variant="ghost" onPress={onClose} />
              </YStack>
            </YStack>
          </Card>
        </Screen>
      </>
    );
  }

  return <DoneResult values={values} listing={listing} receipt={receipt} />;
}

/**
 * Nhánh "đã gửi xong" — năm dòng tóm tắt cùng thứ tự với web: Xe · Thời gian · Dịch vụ · Nhận xe
 * · Tổng dự kiến.
 *
 * Là component riêng vì nó gọi `usePublicQuote` (receipt không mang tiền), mà hook không đặt được
 * trong thân `RequestResultStep` do nhánh `duplicate` return sớm.
 */
function DoneResult({
  values,
  listing,
  receipt,
}: {
  values: BookingRequestFormValues;
  listing: PublicListingDetail;
  receipt: BookingRequestReceipt | null;
}) {
  const t = useTranslations('BookingRequests.flow');
  const router = useRouter();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const copy = useCopy();

  /*
   * Chặng CHỜ TIỀN quyết định cả bốn thứ ở màn này: tiêu đề, có mã QR hay không, dải cảnh báo
   * nào, và nút chính dẫn đi đâu. Tính MỘT lần ở đây thay vì so lại `receipt.status` ở bốn chỗ —
   * bốn chỗ là bốn cơ hội để một chỗ bị quên và màn hình nói hai điều trái nhau.
   */
  const awaitingHold = receipt?.status === BOOKING_REQUEST_STATUS.AWAITING_HOLD;

  /*
   * Chuyến vừa tạo — chỉ nạp khi ĐANG chờ tiền. Một lượt đọc phục vụ hai chỗ: thẻ tóm tắt cần
   * biển số (phiếu gửi yêu cầu không mang nó) và khối QR cần khoản giữ chỗ. Truyền chuỗi rỗng khi
   * chưa tới chặng đó thì `useTrip` tự tắt — không có request nào cho chuyến chưa cần.
   */
  const holdTrip = useTrip(awaitingHold && receipt ? receipt.id : '');

  const longTerm = values.serviceType === SERVICE_TYPE.LONG_TERM;
  const withDriver = values.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const quote = usePublicQuote(listing.id, toQuoteParams(values));
  const breakdown = quote.data?.breakdown ?? null;
  // Ghép bằng CHÍNH hàm server dùng để dựng chuỗi lưu xuống DB — xem `useAddressPreview`.
  const pickupAddress = useAddressPreview(
    values.pickupProvinceCode,
    values.pickupWardCode,
    values.pickupAddressLine,
  );

  return (
    <>
      <AppHeader right={<HeaderActions />} />
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack ai="center" gap={layout.section} pt={layout.section}>
          <YStack
            alignSelf="stretch"
            ai="center"
            gap={space.md}
            p={space.lg}
            br={radius.lg}
            bg={colors.successSurface}
          >
            <StatusIcon icon="checkmark" tone={STATUS_TONE.SUCCESS} />

            <YStack ai="center" gap={space.xs}>
              {/*
                Ba chặng, ba câu. Chặng chờ tiền KHÔNG được nói "đã gửi yêu cầu, chủ xe sẽ
                phản hồi": chuyến đã được nhận, đồng hồ đang chạy, việc tiếp theo thuộc về KHÁCH.
              */}
              <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold} ta="center">
                {t(awaitingHold ? 'done.heldTitle' : 'done.title')}
              </Text>
              {/* Tiêu đề nói chỗ đã giữ; dòng này nói vì sao CHƯA xong — hai ý khác nhau. */}
              {awaitingHold ? (
                <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
                  {t('done.heldSubtitle')}
                </Text>
              ) : null}
              {/*
                Mã yêu cầu là thứ khách đọc cho tổng đài khi gọi hỗ trợ, nên nó phải CHÉP ĐƯỢC —
                một chuỗi 26 ký tự đọc qua điện thoại là một chuỗi đọc sai.
              */}
              {receipt?.id ? (
                <XStack ai="center" gap={space.xs}>
                  <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
                    {t('done.requestCode', { code: receipt.id })}
                  </Text>
                  <IconButton
                    icon="copy-outline"
                    label={t('done.copyRequestCode')}
                    onPress={() => void copy(receipt.id)}
                  />
                </XStack>
              ) : null}
              {/*
                Chặng chờ tiền KHÔNG có đoạn mô tả ở đây: tiêu đề đã nói chỗ được giữ, và khối QR
                ngay dưới nói phải làm gì cùng hệ quả khi hết giờ. Thêm một đoạn nữa là nói lại
                lần thứ ba và đẩy mã QR xuống dưới nếp gấp.
              */}
              {awaitingHold ? null : (
                <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
                  {t('done.body')}
                </Text>
              )}
            </YStack>
          </YStack>

          <YStack alignSelf="stretch">
            <Card>
              <YStack gap={space.sm}>
                <DataRow
                  label={t('review.vehicle')}
                  /*
                    Biển số chỉ tồn tại khi chỗ đã THẬT SỰ được giữ — phiếu gửi yêu cầu không mang
                    nó, và ở chặng chờ duyệt thì chưa có chiếc xe cụ thể nào được gán.
                  */
                  value={
                    holdTrip.data?.vehicle.plateNumber
                      ? `${listing.name}${LIST_SEPARATOR}${holdTrip.data.vehicle.plateNumber}`
                      : listing.name
                  }
                />

                {/* Dài hạn CHƯA có khung giờ (ADR 0011) — thay bằng gói thuê và nguyện vọng nhận xe. */}
                {longTerm ? (
                  <>
                    <DataRow
                      label={t('review.package')}
                      value={fmt.packageLabel(values.longTermPackageMonths) ?? '—'}
                    />
                    <DataRow
                      label={t('review.pickupPreference')}
                      value={
                        values.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE
                          ? fmt.dateKey(values.requestedPickupDate)
                          : domainLabel('pickupPreference', values.pickupPreference)
                      }
                    />
                  </>
                ) : (
                  <DataRow
                    label={t('done.time')}
                    value={`${fmt.rentalPoint(dayjs(values.pickupAt))} → ${fmt.rentalPoint(dayjs(values.returnAt))}`}
                  />
                )}

                <DataRow
                  label={t('review.service')}
                  value={
                    domainLabel('serviceType', values.serviceType) +
                    (withDriver && values.routeType
                      ? ` · ${domainLabel('routeType', values.routeType)}`
                      : '')
                  }
                />

                <DataRow
                  label={t('done.pickupMethod')}
                  value={
                    withDriver
                      ? t('done.driverPickup', { address: pickupAddress ?? '—' })
                      : values.deliveryRequested
                        ? t('pickup.delivery')
                        : t('pickup.self')
                  }
                />

                {/* Còn phụ phí chưa tính (`estimateNote`) thì KHÔNG gọi là "Tổng dự kiến". */}
                {breakdown ? (
                  <DataRow
                    label={breakdown.estimateNote ? t('price.subtotal') : t('price.total')}
                    value={fmt.money(breakdown.totalAmount)}
                    tone="price"
                  />
                ) : null}
              </YStack>
            </Card>
          </YStack>

          {/*
            Ba nhánh LOẠI TRỪ nhau:

            - chờ tiền ⇒ KHÔNG có dải nào, vì `TripHoldPanel` ngay dưới đã mở đầu bằng đúng câu
              đó, và hai khối nói cùng một điều chỉ đẩy mã QR xuống dưới nếp gấp;
            - tự nhận ⇒ lịch đã giữ, nói mừng;
            - còn lại ⇒ CHƯA GIỮ XE, lời quan trọng nhất của màn này (ADR 0006).
          */}
          {awaitingHold ? null : (
            <XStack
              alignSelf="stretch"
              ai="flex-start"
              gap={space.sm}
              bg={receipt?.autoAccepted ? colors.successSurface : colors.warningSurface}
              bw={1}
              bc={receipt?.autoAccepted ? colors.success : colors.warning}
              p={space.md}
              br={radius.md}
            >
              <Ionicons
                name={receipt?.autoAccepted ? 'checkmark-circle' : 'alert-circle'}
                size={iconSize.md}
                color={receipt?.autoAccepted ? colors.success : colors.warning}
              />
              <Text f={1} col={colors.text} fos={fontSize.bodySm}>
                {t(receipt?.autoAccepted ? 'done.autoAccepted' : 'done.notReserved')}
              </Text>
            </XStack>
          )}

          {/*
            MÃ QR NGAY TẠI ĐÂY — chỉ khi hệ thống vừa TỰ NHẬN chuyến (ADR 0044 điều 2).

            Dùng lại `TripHoldPanel` của màn chi tiết chuyến chứ không vẽ QR lần thứ hai: đó là nơi
            đã có đồng hồ đếm ngược, nút sao chép và mọi trạng thái hoàn tiền. Hai bản QR là hai
            chỗ để số tiền hoặc nội dung chuyển khoản trôi khỏi nhau — và một nội dung sai là một
            khoản tiền không khớp được.
          */}
          {awaitingHold && receipt ? (
            <YStack alignSelf="stretch">
              <HoldBlock tripId={receipt.id} trip={holdTrip} />
            </YStack>
          ) : null}

          {/*
            Hai lối đi, đúng cặp web bày ở đây: sang Chuyến của tôi, hoặc nhắn thẳng chủ xe.

            Hỏi thêm chủ xe (giao xe ở đâu, có giao sớm hơn được không) là việc RẤT hay xảy ra
            ngay sau khi gửi. Nút "Quay lại" thứ ba của web đưa ngược về trang chi tiết chiếc xe
            vừa gửi yêu cầu — ở app thì cử chỉ lui và nút lui của Android đã làm đúng việc đó.
          */}
          <YStack alignSelf="stretch" gap={space.sm}>
            {/*
              Đang chờ tiền thì đích là CHUYẾN NÀY, không phải danh sách: khách cần chỗ có mã QR và
              đồng hồ, và họ sẽ quay lại đó sau khi mở app ngân hàng xong.
            */}
            <Button
              label={t(awaitingHold ? 'done.openHold' : 'done.myTrips')}
              size="lg"
              {...(awaitingHold ? { icon: 'time-outline' as const } : {})}
              onPress={() =>
                router.replace(
                  awaitingHold && receipt
                    ? ROUTES.booking.detail(receipt.id)
                    : ROUTES.booking.list(),
                )
              }
            />
            <ChatWithShopButton vehicleId={listing.id} label={t('done.chatShop')} size="lg" />
          </YStack>
        </YStack>
      </Screen>
    </>
  );
}

/**
 * Khối mã QR ở bước cuối — ba trạng thái, và KHÔNG trạng thái nào im lặng.
 *
 * Khách vừa được báo là chỗ đã giữ và đồng hồ đang chạy, nên một khoảng trống ở đây là cách chắc
 * chắn để họ bỏ đi mà không trả tiền. Nạp hỏng thì chỉ đường sang màn chuyến, nơi đúng khối này
 * được nạp lại.
 */
function HoldBlock({
  tripId,
  trip,
}: {
  tripId: string;
  /** Kết quả nạp do màn truyền xuống — một lượt đọc dùng cho cả thẻ tóm tắt lẫn khối này. */
  trip: ReturnType<typeof useTrip>;
}) {
  const t = useTranslations('BookingRequests.flow');

  if (trip.isPending) return <MiniRowsSkeleton rows={6} />;
  if (!trip.data?.hold) return <Callout tone="warning">{t('done.holdLoadFailed')}</Callout>;

  return (
    <TripHoldPanel
      hold={trip.data.hold}
      tripId={tripId}
      tripTotalAmount={trip.data.estimate?.fees?.customerTotalAmount ?? null}
      payAtHandoverAmount={trip.data.estimate?.fees?.payAtPickupAmount ?? null}
    />
  );
}
