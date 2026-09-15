import { Ionicons } from '@expo/vector-icons';
import { Fragment, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { useCurrentUser, useLogout } from '@/features/auth/hooks/use-auth';
import { APP_SCOPE } from '@/features/shell/app-scope';
import { useShellScope } from '@/features/shell/use-shell-scope';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, iconSize, sizing, space } from '@/theme/tokens';
import {
  NAV_TARGET,
  flattenAccountNav,
  matchAccountNavKey,
  resolveAccountNav,
  type AccountNavItem,
} from '../account-nav';

/** Bề rộng vạch trạng thái ở mép trái — luôn có chỗ, chỉ đổi màu (mục không nhảy ngang khi chọn). */
const RAIL_WIDTH = 3;

/**
 * Menu khu tài khoản — bản native của `AccountSidebar` bên web.
 *
 * Cùng MỘT cây dữ liệu (`resolveAccountNav`), khác cách bày: web có một cột 256px dính bên trái
 * cả khu, app thì menu là KHỐI ĐẦU TIÊN của màn Tài khoản và mỗi mục mở ra một màn riêng.
 *
 * Không bày thành dải pill cuộn ngang như bản web ≤900px: ở đó nhóm "Tài khoản" mất luôn tiêu đề
 * và bảy mục của chủ xe trôi khỏi màn hình. Danh sách dọc giữ được đúng hai thứ web dùng menu này
 * để nói — THỨ TỰ và PHÂN NHÓM.
 *
 * Mục đang mở vẫn được đánh dấu dù trên app nó là màn đang đứng: `/account` sáng "Tài khoản của
 * tôi", đúng như web. Một menu chỉ sai chỗ đứng còn tệ hơn menu không đánh dấu gì.
 *
 * "Đăng xuất" nằm ở CUỐI menu, y hệt web — không phải một nút riêng cuối trang. Nó dùng lại chuỗi
 * `Navigation.public.logout` (header chợ xe cũng dùng chuỗi đó); chép sang bó của tính năng là
 * tạo bản dịch thứ hai cho cùng một từ.
 */
export function AccountNav() {
  const t = useTranslations('Navigation');
  const tAccount = useTranslations('Account');
  const tCommon = useTranslations('Common.actions');
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const pathname = usePathname();
  const logout = useLogout();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const domainLabel = useDomainLabel();

  const groups = useMemo(() => resolveAccountNav(user), [user]);
  const activeKey = matchAccountNavKey(pathname ?? '', flattenAccountNav(groups));

  /*
   * Tên và VAI của thẻ người dùng — cùng thứ tự rơi về với `AccountSidebar` bên web.
   *
   * Vai gian hàng thắng vai nền tảng, và không có vai nào thì rơi về "Tài khoản XePrime" chứ
   * không để trống: một dòng rỗng dưới tên đọc ra như dữ liệu bị thiếu.
   */
  const userName = user?.displayName || user?.email || tAccount('profile.accountLabel');
  const roleKey = user?.tenant?.roleKey;
  const userRole = roleKey
    ? domainLabel('tenantRole', roleKey, roleKey)
    : user?.platformRole
      ? domainLabel('platformRole', user.platformRole, user.platformRole)
      : tAccount('profile.accountLabel');

  return (
    <>
      <Card padded={false}>
        <YStack accessibilityRole="menu" accessibilityLabel={t('account.menuLabel')} py={space.xs}>
          {groups.map((group, index) => (
            <Fragment key={group.key}>
              {index > 0 ? <Divider /> : null}
              {group.labelKey ? (
                <Text
                  col={colors.placeholder}
                  fos={fontSize.meta}
                  fow={fontWeight.semibold}
                  letterSpacing={0.8}
                  px={space.md}
                  pb={space.xs}
                >
                  {t(group.labelKey).toLocaleUpperCase()}
                </Text>
              ) : null}
              {group.items.map((item) => (
                <AccountNavRow key={item.key} item={item} active={item.key === activeKey} />
              ))}
            </Fragment>
          ))}

          <Divider />
          <Pressable
            onPress={() => setConfirmingLogout(true)}
            accessibilityRole="menuitem"
            accessibilityLabel={t('public.logout')}
            style={({ pressed }) => (pressed ? { backgroundColor: colors.dangerSurface } : null)}
          >
            <XStack
              ai="center"
              gap={space.sm}
              minHeight={sizing.touchTarget}
              px={space.md}
              py={space.xs}
              borderLeftWidth={RAIL_WIDTH}
              borderLeftColor="transparent"
            >
              <Ionicons name="log-out-outline" size={iconSize.md} color={colors.danger} />
              <Text f={1} col={colors.danger} fos={fontSize.body} fow={fontWeight.medium}>
                {t('public.logout')}
              </Text>
            </XStack>
          </Pressable>

          {/*
            Thẻ NGƯỜI DÙNG đóng menu lại, đúng chỗ web đặt nó (dưới "Đăng xuất" trong cột trái).
            Nó trả lời "tôi đang đăng nhập bằng tài khoản nào, với vai gì" — câu hỏi có thật khi
            một người vừa là khách thuê vừa là nhân viên của một gian hàng (ADR 0014).

            Cố ý KHÔNG hiện email/SĐT: chúng đã nằm ở thẻ hồ sơ ngay bên dưới, và lặp lại chúng
            trong menu chỉ làm dày thêm một khối vốn để điều hướng.
          */}
          {user ? (
            <>
              <Divider />
              <XStack
                ai="center"
                gap={space.sm}
                px={space.md}
                py={space.sm}
                accessibilityLabel={tAccount('sidebar.userCard')}
              >
                <Avatar name={userName} url={user.avatarUrl} size={40} />
                <YStack f={1} minWidth={0} gap={2}>
                  <Text
                    col={colors.text}
                    fos={fontSize.bodySm}
                    fow={fontWeight.semibold}
                    numberOfLines={1}
                  >
                    {userName}
                  </Text>
                  <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
                    {userRole}
                  </Text>
                </YStack>
              </XStack>
            </>
          ) : null}
        </YStack>
      </Card>

      {/* Đăng xuất là thao tác không hỏi lại được sau khi làm — hỏi trước, bằng hộp của app. */}
      <AlertDialog
        open={confirmingLogout}
        title={t('public.logout')}
        message={tAccount('logoutConfirm')}
        confirmLabel={t('public.logout')}
        cancelLabel={tCommon('cancel')}
        destructive
        loading={logout.isPending}
        onCancel={() => setConfirmingLogout(false)}
        onConfirm={() =>
          logout.mutate(undefined, {
            onSettled: () => router.replace(ROUTES.explore.home()),
          })
        }
      />
    </>
  );
}

