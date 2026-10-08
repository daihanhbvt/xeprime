import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { Href } from 'expo-router';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { AccountTrackBadge } from '@/features/account/components/AccountTrackBadge';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, iconSize, sizing, space } from '@/theme/tokens';
import type { IconName } from '@/components/ui/Chip';
import { LogoutRow } from './LogoutRow';
import { useManageDrawer } from './ManageDrawerHost';
import { useShopSettingsAccess } from '@/features/shop/hooks/use-shop-settings-access';

/**
 * MENU TÀI KHOẢN của khu quản lý — bản native của dropdown trên `ManageUserCard` bên web.
 *
 * Cùng bộ mục, cùng thứ tự: nhãn TUYẾN mở đầu (thứ duy nhất thẻ ở chân drawer chưa nói) → "Hồ
 * sơ" → "Cài đặt gian hàng" (chỉ CHỦ gian hàng) → "Đăng xuất".
 *
 * ## Vì sao nó phải tồn tại
 *
 * Trước đợt này (16/09/2026) khu quản lý KHÔNG có chỗ nào để đăng xuất: lối duy nhất nằm ở cuối
 * menu khu khách (`AccountNav`), mà một tài khoản gian hàng tuyến gói gần như không bao giờ mở
 * tới đó — khu khách của họ chỉ còn ba mục (ADR 0038 điều 7). Người dùng phải xoá app hoặc chờ
 * phiên hết hạn.
 *
 * ## Tấm trượt, không phải menu neo
 *
 * Web thả dropdown ngay trên thẻ vì con trỏ giữ được nó mở. Trên màn 360dp một tấm menu neo vào
 * chân drawer thì hoặc tràn ra ngoài, hoặc đè lên chính thẻ vừa bấm — nên native mở từ đáy, đúng
 * cử chỉ mà mọi tấm chọn khác trong app đang dùng.
 *
 * Bộ đổi NGÔN NGỮ đi kèm ở cuối: nó vốn nằm ở ngăn "Thêm", mà ngăn đó chỉ còn mỗi nó (đổi khu đã
 * có nút riêng trên thanh trên). Gom vào đây thì mọi thứ thuộc về CON NGƯỜI đang đăng nhập nằm
 * chung một chỗ, thay vì rải ra hai màn.
 */
export function ManageAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('ManageCommon.shell');
  const tAccount = useTranslations('Account');
  const navigateOnce = useNavigateOnce();
  const drawer = useManageDrawer();
  const { data: user } = useCurrentUser();

  /*
   * "Cài đặt gian hàng" — cùng luật web `useShopSettingsAccess` (PR #151): có `tenant.view` và gian
   * hàng TUYẾN GÓI. Chủ xe tuyến hoa hồng không có trang Cửa hàng; hồ sơ của họ là "Hồ sơ chủ xe".
   */
  const canOpenShopSettings = useShopSettingsAccess();

  /** Đóng cả tấm trượt LẪN drawer trước khi đi: để ngỏ thì màn mới mở ra sau hai lớp phủ. */
  const go = (href: Href) => {
    onClose();
    drawer.close();
    navigateOnce(href);
  };

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title={t('accountMenu')} padded={false}>
        <YStack py={space.xs}>
          {/*
            Nhãn TUYẾN mở đầu, đúng như web: tên gói đang trả tiền / % phí dịch vụ đang thu / gói
            đang hỏng (ADR 0038) — thứ mà chip vai trên thẻ ở chân drawer không nói được.
          */}
          {user?.tenant ? (
            <XStack px={space.md} pb={space.sm}>
              <AccountTrackBadge tenant={user.tenant} size="sm" />
            </XStack>
          ) : null}

          <MenuRow
            icon="person-outline"
            label={t('account')}
            onPress={() => go(ROUTES.manage.account())}
          />
          {canOpenShopSettings ? (
            <MenuRow
              icon="storefront-outline"
              label={t('shopSettings')}
              onPress={() => go(ROUTES.manage.shop())}
            />
          ) : null}

          <Divider />

          <XStack ai="center" gap={space.sm} px={space.md} py={space.sm}>
            <Ionicons name="language-outline" size={iconSize.md} color={colors.textMuted} />
            <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.medium}>
              {tAccount('title')}
            </Text>
            <LocaleSwitcher />
          </XStack>

          <Divider />

          <LogoutRow
            onDone={() => {
              onClose();
              drawer.close();
            }}
          />
        </YStack>
      </BottomSheet>
    </>
  );
}

function Divider() {
  return <YStack h={1} bg={colors.borderSubtle} my={space.xs} />;
}

function MenuRow({
  icon,
  label,
  tone = colors.text,
  onPress,
}: {
  icon: IconName;
  label: string;
  tone?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      style={({ pressed }) => (pressed ? { backgroundColor: colors.surfaceMuted } : null)}
    >
      <XStack ai="center" gap={space.sm} minHeight={sizing.touchTarget} px={space.md}>
        <Ionicons name={icon} size={iconSize.md} color={tone} />
        <Text f={1} col={tone} fos={fontSize.body} fow={fontWeight.medium} numberOfLines={1}>
          {label}
        </Text>
      </XStack>
    </Pressable>
  );
}
