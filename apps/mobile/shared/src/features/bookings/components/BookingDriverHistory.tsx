import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  DRIVER_ASSIGNMENT_OUTCOME_META,
  STATUS_COLOR,
  type DriverAssignmentOutcome,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { CardAccent } from '@/components/ui/CardAccent';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import { useBookingDriverHistory } from '../hooks/use-bookings';

/**
 * Lịch sử gán tài xế của đơn (ADR 0063) — gương `BookingDriverHistory` của web. Thu gọn mặc định,
 * mở ra mới tải. Mỗi lượt: ai được gán, ai gán (hoặc hệ thống), lúc nhận, kết thúc ra sao.
 */
export function BookingDriverHistory({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Drivers.history');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const [open, setOpen] = useState(false);
  const history = useBookingDriverHistory(bookingId, open);

  const meta = (text: string, key?: string) => (
    <Text key={key} col={colors.textMuted} fos={fontSize.label}>
      {text}
    </Text>
  );

  return (
    <YStack gap={space.xs}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t('title')}
      >
        <XStack ai="center" gap={space.xs} py={space.xs}>
          <Text f={1} col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
            {t('title')}
          </Text>
          <Ionicons
            name={open ? 'chevron-up-outline' : 'chevron-down-outline'}
            size={iconSize.sm}
            color={colors.textMuted}
          />
        </XStack>
      </Pressable>

      {!open ? null : history.isLoading ? (
        <SkeletonText lines={2} />
      ) : history.isError ? (
        meta(t('loadError'))
      ) : !history.data?.length ? (
        meta(t('empty'))
      ) : (
        <YStack gap={space.sm}>
          {history.data.map((h) => {
            const color =
              DRIVER_ASSIGNMENT_OUTCOME_META[h.outcome as DriverAssignmentOutcome]?.color ??
              STATUS_COLOR.NEUTRAL;
            return (
              <XStack key={h.id} gap={space.sm}>
                <CardAccent color={color} />
                <YStack f={1} gap={2} minWidth={0}>
                  <XStack ai="center" gap={space.xs} flexWrap="wrap">
                    <Text f={1} col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
                      {[h.driverName, h.driverPhone].filter(Boolean).join(LIST_SEPARATOR)}
                    </Text>
                    <StatusBadge
                      label={domainLabel('driverAssignmentOutcome', h.outcome)}
                      color={color}
                      size="sm"
                    />
                  </XStack>
                  {meta(
                    h.assignedByName
                      ? t('assignedBy', { name: h.assignedByName, time: fmt.dateTime(h.assignedAt) })
                      : t('assignedBySystem', { time: fmt.dateTime(h.assignedAt) }),
                  )}
                  {h.acceptedAt ? meta(t('acceptedAt', { time: fmt.dateTime(h.acceptedAt) })) : null}
                  {h.endedAt
                    ? meta(
                        h.endedByName
                          ? t('endedBy', { name: h.endedByName, time: fmt.dateTime(h.endedAt) })
                          : t('endedAt', { time: fmt.dateTime(h.endedAt) }),
                      )
                    : null}
                </YStack>
              </XStack>
            );
          })}
        </YStack>
      )}
    </YStack>
  );
}
