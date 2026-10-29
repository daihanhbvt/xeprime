import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { GradientButton } from '@/features/marketplace/components/home/GradientButton';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

/** Ô biểu tượng 44×44 của web `.badge`. */
const BADGE_SIZE = 44;

/**
 * Thẻ "Đăng xe cho thuê" dưới thẻ hồ sơ — bản native của `ShopEntryCard` bên web (design Account /
 * Profile, Figma `19760:56452`), bố cục ≤640px: biểu tượng + chữ trên một hàng, nút gradient chiếm
 * trọn hàng dưới.
 *
 * Web có bốn biến thể theo vai (gian hàng · nâng cấp · chưa có gian hàng · nhân sự nền tảng), nhưng
 * tab này chỉ chạy trong app KHÁCH: tài khoản khách không có gian hàng và không mang vai nền tảng
 * (ADR 0053). Chỉ biến thể "chưa có gian hàng" có nghĩa ở đây; tài khoản nào mang `tenant` hay
 * `platformRole` thì không dựng gì thay vì mời họ vào một cánh cửa của app khác.
 *
 * Đích là cùng lối sang đăng ký đối tác với mục "Trở thành chủ xe" của menu (`ROUTES.manage.register`).
 */
export function ShopEntryCard() {
  const colors = useColors();
  const t = useTranslations('Account.shopEntry');
  const navigateOnce = useNavigateOnce();
  const { data: user, isLoading } = useCurrentUser();

  // Chưa biết mình là ai thì chưa đoán — như web.
  if (isLoading || !user || user.platformRole || user.tenant) return null;

  return (
    <YStack
      gap={space.md}
      p={space.md}
      bw={1}
      bc={colors.primaryGlow}
      br={radius.card}
      bg={colors.primarySubtle}
    >
      <XStack gap={space.md} ai="center">
        <YStack
          w={BADGE_SIZE}
          h={BADGE_SIZE}
          br={radius.control}
          bg={colors.primaryLight}
          ai="center"
          jc="center"
        >
          <Ionicons name="storefront-outline" size={20} color={colors.primaryHover} />
        </YStack>
        <YStack f={1} minWidth={0} gap={space.xs}>
          <Text
            col={colors.text}
            fos={fontSize.bodyLg}
            fow={fontWeight.semibold}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {t('noShop.title')}
          </Text>
          <Text col={colors.placeholder} fos={fontSize.body}>
            {t('noShop.body')}
          </Text>
        </YStack>
      </XStack>
      <GradientButton
        label={t('noShop.action')}
        iconEnd="arrow-forward"
        radius={radius.control}
        onPress={() => navigateOnce(ROUTES.manage.register())}
      />
    </YStack>
  );
}
