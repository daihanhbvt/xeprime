import { Ionicons } from '@expo/vector-icons';
import { CHAT_SIDE } from '@xeprime/types';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { AccountMenuSheet } from '@/components/layout/AccountMenuSheet';
import { HEADER_CHIP_SIZE } from '@/components/layout/HeaderChip';
import { LineIcon } from '@/components/icons/LineIcon';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Avatar } from '@/components/ui/Avatar';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { ChatBadgeButton } from '@/features/chat/components/ChatBadgeButton';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { NOTIFICATION_CONTEXT } from '@/features/notifications/notification-display';
import { ROUTES } from '@/navigation/routes';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { makeStyles, useAppScheme, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

/** Avatar 32 + mũi tên nét 16 (`caret-up`) — `.trigger` của `MarketAccountMenu` web. */
/** Avatar bằng chip Tin nhắn/Thông báo (40) — người dùng chốt 27/10: avatar 32 trông nhỏ hơn hai chip cạnh nó. */
const AVATAR_SIZE = HEADER_CHIP_SIZE;
const CARET_SIZE = 16;

/**
 * Khu bên phải thanh trên của khu KHÁCH — bản native của `.right` trong `MarketHeader` web ở bề
 * ngang điện thoại (≤640px):
 *
 *   - đã đăng nhập: [tin nhắn] [thông báo] [avatar 32 ⌄] — avatar MỞ MENU TÀI KHOẢN
 *     (`AccountMenuSheet` = `MarketAccountMenu` web). Đổi giao diện, đổi ngôn ngữ và "Trở thành
 *     chủ xe" nằm TRONG menu đó, không trên thanh (web #223, người dùng chốt 27/10/2026).
 *   - khách chưa đăng nhập: [sáng/tối] [Đăng nhập] — giữ nút đặc của app (người dùng chốt); ngôn ngữ của khách đổi ở
 *     chân trang chủ (VI | EN), không có nút "⋯" nào. Nút "Trở thành chủ xe" web ẩn ở ≤1024px.
 */
export function HeaderActions() {
  const colors = useColors();
  const styles = useStyles();
  const t = useTranslations('Navigation.public');
  const navigateOnce = useNavigateOnce();
  const { data: user } = useCurrentUser();
  const { scheme } = useAppScheme();
  const [menuOpen, setMenuOpen] = useState(false);

  if (user) {
    return (
      <XStack ai="center" gap={space.xs}>
        {/* Web: `ChatMenu` + `NotificationBell` đứng NGOÀI menu tài khoản — hai thứ liếc hằng ngày. */}
        <ChatBadgeButton surface={CHAT_SIDE.CUSTOMER} chip />
        {/* Tài khoản khách không có gian hàng (ADR 0053) — chuông luôn là bề mặt khách. */}
        <NotificationBell context={NOTIFICATION_CONTEXT.CUSTOMER} chip />
        {/* `.trigger` — avatar + mũi tên, đệm 2, khe 2; mở menu tài khoản. */}
        <Pressable
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('account')}
          accessibilityState={{ expanded: menuOpen }}
          hitSlop={space.xs}
          style={({ pressed }) => [styles.avatarTrigger, pressed ? styles.pressed : null]}
        >
          {/* Web `.trigger .triggerAvatar`: chữ cái trên dải primary → gold-deep, đậm bold. */}
          <Avatar name={user.displayName} url={user.avatarUrl} size={AVATAR_SIZE} gradient />
          {/*
            Web `.caret`: vàng đậm (`primary-strong`), giao diện tối là vàng chính. Đóng thì quay
            xuống (xoay 180°), mở thì hướng LÊN như Figma (`.triggerOpen .caret`).
          */}
          <YStack style={menuOpen ? null : styles.caret}>
            <LineIcon
              name="caret-up"
              size={CARET_SIZE}
              color={scheme === 'dark' ? colors.primary : colors.primaryStrong}
            />
          </YStack>
        </Pressable>
        <AccountMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
      </XStack>
    );
  }

  return (
    <XStack ai="center" gap={space.sm}>
      {/* `.themeToggle` — khách chưa đăng nhập không có menu tài khoản nên nút nằm trên thanh. */}
      <ThemeToggle />
      {/*
        Nút "Đăng nhập" đặc vàng của app — người dùng chốt 27/10/2026 GIỮ kiểu này, không đổi sang
        cụm "Đăng nhập/Đăng ký" chữ vàng của web (`.login`).
      */}
      <Pressable
        onPress={() => navigateOnce(ROUTES.account.login())}
        accessibilityRole="button"
        accessibilityLabel={t('login')}
        hitSlop={space.xs}
        style={({ pressed }) => (pressed ? styles.pressed : null)}
      >
        <XStack
          ai="center"
          gap={space.xs}
          bg={colors.primary}
          br={radius.pill}
          px={space.md}
          minHeight={HEADER_CHIP_SIZE}
        >
          <Ionicons name="person-circle-outline" size={18} color={colors.onPrimary} />
          <Text col={colors.onPrimary} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {t('login')}
          </Text>
        </XStack>
      </Pressable>
    </XStack>
  );
}

const useStyles = makeStyles(() => ({
  avatarTrigger: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    height: HEADER_CHIP_SIZE,
    paddingLeft: 2,
  },
  caret: { transform: [{ rotate: '180deg' }] },
  pressed: { opacity: 0.7 },
}));
