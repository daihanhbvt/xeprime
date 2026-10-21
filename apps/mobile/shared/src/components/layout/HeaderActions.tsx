import { Ionicons } from '@expo/vector-icons';
import { CHAT_SIDE } from '@xeprime/types';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { HEADER_CHIP_SIZE, HeaderChip } from '@/components/layout/HeaderChip';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Avatar } from '@/components/ui/Avatar';
import { PreferenceRows } from '@/components/layout/PreferenceRows';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { ChatBadgeButton } from '@/features/chat/components/ChatBadgeButton';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { NOTIFICATION_CONTEXT } from '@/features/notifications/notification-display';
import { ROUTES } from '@/navigation/routes';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { makeStyles, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

/** Avatar nhỏ hơn vòng chip 40dp một chút để cùng tầm mắt (web: 34px + mũi tên ⌄ 10px). */
const AVATAR_SIZE = 32;
const CARET_SIZE = 10;

/**
 * Khu bên phải thanh trên của khu KHÁCH — xếp theo kiểu native, KHÔNG chép nguyên `MarketHeader`
 * của web (desktop dư chỗ cho năm nút; màn 360dp thì không):
 *
 *   - đã đăng nhập: [sáng/tối] [tin nhắn] [thông báo] [avatar 32dp ⌄] — ba chip tròn 40dp
 *     (`HeaderChip`, vùng chạm 48dp) + avatar, như `MarketHeader` web. Ngôn ngữ ít đổi nên nằm trong tab Tài khoản (`PreferenceRows`).
 *   - khách chưa đăng nhập: [sáng/tối] [⋯] [Đăng nhập] — "⋯" mở tấm trượt chọn ngôn ngữ, vì khách
 *     chưa có màn tài khoản nào để chứa công tắc đó.
 *
 * Biểu tượng tin nhắn KHÔNG thừa dù đã có tab "Tin nhắn": nó đếm TỔNG cả hai vai và dẫn tới hộp
 * thư thật sự có tin. Tab chỉ mở được hộp thư khách.
 */
export function HeaderActions() {
  const colors = useColors();
  const styles = useStyles();
  const t = useTranslations('Navigation.public');
  const tCommon = useTranslations('Common.locale');
  const navigateOnce = useNavigateOnce();
  const { data: user } = useCurrentUser();
  const [prefsOpen, setPrefsOpen] = useState(false);

  if (user) {
    return (
      <XStack ai="center" gap={space.xs}>
        <ThemeToggle />
        <ChatBadgeButton surface={CHAT_SIDE.CUSTOMER} chip />
        {/* Tài khoản khách không có gian hàng (ADR 0053) — chuông luôn là bề mặt khách. */}
        <NotificationBell context={NOTIFICATION_CONTEXT.CUSTOMER} chip />
        <Pressable
          onPress={() => navigateOnce(ROUTES.account.home())}
          accessibilityRole="button"
          accessibilityLabel={t('account')}
          hitSlop={space.xs}
          style={({ pressed }) => [styles.avatarTrigger, pressed ? styles.pressed : null]}
        >
          <Avatar name={user.displayName} url={user.avatarUrl} size={AVATAR_SIZE} />
          <Ionicons name="chevron-down" size={CARET_SIZE} color={colors.placeholder} />
        </Pressable>
      </XStack>
    );
  }

  return (
    <XStack ai="center" gap={space.xs}>
      <ThemeToggle />
      <HeaderChip
        icon="ellipsis-horizontal"
        onPress={() => setPrefsOpen(true)}
        accessibilityLabel={t('moreOptions')}
      />

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

      <BottomSheet
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        title={tCommon('switchLabel')}
        padded={false}
      >
        <PreferenceRows theme={false} />
      </BottomSheet>
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
  pressed: { opacity: 0.7 },
}));
