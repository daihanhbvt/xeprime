import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PICKUP_PREFERENCE, SERVICE_TYPE, type PublicListingDetail } from '@xeprime/types';
import { dayjs } from '@xeprime/domain';
import type { BookingRequestFormValues } from '../booking-schema';
import { AppHeader } from '@/components/layout/AppHeader';
import { HeaderActions } from '@/components/layout/HeaderActions';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { StatusIcon, STATUS_TONE } from '@/components/ui/StatusIcon';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { usePublicQuote } from '../hooks/use-booking-request-flow';
import { toQuoteParams } from '../quote-params';
import type { BookingRequestReceipt } from '../api';

/**
 * Màn kết thúc của wizard — hai nhánh, và **cả hai đều không phải lỗi**.
 *
 * `duplicate`: đã có một yêu cầu đang chờ cho đúng (xe, SĐT, giờ nhận) — unique một phần ở DB
 * chặn bản thứ hai. Khách không làm sai gì; việc cần làm là dẫn họ tới chỗ xem yêu cầu đã gửi.
 *
 * `done`: yêu cầu đã tới gian hàng. Nói rõ **CHƯA GIỮ XE** — yêu cầu chờ duyệt cố ý không chiếm
 * lịch (ADR 0006), nhiều khách được phép cùng hỏi một xe cùng khung giờ, ai được duyệt trước
 * thì được xe. Bỏ câu này đi là để khách tưởng xe đã là của mình.
 */
export function RequestResultStep({
  duplicate,
  receipt,
  values,
  listing,
  onClose,
}: {
  duplicate: boolean;
  receipt: BookingRequestReceipt | null;
  values: BookingRequestFormValues;
  listing: PublicListingDetail;
  onClose: () => void;
}) {
  const t = useTranslations('BookingRequests.flow');
  const router = useRouter();

  const goToTrips = () => router.replace(ROUTES.booking.list());

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

  const longTerm = values.serviceType === SERVICE_TYPE.LONG_TERM;
  const withDriver = values.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const quote = usePublicQuote(listing.id, toQuoteParams(values));
  const breakdown = quote.data?.breakdown ?? null;

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
              <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold} ta="center">
                {t('done.title')}
              </Text>
              {receipt?.id ? (
                <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
                  {t('done.requestCode', { code: receipt.id })}
                </Text>
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
                      ? t('done.driverPickup', { address: values.pickupAddress || '—' })
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

          {/* Cảnh báo CHƯA GIỮ XE — lời quan trọng nhất của màn này, đừng bỏ. */}
          <XStack
            alignSelf="stretch"
            ai="flex-start"
            gap={space.sm}
            bg={colors.warningSurface}
            bw={1}
            bc={colors.warning}
            p={space.md}
            br={radius.md}
          >
            <Ionicons name="alert-circle" size={iconSize.md} color={colors.warning} />
            <Text f={1} col={colors.text} fos={fontSize.bodySm}>
              {t('done.notReserved')}
            </Text>
          </XStack>

          {/*
            MỘT lối đi duy nhất, sang Chuyến của tôi: nút "Quay lại" của web đưa ngược về trang chi
            tiết chiếc xe vừa gửi yêu cầu, và nút "Nhắn chủ xe" cần chat realtime (ADR 0009) chưa có
            ở app — khoá `done.chatShop` vẫn còn để gắn vào đây khi màn chat có mặt.
          */}
          <YStack alignSelf="stretch">
            <Button
              label={t('done.myTrips')}
              size="lg"
              onPress={() => router.replace(ROUTES.booking.list())}
            />
          </YStack>
        </YStack>
      </Screen>
    </>
  );
}
