import { XP_TOKENS, toPx } from '@xeprime/ui';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { CHAT_SIDE } from '@xeprime/types';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { AppearanceToggleRow, LocaleToggleRow } from '@/components/layout/PreferenceToggleRows';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { CountBadge, HEADER_BADGE_MAX } from '@/components/ui/CountBadge';
import { useCurrentUser, useLogout } from '@/features/auth/hooks/use-auth';
import { useChatBadge } from '@/features/chat/hooks/use-chat';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { makeStyles, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

/* Khoảng trống lẻ của `MarketAccountMenu.module.css` — token web quy ra số, không gõ tay. */
const SPACE_2 = toPx(XP_TOKENS['space-2']);
const SPACE_6 = toPx(XP_TOKENS['space-6']);
const SPACE_12 = toPx(XP_TOKENS['space-12']);
/** `.row { min-height: 40px }`, icon 20 (`.rowIcon`). */
const ROW_MIN_HEIGHT = 40;
const ICON = 20;
/** `.identity .avatar` — `<Avatar size={40}>` của web. */
const IDENTITY_AVATAR = 40;

/**
 * Menu tài khoản của khách đã đăng nhập — bản native của `MarketAccountMenu` web (Figma "Homepage
 * - Dropdown" `20063:57521`). Web là dropdown dưới avatar; app mở cùng nội dung trong tấm trượt từ
 * đáy (khác biệt tương tác native duy nhất).
 *
 * Đổi giao diện + đổi ngôn ngữ có ở đây (như web) VÀ trong thẻ hồ sơ ở tab Tài khoản — người dùng
 * chốt 27/10/2026; hai nơi dùng chung `PreferenceToggleRows`. Thanh trên chỉ giữ tin nhắn, thông
 * báo và avatar.
 */
/** Chờ tấm trượt đóng hẳn (hoạt ảnh slide ~300ms) rồi mới đổi theme. */
const THEME_SWITCH_DELAY_MS = 350;

export function AccountMenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const t = useTranslations('Navigation.public');
  const navigateOnce = useNavigateOnce();
  const { data: user } = useCurrentUser();
  const chat = useChatBadge(CHAT_SIDE.CUSTOMER);
  const logout = useLogout();

  if (!user) return null;

  const go = (href: Href) => {
    onClose();
    navigateOnce(href);
  };
  // Email phân biệt hai tài khoản trùng tên (khách ↔ đối tác, ADR 0053); thiếu email thì SĐT.
  const contact = user.email ?? user.phone ?? t('accountSubtitle');

  return (
    <BottomSheet open={open} onClose={onClose} padded={false}>
      {/*
        Trên app, tấm trượt CHÍNH LÀ mặt menu: không dựng thêm vỏ xám `.menu` + mặt trắng có viền
        `.surface` như dropdown web — lồng hai lớp trông như một thẻ bọc trong thẻ (người dùng chốt
        27/10/2026). Giữ đúng nhóm, thứ tự, vạch chia giữa nhóm và cỡ/màu từng dòng.
      */}
      <YStack bg={colors.surface}>
        <YStack>
          {/* `.section` — đệm dọc 6, khe 2 giữa các dòng. */}
          <YStack py={SPACE_6} gap={SPACE_2}>
            {/* `.item` + `.identity` — nền `color-bg`, bo control, đệm sm, khe 12, chevron tertiary. */}
            <Item>
              <Pressable
                onPress={() => go(ROUTES.account.home())}
                accessibilityRole="link"
                accessibilityLabel={user.displayName}
                style={({ pressed }) => [styles.identity, pressed ? styles.pressed : null]}
              >
                <Avatar
                  name={user.displayName}
                  url={user.avatarUrl}
                  size={IDENTITY_AVATAR}
                  gradient
                />
                <YStack f={1} minWidth={0} gap={SPACE_2}>
                  {/* `.identityName` body 14 semibold `text`, cắt một dòng. */}
                  <Text
                    col={colors.text}
                    fos={fontSize.body}
                    fow={fontWeight.semibold}
                    numberOfLines={1}
                  >
                    {user.displayName}
                  </Text>
                  {/* `.identityContact` body-sm 12 `text-secondary`. */}
                  <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
                    {contact}
                  </Text>
                </YStack>
                <LineIcon name="chevron-right" size={ICON} color={colors.placeholder} />
              </Pressable>
            </Item>

            <LinkRow icon="car" label={t('trips')} onPress={() => go(ROUTES.booking.list())} />
            <LinkRow
              icon="heart"
              label={t('favorites')}
              onPress={() => go(ROUTES.account.favorites())}
            />
            <LinkRow
              icon="message"
              label={t('chat')}
              onPress={() => go(chat.href)}
              // `<Badge count overflowCount={99} size="small">` của web.
              trailing={chat.count > 0 ? <CountBadge count={chat.count} max={HEADER_BADGE_MAX} /> : null}
            />

            {/* Hàng "Giao diện" ☀|☾ — dùng chung với thẻ hồ sơ tab Tài khoản. */}
            <Item>
              <AppearanceToggleRow
                onBeforeChange={(apply) => {
                  // Đóng tấm trước, đổi theme khi tấm đã rời màn (Modal + đổi theme = màn trắng).
                  onClose();
                  setTimeout(apply, THEME_SWITCH_DELAY_MS);
                }}
              />
            </Item>
          </YStack>

          {/* `.section + .section` — viền trên `color-border`; lối sang site Partner (ADR 0051/0053). */}
          <YStack py={SPACE_6} gap={SPACE_2} borderTopWidth={1} borderTopColor={colors.border}>
            <LinkRow
              icon="work"
              label={t('becomeOwner')}
              onPress={() => go(ROUTES.listYourVehicle.root())}
              trailing={<LineIcon name="arrow-right" size={ICON} color={colors.placeholder} />}
            />
          </YStack>
        </YStack>

        {/* `.footer` — đệm trên xs, dưới 6, khe 2; vạch `color-border` ngăn với nhóm trên. */}
        <YStack
          pt={space.xs}
          pb={SPACE_6}
          gap={SPACE_2}
          borderTopWidth={1}
          borderTopColor={colors.border}
        >
          {/* Hàng "Ngôn ngữ" VI|EN — dùng chung với thẻ hồ sơ tab Tài khoản. */}
          <Item>
            <LocaleToggleRow />
          </Item>

          {/*
            `.logout` — căn giữa, đệm sm/14, chữ body 14 semibold `text-secondary`, icon cùng màu.
            Như web, đăng xuất ngay không hỏi lại; rời màn là việc của `SessionBoundary`.
          */}
          <Pressable
            onPress={() => {
              onClose();
              logout.mutate();
            }}
            disabled={logout.isPending}
            accessibilityRole="button"
            accessibilityLabel={t('logout')}
            style={({ pressed }) => [styles.logout, pressed ? styles.pressed : null]}
          >
            {/* Đăng xuất màu đỏ `color-error` (người dùng chốt 27/10/2026). */}
            <LineIcon name="logout" size={ICON} color={colors.danger} />
            <Text col={colors.danger} fos={fontSize.body} fow={fontWeight.semibold}>
              {t('logout')}
            </Text>
          </Pressable>
        </YStack>
      </YStack>
    </BottomSheet>
  );
}

