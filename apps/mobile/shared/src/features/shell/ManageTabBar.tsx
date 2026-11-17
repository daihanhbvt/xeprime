import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTabBarHidden } from '@/components/layout/tab-bar-visibility';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Avatar } from '@/components/ui/Avatar';
import { CountBadge } from '@/components/ui/CountBadge';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-authenticated-user';
import { withBranchParam } from '@/features/branches/branch-link';
import { useRememberedBranch } from '@/features/branches/branch-memory';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { haptics } from '@/lib/haptics';
import { ROUTES } from '@/navigation/routes';
import { FONT_FAMILY } from '@/theme/fonts';
import { SHEET_MAX_WIDTH } from '@/theme/layout';
import { useAppScheme, useColors } from '@/theme/ThemeProvider';
import { fontSize, radius, space } from '@/theme/tokens';
import { useResponsive } from '@/theme/use-responsive';
import {
  MANAGE_MENU_TAB,
  manageMenuTabsForTrack,
  type ManageMenuTab,
  type ManageMenuTabKey,
  type ManageNavLeaf,
} from './manage-nav';
import { drawnLeavesOf, leafActiveHref, type ResolvedSection } from './manage-menu';
import { ManageSectionSheet } from './ManageSectionSheet';
import { PartnerMenuIcon, type PartnerMenuIconName } from './PartnerMenuIcon';
import { useManageMenu } from './use-manage-menu';

/*
 * Số đo thanh menu — Figma Partner-XePrime `Menu MB` (`24175:37780`) + `_Menu item` (`24175:37769`).
 *
 *   ┌──────────────────────────────── viên trắng, bo tròn hết, đệm 4 ───────────────────────────────┐
 *   │ (◇)   (▭)   (⊞)   (＄)   ( ◉ Tài khoản )   ← ô đang chọn: nền vàng nhạt + nhãn 14 medium vàng │
 *   └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Ô: đệm 8 quanh icon 28 ⇒ 44×44, bo tròn hết; ô đang chọn ôm icon + khe 6 + nhãn.
 */
const BAR_PAD = space.xs;
const ITEM_SIZE = 44;
const ITEM_PAD = space.sm;
const ICON = 28;
const ITEM_GAP = 6;
const LABEL_LINE = 20;
/** Lề hai bên viên — Figma đặt viên ở x=16 trên khung 390. */
const BAR_SIDE = 16;
/** Khoảng trống quanh viên để bóng `elevation.raised` không bị khung cắt. */
const SHADOW_ROOM = 14;
const FIGMA_BAR_SHADOW = {
  boxShadow: '0px 0px 6px 0px rgba(10, 13, 18, 0.08), 0px 24px 24px 0px rgba(0, 0, 0, 0.1)',
} as const;
/** `Text/Brand/primary-2` — nhãn ô đang chọn. Token gần nhất (`color-primary` #e9ac29) là sắc icon. */
const FIGMA_ACTIVE_LABEL = '#f0b212';
/** Viền avatar ô Tài khoản (Figma `Avatar` border) — vàng sáng hơn mọi token gold. */
const FIGMA_AVATAR_RING = '#e9c336';
/** Trần số trên huy hiệu ô — như thanh tab app khách / web `overflowCount`. */
const TAB_BADGE_MAX = 9;

/** Viên vàng co/nở + đẩy ô bên cạnh — cùng nhịp với thanh tab app khách (người dùng chốt 28/10). */
const TAB_LAYOUT_TRANSITION = LinearTransition.duration(380).easing(Easing.inOut(Easing.cubic));

