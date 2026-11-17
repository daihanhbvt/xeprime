import { Ionicons } from '@/components/icons/Ionicons';
import { Linking, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  DRIVER_INCIDENT_LEVEL,
  SERVICE_TYPE,
  SUPPORT_HOTLINE,
  canCustomerCancelTrip,
} from '@xeprime/types';
import { telHref } from '@xeprime/domain';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, sizing, space } from '@/theme/tokens';
import type { CustomerTripDetail } from '../api';
import { CardLead, CardTitle } from './TripRequestCards';

/** Nút gọi tròn 38px — `.call` của web `TripDriverCard.module.css`. */
const CALL_SIZE = 38;

/**
 * "Tài xế" trên trang chuyến của KHÁCH — bản native của web `TripDriverCard` (ADR 0067 · ADR 0074):
 * người sẽ đến đón, gọi được ngay; chưa có ai thì "Đang sắp xếp tài xế".
 *
 * Tài xế đã nhận rồi rút (`driverIncident`) — khách KHÔNG biết ai đã rút, chỉ thấy mức điều phối:
 * sắp xếp / điều phối lại / sự cố sát giờ (kèm tổng đài). Server báo `freeCancel` thì có nút huỷ
 * hoàn 100% — mở CÙNG tấm huỷ của màn chuyến (`onCancel`), con số do server xem trước.
 */
export function TripDriverCard({
  trip,
  onCancel,
}: {
  trip: CustomerTripDetail;
  onCancel?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Trips.detail');
  if (trip.serviceType !== SERVICE_TYPE.WITH_DRIVER || !trip.bookingId) return null;
  const driver = trip.driver ?? null;
  const incident = trip.driverIncident ?? null;
  const tel = driver ? telHref(driver.phone) : null;
  const canFreeCancel =
    Boolean(onCancel) && Boolean(incident?.freeCancel) && canCustomerCancelTrip(trip.stage);

  return (
    <Card>
      <YStack gap={space.sm}>
        <CardTitle icon="id-card-outline">{t('driver')}</CardTitle>
        {driver ? (
          <XStack ai="center" jc="space-between" gap={space.md}>
            <YStack f={1} minWidth={0} gap={space.xs}>
              <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
                {driver.name}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.body}>
                {driver.phone}
              </Text>
            </YStack>
            {tel ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('driverCall', { name: driver.name })}
                hitSlop={(sizing.touchTarget - CALL_SIZE) / 2}
                onPress={() => void Linking.openURL(tel)}
              >
                <YStack
                  w={CALL_SIZE}
                  h={CALL_SIZE}
                  br={CALL_SIZE / 2}
                  bw={1}
                  bc={colors.border}
                  bg={colors.surface}
                  ai="center"
                  jc="center"
                >
                  <Ionicons name="call-outline" size={iconSize.sm} color={colors.text} />
                </YStack>
              </Pressable>
            ) : null}
          </XStack>
        ) : incident?.level === DRIVER_INCIDENT_LEVEL.URGENT ? (
          <Callout tone="warning" title={t('driverIncident.urgentTitle')}>
            <Text col={colors.text} fos={fontSize.bodySm}>
              {t.rich('driverIncident.urgentBody', {
                phone: SUPPORT_HOTLINE.display,
                tel: (chunks) => (
                  <Text
                    col={colors.accentText}
                    fow={fontWeight.semibold}
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(`tel:${SUPPORT_HOTLINE.tel}`)}
                  >
                    {chunks}
                  </Text>
                ),
              })}
            </Text>
          </Callout>
        ) : (
          <CardLead>
            {incident?.level === DRIVER_INCIDENT_LEVEL.REARRANGING
              ? t('driverIncident.rearranging')
              : t('driverArranging')}
          </CardLead>
        )}

        {canFreeCancel ? (
          <YStack gap={space.sm}>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('driverIncident.freeCancelHint')}
            </Text>
            <Button
              label={t('driverIncident.freeCancel')}
              variant="dangerOutline"
              onPress={() => onCancel?.()}
            />
          </YStack>
        ) : null}
      </YStack>
    </Card>
  );
}
