import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { PERMISSION } from '@xeprime/types';
import { Ionicons } from '@/components/icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PlanConsultationSheet } from '@/features/app-config/PlanConsultationSheet';
import { usePartnerAppConfig } from '@/features/app-config/use-partner-app-config';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { resolvePartnerOnboardingUrl } from '@/lib/partner-web-url';
import { useBadges } from '@/features/badges/hooks/use-badges';
import { useRefetchOnForeground } from '@/hooks/use-app-active';
import { queryKeys } from '@/queries/query-keys';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { layout } from '@/theme/layout';

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

/** Điều xảy ra tiếp theo - XePrime liên hệ tư vấn gói, kích hoạt thì báo (app không bán gói). */
const NEXT_STEPS = [
  { key: 'review', icon: 'shield-checkmark-outline' },
  { key: 'notify', icon: 'notifications-outline' },
  { key: 'refresh', icon: 'refresh-outline' },
] as const;

/** Bước 2 của tuyến GÓI trong app Partner — thẻ "Đăng ký thành công · Đang chờ kích hoạt". */
export function PackageWaitingPanel() {
  const colors = useColors();
  const t = useTranslations('ShopOnboarding.packageWaiting');
  const tSubscription = useTranslations('Subscription');
  // Màn này chỉ dựng khi đang chờ kích hoạt ⇒ chỉ nghe đúng lúc cần.
  usePackageActivationWatch();

  /*
   * Bước "Chọn gói và thanh toán" của web (`PackageShopCheckout`) KHÔNG dựng trong app (không IAP —
   * người dùng chốt 12/11/2026). Sau cờ khuyến mãi gói: một lối mở đúng bước đó trên site partner
   * và "Liên hệ tư vấn", như thẻ Gói & hạn mức. Cờ tắt ⇒ chỉ còn thẻ chờ, không nhắc gói/thanh toán.
   */
  const { isPlanPromotionEnabled } = usePartnerAppConfig();
  const { has } = usePermissions();
  const webUrl = resolvePartnerOnboardingUrl();
  const canOpenWeb = isPlanPromotionEnabled && webUrl !== null && has(PERMISSION.SUBSCRIPTION_PURCHASE);
  const [consultOpen, setConsultOpen] = useState(false);
  const openWeb = useCallback(() => {
    if (webUrl) void Linking.openURL(webUrl);
  }, [webUrl]);
  const openConsult = useCallback(() => setConsultOpen(true), []);
  const closeConsult = useCallback(() => setConsultOpen(false), []);

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
            px={layout.padX}
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

        {isPlanPromotionEnabled ? (
          <YStack alignSelf="stretch" gap={space.sm}>
            {canOpenWeb ? (
              <>
                <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
                  {t('webHint')}
                </Text>
                <Button label={t('openWeb')} icon="open-outline" onPress={openWeb} />
              </>
            ) : null}
            <Button
              label={tSubscription('mobilePlan.contactButton')}
              icon="call-outline"
              variant="secondary"
              onPress={openConsult}
            />
          </YStack>
        ) : null}
      </YStack>
      <PlanConsultationSheet open={consultOpen} onClose={closeConsult} />
    </Card>
  );
}
