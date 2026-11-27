import { memo, useCallback, useState } from 'react';
import { Pressable } from 'react-native';
import { LineIcon } from '@/components/icons/LineIcon';
import { ManageMenuDrawer } from '@/features/shell/ManageMenuDrawer';
import { Text, XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { CHAT_SIDE } from '@xeprime/types';
import { nowInAppTz } from '@xeprime/domain';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-authenticated-user';
import { ChatBadgeButton } from '@/features/chat/components/ChatBadgeButton';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { NOTIFICATION_CONTEXT } from '@/features/notifications/notification-display';
import { isCommissionOwner } from '@/features/shell/partner-track';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, space, typeScale } from '@/theme/tokens';
import { greetingKey } from '../dashboard-model';

/** Khe giữa hai nút vuông (Figma "Action Icons" `gap 12`). */
const ACTION_GAP = 12;

/**
 * Đầu màn Tổng quan app Partner — Figma Overview MB "Summary Header" (`24175:52347`), THAY thanh trên
 * chung (`ManageHeader`) ở màn này (người dùng chốt 20/11/2026):
 *
 *  - trái: lời chào HAI dòng 24/32 - "Chào buổi sáng," đậm vừa màu chữ chính, tên tài khoản đậm màu
 *    `text/gray/very-low`; không logo, không avatar (avatar ở ô Tài khoản của thanh dưới), không ngày;
 *  - phải: hai nút VUÔNG 42 bo 12 - Trò chuyện (hộp thư gian hàng) và Thông báo, giữ nguyên số đếm và
 *    đích như thanh trên chung.
 */
export const OverviewHeader = memo(function OverviewHeader() {
  const colors = useColors();
  const t = useTranslations('Dashboard');
  const tApp = useTranslations('Dashboard.partnerApp');
  const tMenu = useTranslations('MobileShell.manageMenu');
  const user = useAuthenticatedUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  // Figma "Chào buổi sáng, Bảo": chỉ TÊN GỌI - chữ cuối của họ tên (người dùng chốt 20/11/2026).
  const name = user.displayName?.trim().split(/\s+/).pop();
  const greeting = tApp(`greeting.${greetingKey(nowInAppTz())}`);

  return (
    /*
     * Figma "Summary Header" `24175:52347` (feedback thiết kế 20/11/2026): MỘT dòng - ☰ mở ngăn kéo
     * "Danh sách chức năng" · "Chào buổi …," xám 18/28 + tên gọi đậm · chat + chuông bên phải.
     */
    <XStack px={layout.screenX} pt={space.xl} jc="space-between" ai="center" gap={space.md}>
      <XStack f={1} minWidth={0} ai="center" gap={MENU_GAP}>
        <Pressable
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={tMenu('drawerTitle')}
          hitSlop={12}
        >
          {/* Icon Figma "Menu Hamburger" (#414651) - không dùng glyph Ionicons. */}
          <LineIcon name="menu-hamburger" size={MENU_ICON} color={colors.textMuted} />
        </Pressable>
        <Text f={1} numberOfLines={1} fos={typeScale.heading.fontSize} lh={typeScale.heading.lineHeight} accessibilityRole="header">
          {name ? (
            <>
              <Text col={colors.placeholder} fow={fontWeight.medium}>
                {`${greeting} `}
              </Text>
              <Text col={colors.text} fow={fontWeight.semibold}>
                {name}
              </Text>
            </>
          ) : (
            <Text col={colors.text} fow={fontWeight.semibold}>
              {t('title')}
            </Text>
          )}
        </Text>
      </XStack>
      <XStack ai="center" gap={ACTION_GAP} flexShrink={0}>
        {/* Đếm phía GIAN HÀNG như `ManageHeader` - lối vào hộp thư gian hàng. */}
        <ChatBadgeButton surface={CHAT_SIDE.SHOP} chip chipShape="square" />
        <NotificationBell
          context={isCommissionOwner(user) ? NOTIFICATION_CONTEXT.OWNER : NOTIFICATION_CONTEXT.MANAGE}
          chip
          chipShape="square"
        />
      </XStack>
      <ManageMenuDrawer open={menuOpen} onClose={closeMenu} />
    </XStack>
  );
});

/** Figma: ☰ 24, cách lời chào 8. */
const MENU_ICON = 24;
const MENU_GAP = 8;
