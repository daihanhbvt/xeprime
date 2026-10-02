import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_STATUS_META,
  VEHICLE_OPERATION_STATUS_META,
  type BookingStatus,
  type VehicleOperationStatus,
} from '@xeprime/types';
import { vehicleLabel } from '@xeprime/domain';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { ReceiptBookingOption, ReceiptVehicleOption } from '../api';

const THUMB = 48;

const styles = StyleSheet.create({
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.md },
});

/**
 * ĐỌC LẠI đối tượng vừa chọn trước khi ghi tiền vào nó — bản native của `ReceiptLinkCard`.
 *
 * Một dòng chữ "BK-0421" không đủ: đây là bước cuối trước khi một khoản tiền được gắn vĩnh viễn
 * vào một chuyến hoặc một chiếc xe, và cái người dùng cần xác nhận là KHÁCH NÀO, XE NÀO, còn nợ
 * bao nhiêu — không phải một mã.
 */
export function BookingLinkCard({ booking }: { booking: ReceiptBookingOption }) {
  const t = useTranslations('Finance.receipts.form.link');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const status = booking.status as BookingStatus;

  return (
    <Card tone="muted" lift="flat">
      <YStack gap={space.xs}>
        <XStack ai="center" gap={space.sm}>
          {booking.vehicleImageUrl ? (
            <Image
              source={{ uri: booking.vehicleImageUrl }}
              style={styles.thumb}
              contentFit="cover"
            />
          ) : null}
          <YStack f={1} minWidth={0} gap={1}>
            <Text
              col={colors.text}
              fos={fontSize.bodySm}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {booking.code}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
              {vehicleLabel(booking.vehicleName, booking.plateNumber)}
            </Text>
          </YStack>
          <StatusBadge
            label={domainLabel('bookingStatus', status, BOOKING_STATUS_META[status]?.label)}
            color={BOOKING_STATUS_META[status]?.color ?? 'default'}
            size="sm"
          />
        </XStack>

        <DataRow label={t('customer')} value={booking.customerName} />
        <DataRow label={t('debt')} value={fmt.money(booking.debtAmount)} tone="price" strong />
      </YStack>
    </Card>
  );
}

export function VehicleLinkCard({ vehicle }: { vehicle: ReceiptVehicleOption }) {
  const t = useTranslations('Finance.receipts.form.link');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const status = vehicle.operationStatus as VehicleOperationStatus;

  return (
    <Card tone="muted" lift="flat">
      <YStack gap={space.xs}>
        <XStack ai="center" gap={space.sm}>
          {vehicle.imageUrl ? (
            <Image source={{ uri: vehicle.imageUrl }} style={styles.thumb} contentFit="cover" />
          ) : null}
          <YStack f={1} minWidth={0} gap={1}>
            <Text
              col={colors.text}
              fos={fontSize.bodySm}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {vehicleLabel(vehicle.name, vehicle.plateNumber)}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
              {vehicle.code}
            </Text>
          </YStack>
          <StatusBadge
            label={domainLabel(
              'vehicleOperationStatus',
              status,
              VEHICLE_OPERATION_STATUS_META[status]?.label,
            )}
            color={VEHICLE_OPERATION_STATUS_META[status]?.color ?? 'default'}
            size="sm"
          />
        </XStack>

        {vehicle.branchName ? <DataRow label={t('branch')} value={vehicle.branchName} /> : null}
        {/*
          Chuyến ĐANG CHẠY của chiếc xe này — chỉ hiện khi có thật. Xe đang rảnh thì KHÔNG bịa ra
          một dòng khách rỗng và một số còn nợ 0 ₫: hai dòng đó nói rằng có một chuyến, và không có.
        */}
        {vehicle.currentCustomerName ? (
          <DataRow label={t('customer')} value={vehicle.currentCustomerName} />
        ) : null}
        {vehicle.currentDebtAmount ? (
          <DataRow
            label={t('debt')}
            value={fmt.money(vehicle.currentDebtAmount)}
            tone="price"
            strong
          />
        ) : null}
      </YStack>
    </Card>
  );
}
