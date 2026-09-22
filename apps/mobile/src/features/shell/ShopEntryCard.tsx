import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { Href } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { canUpgradeToPackageTrack } from '@xeprime/types';
import { APP_SCOPE } from './app-scope';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { IconName } from '@/components/ui/Chip';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { canUseManagePortal } from '@/features/account/account-nav';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { useShellScope } from './use-shell-scope';

/** Bốn trạng thái của cùng một cửa — khớp một-một với `Account.shopEntry.<variant>` bên web. */
type Variant = 'platform' | 'hasShop' | 'upgrade' | 'noShop';

interface VariantConfig {
  readonly icon: IconName;
  readonly href: Href;
  /** Đích ở KHU QUẢN LÝ ⇒ đổi khu (`switchTo`); không thì `push` như một màn chen ngang. */
  readonly manage: boolean;
}

const CONFIG: Readonly<Record<Variant, VariantConfig>> = {
  platform: { icon: 'shield-checkmark-outline', href: ROUTES.manage.home(), manage: true },
  /*
   * `hasShop` chỉ còn dựng cho người VÀO ĐƯỢC cổng quản lý — xem chốt ở đầu component. Nhờ vậy
   * đích ở đây lại cố định được: không còn ca nào cần suy đích theo tuyến lúc bấm.
   */
  hasShop: { icon: 'storefront-outline', href: ROUTES.manage.home(), manage: true },
  /*
   * CHỦ XE TUYẾN HOA HỒNG ⇒ màn Gói dịch vụ ở khu TÀI KHOẢN, nơi luồng nâng cấp sống.
   *
   * Không phải đích ở khu quản lý: họ chưa vào được cổng đó (ADR 0038 điều 4), và đây chính là
   * cửa để họ mua quyền vào. `manage: false` vì vậy.
   */
  upgrade: { icon: 'trending-up-outline', href: ROUTES.account.subscription(), manage: false },
  /*
   * Chưa có gian hàng ⇒ LANDING "Đăng xe cho thuê", không phải thẳng form đăng ký.
   *
   * Từ ADR 0040 có HAI cửa vào với hai hợp đồng khác nhau, và landing là nơi người dùng chọn cửa.
   * Nhảy thẳng vào `/manage/onboarding` là chọn hộ họ cửa MẶC ĐỊNH (hoa hồng) — người muốn mở gian
   * hàng trả phí sẽ được server gán gói hoa hồng và rơi vào đúng màn "Hồ sơ chủ xe" của tuyến kia.
   * Web dẫn cùng chỗ (`ROUTES.LIST_YOUR_VEHICLE.ROOT`) vì cùng lý do.
   */
  noShop: { icon: 'storefront-outline', href: ROUTES.listYourVehicle.root(), manage: false },
};

/**
 * Cửa đi từ khu TÀI KHOẢN sang khu QUẢN LÝ — bản native của `ShopEntryCard` bên web, cùng bốn
 * trạng thái và cùng bó chữ (`Account.shopEntry`).
 *
 * ADR 0014: một con người có thể mang nhiều vai, nên thẻ đọc vai THỰC TẾ của người đang đăng
 * nhập thay vì bày sẵn cả bốn:
 *  - nhân sự nền tảng     → vào trang quản trị (vai nền tảng THẮNG vai gian hàng, và phải xét
 *    trước: một `platform_admin` không thuộc gian hàng nào vẫn tới được màn này);
 *  - có gian hàng gói     → vào cổng quản lý, tiêu đề là TÊN gian hàng thật;
 *  - chủ xe tuyến hoa hồng → mời NÂNG CẤP lên gian hàng (ADR 0028 điều 1);
 *  - chưa có gian hàng    → mời mở gian hàng (cửa vào phễu thu phí của ADR 0015).
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

  /*
   * Thuộc một gian hàng mà KHÔNG vào được cổng quản lý ⇒ không dựng thẻ nào.
   *
   * Thẻ này chỉ có một lời mời: "Vào quản lý gian hàng". Với chủ xe tuyến hoa hồng — và với mọi
   * thành viên của một tenant không ở tuyến gói — lời mời đó dẫn tới một cánh cửa đóng
   * (`ScopeGuard` + `SubscriptionTrackGuard`, ADR 0038 điều 4). Trước đợt này nó vẫn hiện, chỉ
   * âm thầm đổi đích sang danh sách xe: nhãn hứa một nơi, cú bấm đưa tới nơi khác.
   *
   * Họ không mất gì: menu Owner Lite đã có đủ danh sách xe, lịch xe và công cụ cho thuê.
   *
   * Nhân sự nền tảng xét TRƯỚC — một `platform_admin` không thuộc gian hàng nào vẫn cần lối vào
   * trang quản trị.
   */
  /*
   * CHỦ XE TUYẾN HOA HỒNG — lời mời duy nhất đúng với họ là NÂNG CẤP, và nó xét trước nhánh
   * "không vào được Manage thì thôi" ngay dưới.
   *
   * Đây là cửa vào duy nhất của phễu nâng cấp trên app: "Gói dịch vụ" cố ý KHÔNG là một mục
   * menu thường trực (`account-nav.ts`) vì nâng cấp là việc làm MỘT LẦN.
   *
   * Điều kiện đọc từ `canUpgradeToPackageTrack` (ADR 0038 điều 1 · ADR 0040 điều 4), nên nhân
   * viên gian hàng hoa hồng, tenant thiếu gói hiện hành và gian hàng đã từng trả tiền đều KHÔNG
   * rơi vào đây — ba nhóm mà chữ "Nâng cấp lên gian hàng" nói sai.
   */
  const canUpgrade = !user.platformRole && canUpgradeToPackageTrack(user.tenant);

  if (!user.platformRole && user.tenant && !canUseManagePortal(user) && !canUpgrade) return null;

  const variant: Variant = user.platformRole
    ? 'platform'
    : canUpgrade
      ? 'upgrade'
      : user.tenant
        ? 'hasShop'
        : 'noShop';
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
        {/* Hai biến thể MỜI làm một việc mới đi nút chính; hai biến thể dẫn về nơi quen thuộc thì không. */}
        <Button
          label={action}
          variant={variant === 'noShop' || variant === 'upgrade' ? 'primary' : 'secondary'}
          size="sm"
          onPress={open}
        />
      </LinearGradient>
    </Card>
  );
}
