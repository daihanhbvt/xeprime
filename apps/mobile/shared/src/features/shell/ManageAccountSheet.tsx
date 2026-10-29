import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { Href } from 'expo-router';
import { PreferenceRows } from '@/components/layout/PreferenceRows';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { AccountTrackBadge } from '@/features/account/components/AccountTrackBadge';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
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
 * Giao diện sáng/tối + NGÔN NGỮ (`PreferenceRows`, dùng chung với tab Tài khoản app khách) đi kèm ở cuối: nó vốn nằm ở ngăn "Thêm", mà ngăn đó chỉ còn mỗi nó (đổi khu đã
 * có nút riêng trên thanh trên). Gom vào đây thì mọi thứ thuộc về CON NGƯỜI đang đăng nhập nằm
 * chung một chỗ, thay vì rải ra hai màn.
 */
export function ManageAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const colors = useColors();
  const t = useTranslations('ManageCommon.shell');
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
          {user ? (
            <XStack
              ai="center"
              gap={space.sm}
              mx={space.md}
              mb={space.sm}
              p={space.md}
              br={radius.md}
              bg={colors.primaryLight}
            >
              <Avatar
                name={user.displayName || user.email || ''}
                url={user.avatarUrl}
                size={AVATAR_SIZE}
              />
              <YStack f={1} minWidth={0} gap={2}>
                <Text
                  col={colors.text}
                  fos={fontSize.body}
                  fow={fontWeight.semibold}
                  numberOfLines={1}
                >
                  {user.displayName || user.email}
                </Text>
                {user.email || user.phone ? (
                  <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
                    {user.email || user.phone}
                  </Text>
                ) : null}
                {user.tenant ? (
                  <XStack pt={2}>
                    <AccountTrackBadge tenant={user.tenant} size="sm" />
                  </XStack>
                ) : null}
              </YStack>
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

          <PreferenceRows />

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

const AVATAR_SIZE = 48;
const ICON_DOT = 32;

/** Ô tròn vàng nhạt bọc biểu tượng — cùng ngôn ngữ màu của app (primary). */
function IconDot({ icon, tone: toneProp }: { icon: IconName; tone?: string }) {
  const colors = useColors();
  const tone = toneProp ?? colors.primaryActive;
  return (
    <YStack
      w={ICON_DOT}
      h={ICON_DOT}
      br={radius.pill}
      bg={colors.primaryLight}
      ai="center"
      jc="center"
    >
      <Ionicons name={icon} size={iconSize.sm} color={tone} />
    </YStack>
  );
}

function Divider() {
  const colors = useColors();
  return <YStack h={1} bg={colors.borderSubtle} my={space.xs} />;
}

function MenuRow({
  icon,
  label,
  tone: toneProp,
  onPress,
}: {
  icon: IconName;
  label: string;
  tone?: string;
  onPress: () => void;
}) {
  const colors = useColors();
  const tone = toneProp ?? colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      style={({ pressed }) => (pressed ? { backgroundColor: colors.surfaceMuted } : null)}
    >
      <XStack ai="center" gap={space.sm} minHeight={sizing.touchTarget} px={space.md}>
        <IconDot icon={icon} />
        <Text f={1} col={tone} fos={fontSize.body} fow={fontWeight.medium} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.placeholder} />
      </XStack>
    </Pressable>
  );
}
