import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { CHAT_SIDE } from '@xeprime/types';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LineIcon } from '@/components/icons/LineIcon';
import { HEADER_CHIP_SIZE } from '@/components/layout/HeaderChip';
import { Avatar } from '@/components/ui/Avatar';
import { useAppScheme, useColors } from '@/theme/ThemeProvider';
import { ManageAccountSheet } from './ManageAccountSheet';
import { AppHeader } from '@/components/layout/AppHeader';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-authenticated-user';
import { ChatBadgeButton } from '@/features/chat/components/ChatBadgeButton';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { NOTIFICATION_CONTEXT } from '@/features/notifications/notification-display';
import { space } from '@/theme/tokens';
import { layout } from '@/theme/layout';
import { ManageShellNotices } from './ManageShellNotices';
import { isCommissionOwner } from './partner-track';
import { useAccountMenuBack } from './account-menu-origin';

/** Logo thanh gốc - bằng `AppTopBar` của app khách. */
const BRAND_LOGO = 30;

/**
 * Thanh trên site partner ở khổ điện thoại (Figma Partner-XePrime `Header MB` `24175:59922`):
 *
 *   logo XePrime ······································ tin nhắn · thông báo
 *
 * - Không còn nút mở menu và ảnh đại diện: cả cây menu nằm ở thanh menu dưới đáy (`ManageTabBar`),
 *   menu hồ sơ (tài khoản & bảo mật, giao diện, ngôn ngữ, đăng xuất) là màn "Tài khoản của tôi" của
 *   ô Tài khoản (`ManageAccountMenuScreen`).
 * - Tin nhắn là ICON ở đây, không phải mục menu (§2.1 "Trò chuyện → icon tin nhắn ở header"); tin
 *   nhắn và thông báo là `HeaderChip` (vòng 40 viền + bóng), như `HeaderActions` app khách.
 * - Tiêu đề TRANG không nằm ở đây mà ở `ManagePageTitle` trong nội dung — cùng cách web dựng.
 */
/**
 * `title`: tên trang, chỉ dùng ở dáng trang chi tiết (mở từ "Tài khoản của tôi"); thanh chung không
 * vẽ tiêu đề - trang tự có tiêu đề lớn của nó.
 */
export function ManageHeader({
  title,
  subtitle,
  right,
}: { title?: string; subtitle?: string; right?: ReactNode } = {}) {
  const user = useAuthenticatedUser();
  const colors = useColors();
  const { scheme } = useAppScheme();
  const t = useTranslations('ManageCommon.shell');
  const [menuOpen, setMenuOpen] = useState(false);

  /*
   * Mở từ "Tài khoản của tôi" (`?from=account`) ⇒ thanh trên dáng TRANG CHI TIẾT: nút lui về đó +
   * tên trang, KHÔNG logo / chat / chuông / avatar / dải thông báo chung (người dùng chốt
   * 19/11/2026). Mở từ chỗ khác ⇒ thanh chung như cũ. Xem `account-menu-origin.ts`.
   */
  const { fromAccount, back } = useAccountMenuBack();
  if (fromAccount) {
    return (
      <AppHeader
        onBack={back}
        {...(title ? { title } : {})}
        {...(subtitle ? { subtitle } : {})}
        {...(right ? { right } : {})}
      />
    );
  }

  return (
    <>
      <AppHeader
        brandLogoHeight={BRAND_LOGO}
        // Không còn nút menu / ảnh đại diện ở hai mép: logo và nút thông báo theo lề trang.
        edgeInset={layout.screenX}
        right={
          <XStack ai="center" gap={space.xs}>
            {/*
              Đếm phía GIAN HÀNG — cùng `side` với `ChatMenu` web (`CHAT_SIDE.SHOP`); đây là lối vào
              DUY NHẤT của hộp thư gian hàng.
            */}
            <ChatBadgeButton surface={CHAT_SIDE.SHOP} chip />
            <NotificationBell
              context={
                isCommissionOwner(user) ? NOTIFICATION_CONTEXT.OWNER : NOTIFICATION_CONTEXT.MANAGE
              }
              chip
            />
            {/*
              Avatar + mũi tên mở MENU TÀI KHOẢN như thanh trên app khách (`HeaderActions`) - người
              dùng yêu cầu thêm 13/11/2026 dù Figma `Header MB` không có.
            */}
            <Pressable
              onPress={() => setMenuOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('accountMenu')}
              accessibilityState={{ expanded: menuOpen }}
              hitSlop={space.xs}
              style={({ pressed }) => [styles.avatarTrigger, pressed ? styles.pressed : null]}
            >
              <Avatar
                name={user.displayName || user.email || '-'}
                url={user.avatarUrl ?? null}
                size={HEADER_CHIP_SIZE}
                gradient
              />
              <YStack style={menuOpen ? null : styles.caret}>
                <LineIcon
                  name="caret-up"
                  size={CARET_SIZE}
                  color={scheme === 'dark' ? colors.primary : colors.primaryStrong}
                />
              </YStack>
            </Pressable>
          </XStack>
        }
      />
      <ManageAccountSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
      <ManageShellNotices />
    </>
  );
}

/** Mũi tên cạnh avatar - cùng cỡ `HeaderActions` app khách. */
const CARET_SIZE = 12;

const styles = StyleSheet.create({
  avatarTrigger: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    height: HEADER_CHIP_SIZE,
    paddingLeft: 2,
  },
  caret: { transform: [{ rotate: '180deg' }] },
  pressed: { opacity: 0.7 },
});