/** `.item` — lề 6 hai bên của MỌI dòng, để vùng chạm không dính mép menu. */
function Item({ children }: { children: ReactNode }) {
  return <YStack px={SPACE_6}>{children}</YStack>;
}

/** Dòng LIÊN KẾT của menu (`row()` web): icon tertiary 20 · nhãn · phần đuôi (badge / mũi tên). */
function LinkRow({
  icon,
  label,
  onPress,
  trailing,
}: {
  icon: LineIconName;
  label: string;
  onPress: () => void;
  trailing?: ReactNode;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Item>
      <Pressable
        onPress={onPress}
        accessibilityRole="link"
        accessibilityLabel={label}
        style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
      >
        <LineIcon name={icon} size={ICON} color={colors.placeholder} />
        {/* `.rowLabel` — body 14 medium `text-secondary`, cắt một dòng. */}
        <Text
          f={1}
          minWidth={0}
          col={colors.textMuted}
          fos={fontSize.body}
          fow={fontWeight.medium}
          numberOfLines={1}
        >
          {label}
        </Text>
        {trailing}
      </Pressable>
    </Item>
  );
}

const useStyles = makeStyles((colors) => ({
  identity: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.control,
    flexDirection: 'row',
    gap: SPACE_12,
    padding: space.sm,
  },
  // `.row` — min-h 40, đệm sm/sm/sm/12, khe sm, bo `radius-sm`.
  row: {
    alignItems: 'center',
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: space.sm,
    minHeight: ROW_MIN_HEIGHT,
    paddingBottom: space.sm,
    paddingLeft: SPACE_12,
    paddingRight: space.sm,
    paddingTop: space.sm,
  },
  // `a.row:hover` — nền `bg-hover`; native là lúc chạm.
  rowPressed: { backgroundColor: colors.surfaceMuted },
  pressed: { opacity: 0.7 },
  logout: {
    alignItems: 'center',
    borderRadius: radius.control,
    flexDirection: 'row',
    gap: SPACE_6,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: space.sm,
  },
}));
