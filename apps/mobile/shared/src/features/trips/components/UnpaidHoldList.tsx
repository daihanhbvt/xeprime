import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { HOLD_COUNTDOWN_SEGMENT_MINUTES } from '@xeprime/types';
import { dayjs } from '@xeprime/domain';
import { Button } from '@/components/ui/Button';
import { Countdown } from '@/components/ui/Countdown';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { CustomerUnpaidHold } from '../api';

const THUMB_W = 64;
const THUMB_H = 44;

const styles = StyleSheet.create({
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: radius.sm },
});

/**
 * Danh sách chuyến khách đang GIỮ mà chưa trả — bản native của `UnpaidHoldList` (web).
 *
 * Dùng ở hai nơi nói cùng một chuyện: thẻ nhắc đầu "Chuyến của tôi" và màn chặn của luồng đặt xe
 * khi khách đã giữ đủ trần. Mỗi dòng trả lời ba câu: xe nào, bao nhiêu, còn bao lâu — và một lối
 * thẳng sang màn thanh toán. Đồng hồ đọc MỐC của server; server đã xếp gấp nhất trước.
 */
export function UnpaidHoldList({
  items,
  onNavigate,
  replace = false,
}: {
  items: readonly CustomerUnpaidHold[];
  /** Gọi trước khi rời sang màn thanh toán (luồng đặt xe đóng mình lại). */
  onNavigate?: () => void;
  /**
   * `true` ⇒ màn thanh toán THAY màn hiện tại (luồng đặt xe bị chặn — web `onClose`): nút lui không
   * quay về một form đặt xe đang bị chặn bởi chính trần giữ chỗ.
   */
  replace?: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Trips');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  const router = useRouter();

  return (
    <YStack gap={space.sm} accessibilityLabel={t('unpaid.listLabel')}>
      {items.map((item) => (
        <YStack
          key={item.tripId}
          gap={space.sm}
          p={space.sm}
          br={radius.md}
          bg={colors.surface}
          bw={1}
          bc={colors.border}
        >
          <XStack gap={space.sm} ai="center">
            {item.vehicleImageUrl ? (
              <Image
                source={{ uri: item.vehicleImageUrl }}
                style={styles.thumb}
                contentFit="cover"
                cachePolicy="memory-disk"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <YStack
                w={THUMB_W}
                h={THUMB_H}
                br={radius.sm}
                bg={colors.surfaceMuted}
                ai="center"
                jc="center"
              >
                <Ionicons name="car-outline" size={iconSize.md} color={colors.textMuted} />
              </YStack>
            )}
            <YStack f={1} gap={2}>
              <Text
                col={colors.text}
                fos={fontSize.body}
                fow={fontWeight.semibold}
                numberOfLines={1}
              >
                {item.vehicleName}
              </Text>
              {item.pickupAt && item.returnAt ? (
                <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
                  {fmt.rentalRangeSummary(dayjs(item.pickupAt), dayjs(item.returnAt))}
                </Text>
              ) : null}
              <Countdown
                deadline={item.expiresAt}
                urgentMs={HOLD_COUNTDOWN_SEGMENT_MINUTES * 60_000}
                labels={{
                  remaining: t('hold.countdownRemaining'),
                  expired: t('hold.countdownExpired'),
                }}
              />
            </YStack>
          </XStack>

          <XStack ai="center" jc="space-between" gap={space.sm}>
            <YStack>
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('unpaid.amountLabel')}
              </Text>
              <Text col={colors.price} fos={fontSize.body} fow={fontWeight.bold}>
                {fmt.money(item.remainingAmount)}
              </Text>
            </YStack>
            <Button variant="gradient"
              size="sm"
              icon="card-outline"
              label={t('unpaid.pay')}
              accessibilityLabel={t('unpaid.payAria', { vehicle: item.vehicleName })}
              onPress={() => {
                onNavigate?.();
                const href = ROUTES.booking.payment(item.tripId);
                if (replace) router.replace(href);
                else navigateOnce(href);
              }}
            />
          </XStack>
        </YStack>
      ))}
    </YStack>
  );
}