/** Icon của từng ô — Figma: Discovery 1 · Folder 2 · Category · Dollar Circle; ô Tài khoản là avatar. */
const TAB_ICON: Readonly<Record<Exclude<ManageMenuTabKey, 'account'>, PartnerMenuIconName>> = {
  [MANAGE_MENU_TAB.OVERVIEW]: 'tab-discovery',
  [MANAGE_MENU_TAB.OPERATIONS]: 'tab-folder',
  [MANAGE_MENU_TAB.FLEET]: 'tab-category',
  [MANAGE_MENU_TAB.REVENUE]: 'tab-dollar',
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: BAR_PAD,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ITEM_GAP,
    height: ITEM_SIZE,
    minWidth: ITEM_SIZE,
    padding: ITEM_PAD,
    // Nửa chiều cao, KHÔNG 999: Android vẽ góc vuông khi bán kính vượt nửa cạnh lúc layout animation chạy.
    borderRadius: ITEM_SIZE / 2,
    // KHÔNG `overflow: 'hidden'`: huy hiệu số ("9+") neo ở góc icon tràn ra ngoài ô và bị cắt mất.
  },
  icon: { width: ICON, height: ICON, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -space.xs, left: '60%' },
  avatarRing: {
    width: ICON,
    height: ICON,
    borderRadius: ICON / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  label: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: fontSize.body,
    lineHeight: LABEL_LINE,
    flexShrink: 1,
  },
  pressed: { transform: [{ scale: 0.92 }] },
});

interface VisibleTab {
  readonly tab: ManageMenuTab;
  /** Khối (đã lọc) mà ô gom — rỗng ở ô Tài khoản khi người dùng không thấy mục Cấu hình/Trợ giúp nào. */
  readonly sections: readonly ResolvedSection[];
  readonly badge: number;
  readonly urgent: boolean;
}

/**
 * Thanh menu dưới đáy app Partner — Figma `Menu MB`: năm ô theo KHỐI của cây menu (`manage-nav.ts`
 * `PARTNER_MENU_TABS`), thay drawer + bốn ô của bản trước.
 *
 * - **Tổng quan**: đi thẳng tới trang Tổng quan.
 * - **Vận hành · Xe & Tài xế · Doanh thu**: mở tấm danh sách mục của khối (`ManageSectionSheet`).
 *   Khối chỉ còn MỘT mục người dùng thấy (vd. Doanh thu của chủ xe cá nhân chỉ có Ví) thì đi thẳng —
 *   một tấm trượt chỉ có một dòng là thêm một cú chạm vô ích.
 * - **Tài khoản**: màn "Tài khoản của tôi" (`/manage/more`) — Cấu hình · Trợ giúp · Hệ thống.
 *
 * Ô ẩn khi khối của nó không còn mục nào người dùng được thấy (nhân viên ít quyền), cùng luật lọc
 * với mọi bề mặt menu (`resolveSections`). Huy hiệu "cần xử lý" của khối (đơn chờ, xe cần xử lý)
 * neo ở góc icon ô — đóng tấm lại vẫn còn dấu hiệu có việc.
 *
 * Ô sáng theo trang đang mở (`matchActiveHref`, mục ẩn quy về mục hiện); trang không thuộc khối nào
 * (Tin nhắn, hồ sơ đăng ký…) thì ô Tài khoản sáng — vai của ô "Thêm" cũ.
 *
 * Thanh nằm TRONG dòng chảy (không nổi đè nội dung như app khách): các màn quản lý dựng danh sách
 * riêng không đọc `TabBarInsetContext`, nổi đè là che mất dòng cuối. Nền khung = nền trang nên viên
 * vẫn đọc ra là viên nổi.
 */
