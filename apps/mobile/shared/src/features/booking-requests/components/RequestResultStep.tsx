import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PICKUP_PREFERENCE,
  SERVICE_TYPE,
  type PublicListingDetail,
} from '@xeprime/types';
import { dayjs } from '@xeprime/domain';
import type { BookingRequestFormValues } from '../booking-schema';
import { AppHeader } from '@/components/layout/AppHeader';
import { HeaderActions } from '@/components/layout/HeaderActions';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { IconButton } from '@/components/ui/IconButton';
import { StatusIcon, STATUS_TONE } from '@/components/ui/StatusIcon';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useAddressPreview } from '@/features/locations/hooks/use-address-preview';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { ChatWithShopButton } from '@/features/chat/components/ChatWithShopButton';
import { UnpaidHoldList } from '@/features/trips/components/UnpaidHoldList';
import type { CustomerUnpaidHolds } from '@/features/trips/api';
import { useCopy } from '@/hooks/use-copy';
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
            <YStack gap={space.sm}>
              <Button
                label={tTrips('unpaid.viewTrips')}
                size="lg"
                variant="secondary"
                onPress={goToTrips}
              />
              <Button label={t('blocked.close')} variant="ghost" onPress={onClose} />
            </YStack>
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
                <Button label={t('duplicate.viewTrips')} size="lg" onPress={goToTrips} />
                <Button label={t('duplicate.close')} variant="ghost" onPress={onClose} />
              </YStack>
            </YStack>
          </Card>
        </Screen>
      </>
    );
  }

  return <DoneResult values={values} listing={listing} receipt={receipt} quote={quote} />;
}

/**
 * Nhánh "đã gửi xong" — năm dòng tóm tắt cùng thứ tự với web: Xe · Thời gian · Dịch vụ · Nhận xe
 * · Tổng dự kiến.
 *
 * Là component riêng vì nó gọi `useCopy`, mà hook không đặt được trong thân
 * `RequestResultStep` do nhánh `duplicate` return sớm.
 */
function DoneResult({
  values,
  listing,
  receipt,
  quote,
}: {
  values: BookingRequestFormValues;
  listing: PublicListingDetail;
  receipt: BookingRequestReceipt | null;
  quote: PublicQuote | null;
}) {
  const t = useTranslations('BookingRequests.flow');
  const router = useRouter();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const copy = useCopy();

  const longTerm = values.serviceType === SERVICE_TYPE.LONG_TERM;
  const withDriver = values.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const breakdown = quote?.breakdown ?? null;
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
                {t('done.title')}
              </Text>
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
              <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
                {t('done.body')}
              </Text>
            </YStack>
          </YStack>

          <YStack alignSelf="stretch">
            <Card>
              <YStack gap={space.sm}>
                <DataRow label={t('review.vehicle')} value={listing.name} />

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
                    /*
                      Số khách PHẢI CHUẨN BỊ, không phải tiền thuê: `totalAmount` là `B`, bỏ cả
                      phụ phí lẫn mã khuyến mãi, nên màn xác nhận từng hiện một con số thứ ba
                      khác với bảng giá vừa bấm qua (24/09/2026).
                    */
                    value={fmt.money(breakdown.fees?.customerTotalAmount ?? breakdown.totalAmount)}
                    tone="price"
                  />
                ) : null}
              </YStack>
            </Card>
          </YStack>

          {/*
            Hai nhánh: tự nhận ⇒ lịch đã giữ, nói mừng; còn lại ⇒ CHƯA GIỮ XE, lời quan trọng nhất
            của màn này (ADR 0006). Chặng CHỜ TIỀN không tới màn này: luồng đã chuyển thẳng sang màn
            thanh toán của chuyến (web PR #183).
          */}
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

          {/*
            Hai lối đi, đúng cặp web bày ở đây: sang Chuyến của tôi, hoặc nhắn thẳng chủ xe.
          */}
          <YStack alignSelf="stretch" gap={space.sm}>
            <Button
              label={t('done.myTrips')}
              size="lg"
              onPress={() => router.replace(ROUTES.booking.list())}
            />
            <ChatWithShopButton vehicleId={listing.id} label={t('done.chatShop')} size="lg" />
          </YStack>
        </YStack>
      </Screen>
    </>
  );
}
