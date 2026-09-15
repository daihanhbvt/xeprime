import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { Href } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { APP_SCOPE } from './app-scope';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { IconName } from '@/components/ui/Chip';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { useShellScope } from './use-shell-scope';

/** Ba trạng thái của cùng một cửa — khớp một-một với `Account.shopEntry.<variant>` bên web. */
type Variant = 'platform' | 'hasShop' | 'noShop';

interface VariantConfig {
  readonly icon: IconName;
  readonly href: Href;
  /** Đích ở KHU QUẢN LÝ ⇒ đổi khu (`switchTo`); không thì `push` như một màn chen ngang. */
  readonly manage: boolean;
}

const CONFIG: Readonly<Record<Variant, VariantConfig>> = {
  platform: { icon: 'shield-checkmark-outline', href: ROUTES.manage.home(), manage: true },
  hasShop: { icon: 'storefront-outline', href: ROUTES.manage.home(), manage: true },
  /*
   * Đăng ký gian hàng nằm dưới `manage/` để deep link ánh xạ 1-1 với web, nhưng nó là màn của
   * người CHƯA có gian hàng — `ScopeGuard` cho qua đúng route đó. Đổi khu sang một nơi họ chưa có
   * quyền vào là đá chính họ ra ngay sau đó, nên nó `push`.
   */
  noShop: { icon: 'storefront-outline', href: ROUTES.manage.onboarding(), manage: false },
};

/**
 * Cửa đi từ khu TÀI KHOẢN sang khu QUẢN LÝ — bản native của `ShopEntryCard` bên web, cùng ba
 * trạng thái và cùng bó chữ (`Account.shopEntry`).
 *
 * ADR 0014: một con người có thể mang nhiều vai, nên thẻ đọc vai THỰC TẾ của người đang đăng
 * nhập thay vì bày sẵn cả ba:
 *  - nhân sự nền tảng → vào trang quản trị (vai nền tảng THẮNG vai gian hàng, và phải xét trước:
 *    một `platform_admin` không thuộc gian hàng nào vẫn tới được màn này);
 *  - có gian hàng     → vào cổng quản lý, tiêu đề là TÊN gian hàng thật;
 *  - chưa có          → mời mở gian hàng (cửa vào phễu thu phí của ADR 0015).
 *
 * **KHÔNG thêm tab thứ 5.** Số mục trên thanh tab không được đổi theo vai: người có gian hàng và
 * người không có sẽ thấy hai thanh tab khác nhau, và thanh tab nhảy layout ngay sau khi đăng
 * nhập. Thẻ này chỉ chiếm chỗ trong tab Tài khoản.
 */
export function ShopEntryCard() {
  const t = useTranslations('Account.shopEntry');
  const navigateOnce = useNavigateOnce();
  const { switchTo } = useShellScope();
  const { data: user, isLoading } = useCurrentUser();

  /*
   * Chưa biết mình là ai thì chưa đoán: hiện thẻ "Đăng xe cho thuê" cho một chủ shop đang chờ
   * `/auth/me` trả về là mời họ làm lại thứ họ đã làm rồi.
   */
  if (isLoading || !user) return null;

  const variant: Variant = user.platformRole ? 'platform' : user.tenant ? 'hasShop' : 'noShop';
  const config = CONFIG[variant];
  // Tên gian hàng thật đọc rõ hơn nhãn chung — nhưng chỉ khi đã có gian hàng.
  const title =
    variant === 'hasShop'
      ? (user.tenant?.name ?? t('hasShop.title'))
      : t(`${variant}.title` as never);
  const action = t(`${variant}.action` as never);

  const open = () => {
    if (config.manage) switchTo(APP_SCOPE.MANAGE, config.href);
    else navigateOnce(config.href);
  };

  return (
    <Card padded={false}>
      <LinearGradient
        colors={[colors.primaryLight, colors.surface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ padding: space.md, gap: space.md }}
      >
        <XStack ai="center" gap={space.md}>
          <YStack w={42} h={42} br={radius.md} bg={colors.surface} ai="center" jc="center">
            <Ionicons name={config.icon} size={iconSize.lg} color={colors.primaryActive} />
          </YStack>
          <YStack f={1} minWidth={0} gap={2}>
            <Text
              col={colors.text}
              fos={fontSize.bodyLg}
              fow={fontWeight.bold}
              // Tên gian hàng do người dùng đặt — dài bao nhiêu cũng không được đẩy nút ra khỏi thẻ.
              numberOfLines={1}
            >
              {title}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t(`${variant}.body` as never)}
            </Text>
          </YStack>
        </XStack>

        {/*
          Nút chiếm TRỌN bề ngang trên một dòng riêng — đúng cách web bày thẻ này ở ≤640px. Nhét
          nút vào cạnh chữ ở 360dp thì hoặc tên gian hàng còn vài ký tự, hoặc nút hụt vùng chạm.
        */}
        <Button
          label={action}
          variant={variant === 'noShop' ? 'primary' : 'secondary'}
          size="sm"
          onPress={open}
        />
      </LinearGradient>
    </Card>
  );
}
