import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { SERVICE_TYPE } from '@xeprime/types';
import { telHref } from '@xeprime/domain';
import { Card } from '@/components/ui/Card';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, sizing, space } from '@/theme/tokens';
import type { CustomerTripDetail } from '../api';
import { CardLead, CardTitle } from './TripRequestCards';

/** Nút gọi tròn 38px — `.call` của web `TripDriverCard.module.css`. */
const CALL_SIZE = 38;

/**
 * "Tài xế" trên trang chuyến của KHÁCH — bản native của web `TripDriverCard` (ADR 0067): người sẽ
 * đến đón (tài xế liên kết đã nhận hay tài xế ngoài hệ thống), gọi được ngay; chưa có ai thì "Đang
 * sắp xếp tài xế". Ai được hiện cho ai do SERVER quyết (`driver`); chuyến không có tài xế, hay chưa
 * có đơn, thì khối im lặng.
 */
export function TripDriverCard({ trip }: { trip: CustomerTripDetail }) {
  const colors = useColors();
  const t = useTranslations('Trips.detail');
  if (trip.serviceType !== SERVICE_TYPE.WITH_DRIVER || !trip.bookingId) return null;
  const driver = trip.driver ?? null;
  const tel = driver ? telHref(driver.phone) : null;

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
        ) : (
          <CardLead>{t('driverArranging')}</CardLead>
        )}
      </YStack>
    </Card>
  );
}