function Divider() {
  return <YStack h={1} bg={colors.borderSubtle} my={space.xs} />;
}

function AccountNavRow({ item, active }: { item: AccountNavItem; active: boolean }) {
  const t = useTranslations('Navigation');
  const router = useRouter();
  const navigateOnce = useNavigateOnce();
  const { switchTo } = useShellScope();
  const label = t(item.labelKey);

  /**
   * Ba kiểu đích, ba cách mở — xem {@link NAV_TARGET}.
   *
   * Mục ĐANG mở thì không đi đâu cả: `replace` về chính màn đang đứng là một cú nháy không giải
   * thích được, và với `/account` nó còn tháo mất chế độ sửa hồ sơ đang dở.
   */
  const open = () => {
    if (active) return;
    switch (item.target) {
      case NAV_TARGET.TAB:
        router.replace(item.href);
        return;
      case NAV_TARGET.MANAGE:
        switchTo(APP_SCOPE.MANAGE, item.href);
        return;
      default:
        navigateOnce(item.href);
    }
  };

  return (
    <Pressable
      onPress={open}
      accessibilityRole="menuitem"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={({ pressed }) => (pressed ? { backgroundColor: colors.surfaceMuted } : null)}
    >
      <XStack
        ai="center"
        gap={space.sm}
        minHeight={sizing.touchTarget}
        px={space.md}
        py={space.xs}
        bg={active ? colors.surfaceSelected : 'transparent'}
        borderLeftWidth={RAIL_WIDTH}
        borderLeftColor={active ? colors.primary : 'transparent'}
      >
        <Ionicons
          name={item.icon}
          size={iconSize.md}
          color={active ? colors.primaryActive : colors.textMuted}
        />
        <Text
          f={1}
          col={active ? colors.primaryActive : colors.text}
          fos={fontSize.body}
          fow={active ? fontWeight.semibold : fontWeight.medium}
          numberOfLines={1}
        >
          {label}
        </Text>
        {/* Mục đang mở không có mũi tên: nó không dẫn đi đâu nữa. */}
        {active ? null : (
          <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.placeholder} />
        )}
      </XStack>
    </Pressable>
  );
}