export function ManageTabBar({ onHeight }: { onHeight?: (height: number) => void } = {}) {
  // Màn chi tiết mở NGAY TRONG tab (vd. chi tiết yêu cầu) xin che thanh - `useHideTabBar`.
  const hidden = useTabBarHidden();
  useEffect(() => {
    if (hidden) onHeight?.(0);
  }, [hidden, onHeight]);
  const colors = useColors();
  const { scheme } = useAppScheme();
  const t = useTranslations('Navigation');
  const tShell = useTranslations('ManageCommon.shell');
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const navigateOnce = useNavigateOnce();
  const rememberedBranch = useRememberedBranch();
  const { isTablet } = useResponsive();
  const user = useAuthenticatedUser();
  const { track, sections, activeHref } = useManageMenu();
  const [openSection, setOpenSection] = useState<ResolvedSection | null>(null);

  const tabs = useMemo<readonly VisibleTab[]>(
    () =>
      manageMenuTabsForTrack(track)
        .map((tab): VisibleTab => {
          const own = sections.filter(({ section }) => tab.sections.includes(section.key));
          return {
            tab,
            sections: own,
            badge: own.reduce((sum, section) => sum + section.badge, 0),
            urgent: own.some((section) => section.urgent),
          };
        })
        .filter(({ tab, sections: own }) => tab.href !== undefined || own.length > 0),
    [track, sections],
  );

  const activeKey = useMemo<ManageMenuTabKey | null>(() => {
    if (tabs.length === 0) return null;
    const owner = tabs.find(({ sections: own }) =>
      own.some(({ allLeaves }) => allLeaves.some((leaf) => leafActiveHref(leaf) === activeHref)),
    );
    if (owner) return owner.tab.key;
    // Trang ngoài các khối (Tài khoản & bảo mật, Tin nhắn, hồ sơ đăng ký…) thuộc về ô Tài khoản.
    return pathname === String(ROUTES.manage.home()) ? null : MANAGE_MENU_TAB.ACCOUNT;
  }, [tabs, activeHref, pathname]);

  const go = useCallback(
    (leaf: ManageNavLeaf) => {
      if (!leaf.href) return;
      navigateOnce(withBranchParam(leaf.href, rememberedBranch));
    },
    [navigateOnce, rememberedBranch],
  );

  const closeSheet = useCallback(() => setOpenSection(null), []);

  const onSelectFromSheet = useCallback(
    (leaf: ManageNavLeaf) => {
      setOpenSection(null);
      go(leaf);
    },
    [go],
  );

  const press = useCallback(
    ({ tab, sections: own }: VisibleTab) => {
      haptics.selection();
      if (tab.href) {
        navigateOnce(tab.href);
        return;
      }
      const section = own[0];
      if (!section) return;
      const leaves = drawnLeavesOf(section.nodes);
      if (leaves.length === 1 && leaves[0]) {
        go(leaves[0].leaf);
        return;
      }
      setOpenSection(section);
    },
    [go, navigateOnce],
  );

  if (tabs.length === 0) return null;

  const inactiveTint = scheme === 'dark' ? colors.textPlaceholder : colors.placeholder;
  const activeLabel = scheme === 'dark' ? colors.primary : FIGMA_ACTIVE_LABEL;

  return (
    /*
      NỔI đè nội dung như thanh tab app khách (người dùng 13/11/2026: nội dung bị cắt phẳng ngay trên
      thanh, bóng của viên bị che): khung trong suốt, nội dung cuộn xuống DƯỚI viên; màn chừa đúng
      chiều cao này qua `TabBarInsetContext`. `box-none` để chạm vào khe trống hai bên viên vẫn trúng
      nội dung bên dưới.
    */
    <>
      <YStack
        pos="absolute"
        left={0}
        right={0}
        bottom={0}
        pointerEvents="box-none"
        display={hidden ? 'none' : 'flex'}
        onLayout={(event) => {
          if (!hidden) onHeight?.(event.nativeEvent.layout.height);
        }}
        px={BAR_SIDE}
        // Đủ chỗ cho BÓNG của viên (toả ~12 quanh viên): đệm 8 cũ cắt mất phần bóng phía trên.
        pt={SHADOW_ROOM}
        // Đệm đáy theo máy (vạch home / thanh cử chỉ) với sàn, cộng chỗ cho bóng đổ xuống.
        pb={Math.max(insets.bottom, space.md) + SHADOW_ROOM}
      >
        <View
          accessibilityRole="tablist"
          style={[
            styles.bar,
            // Figma `Menu MB`: 0 0 6 rgba(10,13,18,.08) + 0 24 24 rgba(0,0,0,.1) - `elevation` của
            // Android gần như không đổ bóng mép trên nên viên hoà vào nội dung phía sau.
            scheme === 'dark' ? null : FIGMA_BAR_SHADOW,
            { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
            // iPad: viên có trần bề rộng và nằm giữa, như thanh tab app khách.
            isTablet ? { width: '100%', maxWidth: SHEET_MAX_WIDTH, alignSelf: 'center' } : null,
          ]}
        >
          {tabs.map((entry) => {
            const { tab, badge, urgent } = entry;
            const active = activeKey === tab.key;
            const label = t(tab.labelKey as never);
            const a11yLabel =
              badge > 0
                ? `${label}, ${
                    urgent
                      ? tShell('needsActionUrgent', { count: badge })
                      : tShell('needsAction', { count: badge })
                  }`
                : label;
            return (
              <TabButton
                key={tab.key}
                label={label}
                a11yLabel={a11yLabel}
                active={active}
                badge={badge}
                labelColor={activeLabel}
                activeBg={colors.primarySubtle}
                onPress={() => press(entry)}
              >
                {tab.key === MANAGE_MENU_TAB.ACCOUNT ? (
                  <View
                    style={[
                      styles.avatarRing,
                      { borderColor: FIGMA_AVATAR_RING, backgroundColor: colors.surface },
                    ]}
                  >
                    <Avatar name={user.displayName || '-'} url={user.avatarUrl ?? null} size={ICON - 2} />
                  </View>
                ) : (
                  <PartnerMenuIcon
                    name={TAB_ICON[tab.key]}
                    size={ICON}
                    color={active ? colors.primary : inactiveTint}
                  />
                )}
              </TabButton>
            );
          })}
        </View>
      </YStack>

      {/*
        Tấm danh sách mục của khối là ANH EM của thanh (không nằm trong khung đáy của nó) và vẽ TRONG
        CÂY (`presentation="overlay"`): nó phủ cả khung bộ tab - tới tận mép dưới màn hình, đè lên cả
        viên thanh tab. Cửa sổ `Modal` của Android dừng trên vùng thanh điều hướng nên trước đây để
        lộ nội dung trang + viên thanh tab dưới tấm (người dùng báo 13/11/2026).
      */}
      <ManageSectionSheet
        section={openSection}
        track={track}
        onClose={closeSheet}
        onSelect={onSelectFromSheet}
        activeHref={activeHref}
      />
    </>
  );
}

const TabButton = memo(function TabButton({
  label,
  a11yLabel,
  active,
  badge,
  labelColor,
  activeBg,
  onPress,
  children,
}: {
  label: string;
  a11yLabel: string;
  active: boolean;
  badge: number;
  labelColor: string;
  activeBg: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Animated.View layout={TAB_LAYOUT_TRANSITION}>
      <Pressable
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={a11yLabel}
        style={({ pressed }) => (pressed ? styles.pressed : null)}
      >
        {/* Ô đang chọn: icon + nhãn trong viên vàng nhạt; ô khác chỉ icon (Figma `_Menu item`). */}
        <Animated.View
          layout={TAB_LAYOUT_TRANSITION}
          style={[styles.item, active ? { backgroundColor: activeBg } : null]}
        >
          <View style={styles.icon}>
            {children}
            {badge > 0 ? (
              <View
                style={styles.badge}
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <CountBadge count={badge} tone="danger" size="sm" max={TAB_BADGE_MAX} />
              </View>
            ) : null}
          </View>
          {active ? (
            <Animated.Text
              entering={FadeIn.duration(320)}
              exiting={FadeOut.duration(120)}
              numberOfLines={1}
              style={[styles.label, { color: labelColor }]}
            >
              {label}
            </Animated.Text>
          ) : null}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
});
