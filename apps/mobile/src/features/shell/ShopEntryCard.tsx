import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { APP_SCOPE } from './app-scope';
import { Card } from '@/components/ui/Card';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import { useShellScope } from './use-shell-scope';

/**
 * Lối vào khu quản lý từ tab Tài khoản — đối xứng với `ShopEntryCard` bên web.
 *
 * **KHÔNG thêm tab thứ 5.** Số mục trên thanh tab không được đổi theo vai: người có gian hàng
 * và người không có sẽ thấy hai thanh tab khác nhau, và thanh tab nhảy layout ngay sau khi đăng
 * nhập. Thẻ này chỉ chiếm chỗ với người thực sự có gian hàng.
 *
 * Không hiện số đơn chờ duyệt ở đây: doc 15 §3.2 cho phép, nhưng chỉ khi con số đã có sẵn trong
 * cache — gọi thêm một API chỉ để trang trí một thẻ là chi phí mạng cho mọi lần mở tab Tài khoản.
 */
export function ShopEntryCard() {
  const t = useTranslations('MobileShell.scope');
  const domainLabel = useDomainLabel();
  const { tenant, isLoading } = useTenantScope();
  const { switchTo } = useShellScope();

  // Đang tải hay lỗi mạng không có cache: ẩn. Một thẻ rỗng trông như lỗi render.
  if (isLoading || !tenant) return null;

  return (
    <Card onPress={() => switchTo(APP_SCOPE.MANAGE)} accessibilityLabel={t('enterManage')}>
      <XStack ai="center" gap={space.md}>
        <Ionicons name="storefront-outline" size={iconSize.lg} color={colors.primaryActive} />
        <YStack f={1} gap={2}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} numberOfLines={1}>
            {tenant.name}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
            {t('manageSubtitle', { role: domainLabel('tenantRole', tenant.roleKey) })}
          </Text>
        </YStack>
        <Ionicons name="chevron-forward" size={iconSize.md} color={colors.textMuted} />
      </XStack>
    </Card>
  );
}
