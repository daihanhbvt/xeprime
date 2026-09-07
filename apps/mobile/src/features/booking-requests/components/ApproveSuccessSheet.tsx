import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { toAppTz } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { DataRow } from '@/components/ui/DataRow';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { colors, fontSize, iconSize, radius, space } from '@/theme/tokens';
import type { BookingRequestItem } from '../api';

/**
 * Kết quả sau khi DUYỆT — bản native của `ApproveSuccessDialog`.
 *
 * Là bàn giao việc, không phải lời chúc mừng: mọi thao tác còn lại của chuyến nằm trên ĐƠN vừa
 * tạo ở một màn khác, nên lối đi sang đó phải nằm ngay đây.
 */
export function ApproveSuccessSheet({
  request,
  onClose,
}: {
  request: BookingRequestItem;
  onClose: () => void;
}) {
  const t = useTranslations('BookingRequests');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();

  const pickup = request.pickupAt ? toAppTz(request.pickupAt) : null;
  const dropoff = request.returnAt ? toAppTz(request.returnAt) : null;
  const longTerm = Boolean(request.longTermPackageMonths);
  const bookingId = request.bookingId;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('approved.title')}
      footer={
        <>
          {/* `bookingId` luôn có (đơn tạo cùng transaction với việc duyệt); kiểm tra vì kiểu để nó tuỳ chọn. */}
          {bookingId ? (
            <Button
              label={t('approved.viewBooking')}
              size="lg"
              onPress={() => {
                onClose();
                navigateOnce(ROUTES.manage.bookingDetail(bookingId));
              }}
            />
          ) : null}
          <Button label={t('approved.close')} variant="ghost" onPress={onClose} />
        </>
      }
    >
      <XStack ai="center" gap={space.sm} p={space.md} br={radius.md} bg={colors.successSurface}>
        <YStack
          w={iconSize.lg + space.sm}
          h={iconSize.lg + space.sm}
          br={radius.pill}
          bg={colors.successSurface}
          ai="center"
          jc="center"
        >
          <Ionicons name="checkmark" size={iconSize.md} color={colors.success} />
        </YStack>
        <Text f={1} col={colors.text} fos={fontSize.bodySm}>
          {longTerm ? t('approved.leadLongTerm') : t('approved.lead')}
        </Text>
      </XStack>

      <YStack gap={space.xs} p={space.md} br={radius.md} bg={colors.surfaceMuted}>
        <DataRow
          label={t('approve.vehicle')}
          value={request.vehicleName}
          {...(request.vehiclePlate ? { valueHint: request.vehiclePlate } : {})}
        />
        <DataRow
          label={t('approve.customer')}
          value={request.customerName}
          valueHint={request.customerPhone}
        />
        {pickup && dropoff ? (
          <DataRow
            label={t('approve.schedule')}
            value={`${fmt.rentalPoint(pickup)} → ${fmt.rentalPoint(dropoff)}`}
            valueHint={fmt.rentalDuration(pickup, dropoff)}
          />
        ) : null}
      </YStack>

      <Text col={colors.textMuted} fos={fontSize.label}>
        {t('approved.next')}
      </Text>
    </BottomSheet>
  );
}
