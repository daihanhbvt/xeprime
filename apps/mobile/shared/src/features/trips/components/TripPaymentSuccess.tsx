import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { payAtPickupAmount } from '@xeprime/domain';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { useCopy } from '@/hooks/use-copy';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { CustomerTripDetail } from '../api';
import { TripHoldPanel } from './TripHoldPanel';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/**
 * Khối "Thanh toán thành công" — nội dung của `TripPaymentSuccessDialog` web (Figma `19759:38196`),
 * dựng THẲNG trên màn thanh toán thay vì một hộp đè lên: trên điện thoại màn này chỉ còn đúng việc
 * báo kết quả, một tấm nổi đè lên một màn trống không thêm gì ngoài một cú chạm để đóng.
 *
 * Chỉ dựng khi CHÍNH khoản giữ chỗ đã đủ tiền (server nói — `paidAt`), nghĩa là đơn thuê đã ra đời
 * trong transaction đối soát (ADR 0044 điều 2). Kể đúng ba điều: đã ghi nhận bao nhiêu qua KÊNH nào
 * (`paidVia` do server suy — không có thì không gọi tên kênh), mã để đọc cho tổng đài, và phần còn
 * phải trả TRỰC TIẾP chủ xe lúc nhận xe (`B − D`, XePrime không thu hộ).
 */
export function TripPaymentSuccess({
  trip,
  hold,
  onViewTrip,
  onMyTrips,
}: {
  trip: CustomerTripDetail;
  hold: Hold;
  onViewTrip: () => void;
  onMyTrips: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Trips.payment.success');
  const tFlow = useTranslations('BookingRequests.flow.done');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const copy = useCopy();

  const amount = fmt.money(hold.paidAmount);
  /*
   * Tiền đã về ⇒ đơn đã có ⇒ số đóng băng nằm ở `finance`; bảng kê của khoản giữ chỗ là đường dự
   * phòng cho lúc màn chưa kịp nhận bản chuyến có đơn — cùng thứ tự với web.
   */
  const fees = trip.estimate?.fees ?? null;
  const payOwner = trip.finance?.payAtPickupAmount ?? payAtPickupAmount(fees);

  return (
    <YStack gap={space.md}>
      <Card>
        <YStack gap={space.sm} ai="center">
          <YStack w={56} h={56} br={radius.pill} ai="center" jc="center" bg={colors.successSurface}>
            <Ionicons name="checkmark-circle" size={iconSize.lg} color={colors.success} />
          </YStack>
          <Text
            col={colors.text}
            fos={fontSize.h3}
            fow={fontWeight.bold}
            ta="center"
            accessibilityRole="header"
          >
            {t('title')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
            {hold.paidVia
              ? t('lead', { amount, channel: dl('holdPaymentChannel', hold.paidVia) })
              : t('leadNoChannel', { amount })}
          </Text>
          <XStack ai="center" gap={space.xs} flexWrap="wrap" jc="center">
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {tFlow('requestCodeLabel')}
            </Text>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold} selectable>
              {trip.id}
            </Text>
          </XStack>
          <Button
            size="sm"
            variant="ghost"
            icon="copy-outline"
            label={tFlow('copyRequestCode')}
            onPress={() => void copy(trip.id)}
          />
        </YStack>
      </Card>

      <Card>
        <YStack gap={space.xs}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
            {trip.vehicle.name}
          </Text>
          {payOwner ? (
            <>
              <DataRow label={t('payOwner')} value={fmt.money(payOwner)} tone="price" strong />
              <Text col={colors.placeholder} fos={fontSize.label}>
                {t('payOwnerNote')}
              </Text>
            </>
          ) : null}
        </YStack>
      </Card>

      {/* Chuyển THỪA ⇒ khoản sẽ được hoàn + lối khai tài khoản nhận — cùng khối với màn chuyến. */}
      {hold.refund ? <TripHoldPanel hold={hold} tripId={trip.id} /> : null}

      <Button variant="gradient" size="lg" icon="document-text-outline" label={t('viewTrip')} onPress={onViewTrip} />
      <Button
        size="lg"
        variant="secondary"
        icon="list-outline"
        label={t('myTrips')}
        onPress={onMyTrips}
      />
    </YStack>
  );
}
