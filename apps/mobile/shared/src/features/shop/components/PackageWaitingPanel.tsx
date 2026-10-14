import { useCallback, useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Card } from '@/components/ui/Card';
import { useBadges } from '@/features/badges/hooks/use-badges';
import { useRefetchOnForeground } from '@/hooks/use-app-active';
import { queryKeys } from '@/queries/query-keys';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

const ICON_RING = 96;
const ICON_DISC = 64;
const ICON_GLYPH = 34;
const NEXT_DOT = 28;

/**
 * Theo dõi lúc gian hàng tuyến GÓI được kích hoạt — REALTIME, không có nút làm mới (ADR 0040 điều 3).
 *
 * Mốc `package_active` do webhook SePay ghi trong transaction bật thuê bao, và CHÍNH transaction đó
 * phát thông báo `SUBSCRIPTION_ACTIVATED` cho thành viên gian hàng. Thông báo làm con số chưa đọc
 * trong bản chiếu huy hiệu Firestore đổi (ADR 0034) — `BadgeRealtimeProvider` nghe được ngay. Nên
 * không cần kênh realtime thứ hai: số chưa đọc đổi ⇒ đọc lại `/auth/me`; scope mới về thì effect
 * của màn onboarding đưa người dùng vào Manage. Firebase không nghe được thì provider tự rơi về
 * hỏi lại 30s, cộng thêm lượt hỏi khi app quay lại tiền cảnh ở đây.
 */
export function usePackageActivationWatch(): void {
  const queryClient = useQueryClient();
  const { notificationsUnread } = useBadges();
  const reloadScope = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
  }, [queryClient]);

  // Bỏ qua giá trị ĐẦU (lúc mount) — chỉ một lần THAY ĐỔI mới là tín hiệu.
  const previous = useRef<number | null>(null);
  useEffect(() => {
    if (previous.current !== null && previous.current !== notificationsUnread) reloadScope();
    previous.current = notificationsUnread;
  }, [notificationsUnread, reloadScope]);

  useRefetchOnForeground(reloadScope);
}

/** Điều xảy ra tiếp theo — chỉ nói chuyện duyệt tài khoản, không nhắc gói/thanh toán (app không bán gói). */
const NEXT_STEPS = [
  { key: 'review', icon: 'shield-checkmark-outline' },
  { key: 'notify', icon: 'notifications-outline' },
  { key: 'refresh', icon: 'refresh-outline' },
] as const;

/** Bước 2 của tuyến GÓI trong app Partner — thẻ "Đăng ký thành công · Đang chờ kích hoạt". */
export function PackageWaitingPanel() {
  const t = useTranslations('ShopOnboarding.packageWaiting');
  // Màn này chỉ dựng khi đang chờ kích hoạt ⇒ chỉ nghe đúng lúc cần.
  usePackageActivationWatch();

  return (
    <Card>
      <YStack gap={space.lg} ai="center" py={space.lg}>
        {/* Vòng kép: nền nhạt bao ngoài, lõi đặc — dấu tích nổi rõ hơn một icon viền. */}
        <YStack
          w={ICON_RING}
          h={ICON_RING}
          br={radius.pill}
          bg={colors.successSurface}
          ai="center"
          jc="center"
        >
          <YStack
            w={ICON_DISC}
            h={ICON_DISC}
            br={radius.pill}
            bg={colors.success}
            ai="center"
            jc="center"
          >
            <Ionicons name="checkmark" size={ICON_GLYPH} color={colors.textInverse} />
          </YStack>
        </YStack>

        <YStack gap={space.sm} ai="center">
          <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold} ta="center">
            {t('title')}
          </Text>
          <XStack
            ai="center"
            gap={space.xs}
            px={space.md}
            py={space.xs}
            br={radius.pill}
            bg={colors.warningSurface}
          >
            <Ionicons name="time-outline" size={iconSize.sm} color={colors.warning} />
            <Text col={colors.warning} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {t('status')}
            </Text>
          </XStack>
        </YStack>

        <YStack
          alignSelf="stretch"
          gap={space.md}
          pt={space.lg}
          borderTopWidth={1}
          borderTopColor={colors.border}
        >
          {NEXT_STEPS.map((step) => (
            <XStack key={step.key} ai="flex-start" gap={space.sm}>
              <YStack
                w={NEXT_DOT}
                h={NEXT_DOT}
                br={radius.pill}
                bg={colors.surfaceMuted}
                ai="center"
                jc="center"
              >
                <Ionicons name={step.icon} size={iconSize.sm} color={colors.textMuted} />
              </YStack>
              <Text f={1} col={colors.textMuted} fos={fontSize.bodySm} pt={space.xs}>
                {t(`next.${step.key}`)}
              </Text>
            </XStack>
          ))}
        </YStack>
      </YStack>
    </Card>
  );
}
