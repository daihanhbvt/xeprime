import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@/components/icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/Button';
import { PlanConsultationSheet } from '@/features/app-config/PlanConsultationSheet';
import { usePartnerAppConfig } from '@/features/app-config/use-partner-app-config';
import { useBadges } from '@/features/badges/hooks/use-badges';
import { BookingResult } from '@/features/booking-requests/components/BookingResult';
import { useRefetchOnForeground } from '@/hooks/use-app-active';
import { queryKeys } from '@/queries/query-keys';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

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

/** Điều xảy ra tiếp theo - KHÔNG nhắc chữ "gói" (app Partner né IAP). */
const NEXT_STEPS = [
  { key: 'reviewApp', icon: 'shield-checkmark-outline' },
  { key: 'notify', icon: 'notifications-outline' },
  { key: 'refresh', icon: 'refresh-outline' },
] as const;

/**
 * Bước chờ kích hoạt của tuyến GÓI trong app Partner — cùng khuôn hộp "Đã tạo đơn thuê"
 * (`BookingResult`): huy hiệu · tiêu đề · lời dẫn, rồi MỘT thẻ (trạng thái + các bước tiếp theo).
 */
export function PackageWaitingPanel() {
  const colors = useColors();
  const t = useTranslations('ShopOnboarding.packageWaiting');
  const tSubscription = useTranslations('Subscription');
  // Màn này chỉ dựng khi đang chờ kích hoạt ⇒ chỉ nghe đúng lúc cần.
  usePackageActivationWatch();

  /*
   * Bước "Chọn gói và thanh toán" của web KHÔNG dựng trong app, và app cũng KHÔNG dẫn ra web để
   * mua/chuyển khoản (Apple 3.1.1/3.1.3, chính sách Thanh toán Google Play - người dùng chốt
   * 19/11/2026; đừng thêm lại nút "Chọn gói trên website"). Sau cờ khuyến mãi gói chỉ có
   * "Liên hệ tư vấn".
   */
  const { isPlanPromotionEnabled } = usePartnerAppConfig();
  const [consultOpen, setConsultOpen] = useState(false);
  const openConsult = useCallback(() => setConsultOpen(true), []);
  const closeConsult = useCallback(() => setConsultOpen(false), []);

  return (
    <>
      <BookingResult
        title={t('title')}
        lead={t('leadApp')}
        code={null}
        footer={
          isPlanPromotionEnabled ? (
            <Button
              label={tSubscription('mobilePlan.contactButton')}
              icon="call-outline"
              variant="secondary"
              onPress={openConsult}
            />
          ) : null
        }
      >
        <YStack bg={colors.surface} bw={1} bc={colors.border} br={16} p={16} gap={12}>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text col={colors.placeholder} fos={14} lh={20}>
              {t('statusLabel')}
            </Text>
            <XStack
              ai="center"
              gap={space.xs}
              px={space.sm}
              py={2}
              br={radius.pill}
              bg={colors.warningSurface}
            >
              <Ionicons name="time-outline" size={iconSize.sm} color={colors.warning} />
              <Text col={colors.warning} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {t('status')}
              </Text>
            </XStack>
          </XStack>
          <YStack h={1} bg={colors.borderSubtle} />
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
              <Text f={1} col={colors.textMuted} fos={14} lh={20} pt={space.xs}>
                {t(`next.${step.key}`)}
              </Text>
            </XStack>
          ))}
        </YStack>
      </BookingResult>
      <PlanConsultationSheet open={consultOpen} onClose={closeConsult} />
    </>
  );
}
