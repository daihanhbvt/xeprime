import { memo, useCallback } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInLeft, SlideOutLeft } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LineIcon } from '@/components/icons/LineIcon';
import { withBranchParam } from '@/features/branches/branch-link';
import { useRememberedBranch } from '@/features/branches/branch-memory';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import type { ManageNavLeaf } from './manage-nav';
import { drawnLeavesOf, leafActiveHref } from './manage-menu';
import { ManageMenuRow, NeedsActionPill, menuLeafLook } from './ManageMenuRow';
import { useManageMenu } from './use-manage-menu';

/**
 * Ngăn kéo "Danh sách chức năng" - Figma Partner-XePrime "Menu MB" `24512:134819` (feedback thiết
 * kế 20/11/2026, dòng 15; người dùng chốt: mở từ ☰ ở Tổng quan, MỤC theo cây menu trong code).
 *
 * Mục, quyền, tuyến, số đếm đọc CÙNG nguồn với thanh tab (`useManageMenu`) - ngăn kéo chỉ là một
 * cách trình bày khác của cùng cây menu, không thêm/bớt đích nào. Khối "Tổng quan" bỏ (đang đứng ở
 * đó). Hàng dùng lại `ManageMenuRow` (ô icon màu · tên · mô tả · số đếm · mũi tên) như tấm của khối.
 */
export const ManageMenuDrawer = memo(function ManageMenuDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const t = useTranslations('Navigation');
  const tMenu = useTranslations('MobileShell.manageMenu');
  const tShell = useTranslations('ManageCommon.shell');
  const tActions = useTranslations('Common.actions');
  const navigateOnce = useNavigateOnce();
  const rememberedBranch = useRememberedBranch();
  const { track, sections, activeHref } = useManageMenu();

  const go = useCallback(
    (leaf: ManageNavLeaf) => {
      onClose();
      if (leaf.href) navigateOnce(withBranchParam(leaf.href, rememberedBranch));
    },
    [onClose, navigateOnce, rememberedBranch],
  );

  // Chữ riêng của ngăn kéo theo Figma (thanh tab giữ nhãn ngắn của cây menu).
  const drawerLabel = (key: string): string | null =>
    tMenu.has(`drawerLabels.${key}` as never) ? tMenu(`drawerLabels.${key}` as never) : null;

  const groups = sections.filter(({ section }) => section.key !== 'overview');

  return (
    // Phủ cả thanh điều hướng Android: ngăn kéo + nền tối kéo xuống tận đáy màn (feedback 20/11/2026).
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {open ? (
        <>
          <Animated.View entering={FadeIn} exiting={FadeOut} style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={tActions('close')} />
          </Animated.View>
          <Animated.View
            entering={SlideInLeft.duration(220)}
            exiting={SlideOutLeft.duration(180)}
            style={[styles.panel, { backgroundColor: colors.surface, paddingTop: insets.top }]}
          >
            {/* Đầu ngăn kéo: tiêu đề 18 semibold + ✕, vạch kẻ dưới (Figma). */}
            <XStack ai="center" jc="space-between" px={PAD} py={space.md} bbw={1} bbc={colors.borderSubtle}>
              <Text col={colors.text} fos={typeScale.heading.fontSize} lh={typeScale.heading.lineHeight} fow={fontWeight.semibold} accessibilityRole="header">
                {tMenu('drawerTitle')}
              </Text>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={tActions('close')} hitSlop={12}>
                <LineIcon name="close" size={24} color={colors.textMuted} />
              </Pressable>
            </XStack>
            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.lg }}>
              {groups.map(({ section, nodes }) => {
                const leaves = drawnLeavesOf(nodes);
                return (
                  <YStack key={section.key} px={PAD} pt={space.md}>
                    {/* Tên nhóm VIẾT HOA 12 semibold mờ ("VẬN HÀNH"). */}
                    <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} fow={fontWeight.semibold} textTransform="uppercase">
                      {drawerLabel(section.key) ?? t(section.labelKey as never)}
                    </Text>
                    {leaves.map(({ leaf, badge, urgent }, index) => {
                      const look = menuLeafLook(leaf, track);
                      const title = drawerLabel(leaf.key) ?? t(leaf.labelKey as never);
                      return (
                        <ManageMenuRow
                          key={leaf.key}
                          icon={look.icon}
                          tone={look.tone}
                          title={title}
                          description={look.description ? tMenu(`descriptions.${look.description}`) : null}
                          trailing={badge > 0 ? <NeedsActionPill count={badge} flat /> : null}
                          a11yLabel={
                            badge > 0
                              ? `${title}, ${urgent ? tShell('needsActionUrgent', { count: badge }) : tShell('needsAction', { count: badge })}`
                              : title
                          }
                          last={index === leaves.length - 1}
                          active={activeHref !== null && leafActiveHref(leaf) === activeHref}
                          onPress={() => go(leaf)}
                        />
                      );
                    })}
                  </YStack>
                );
              })}
            </ScrollView>
          </Animated.View>
        </>
      ) : null}
    </Modal>
  );
});

/** Figma: ngăn kéo rộng 361/390 (~93%), bo phải 16, lề trong 16. */
const PAD = 16;
const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '92.5%',
    borderTopRightRadius: radius.card,
    borderBottomRightRadius: radius.card,
    overflow: 'hidden',
  },
});
