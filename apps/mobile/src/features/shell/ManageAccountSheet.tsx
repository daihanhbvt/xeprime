import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { CUSTOMER_TRIP_FILTER, TENANT_ROLE, TRIP_ROLE } from '@xeprime/types';
import type { Href } from 'expo-router';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { AccountTrackBadge } from '@/features/account/components/AccountTrackBadge';
import { useTripsInfinite } from '@/features/trips/hooks/use-trips';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, iconSize, sizing, space } from '@/theme/tokens';
import type { IconName } from '@/components/ui/Chip';
import { LogoutRow } from './LogoutRow';
import { useManageDrawer } from './ManageDrawerHost';

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

  /* Cài đặt gian hàng là của CHỦ — cùng điều kiện web đặt trên mục tương ứng. */
  const isShopOwner = user?.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER;

  /*
   * Chuyến ĐI THUÊ chưa khép của chính người này — quyết định mục "Chuyến tôi đi thuê" có mặt hay
   * không, CÙNG vị từ với dropdown `ManageUserCard` bên web.
   *
   * Nó là dấu vết của một lần CHUYỂN TUYẾN chứ không phải chức năng thường trực: người nâng từ
   * tuyến hoa hồng lên gói có thể còn chuyến chưa xong. Gian hàng chưa bao giờ đi thuê thì mục
   * này không bao giờ xuất hiện.
   *
   * Chỉ hỏi khi tấm trượt ĐANG mở và người dùng đứng trong một gian hàng: nhân sự nền tảng không
   * bao giờ có chuyến để đếm, và tấm đóng thì không ai đọc con số này.
   */
  const trips = useTripsInfinite(
    CUSTOMER_TRIP_FILTER.CURRENT,
    TRIP_ROLE.RENTER,
    open && Boolean(user?.tenant),
  );
  const hasOpenRenterTrips = (trips.data?.pages[0]?.counts.current ?? 0) > 0;

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
            label={t('security')}
            onPress={() => go(ROUTES.manage.account())}
          />
          {isShopOwner ? (
            <MenuRow
              icon="storefront-outline"
              label={t('shopSettings')}
              onPress={() => go(ROUTES.manage.shop())}
            />
          ) : null}
          {hasOpenRenterTrips ? (
            <MenuRow
              icon="car-outline"
              label={t('renterTrips')}
              onPress={() => go(ROUTES.manage.accountTrips())}
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
