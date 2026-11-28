import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  BRANCH_STATUS,
  BRANCH_STATUS_META,
  toLocalVnPhone,
  type BranchStatus,
} from '@xeprime/types';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { ActionSheetButtons, type SheetAction } from '@/components/ui/ActionSheetButtons';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { BRANCH_ACTION, type Branch, type BranchAction } from '@/features/branches/api';
import type { BranchCardActionState } from '@/features/branches/components/BranchCard';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';

/** Thẻ chi nhánh (Figma `24231:113609` "Nhóm thông tin"): đệm 16, bo 16, các hàng cách 12. */
const CARD_PAD = 16;
const CARD_GAP = 12;
/** Viên "15 xe": nền `bg/gray-100`, bo 4, đệm 8/2. */
const COUNT_RADIUS = 4;
/** Vùng chạm của nút ⋮ (icon 20). */
const KEBAB_SLOP = 12;

type MenuKey = 'edit' | BranchAction;

/**
 * MỘT chi nhánh trong thẻ "Chi nhánh" của Quản lý gian hàng - Figma `24231:113609`:
 *
 *   Tên chi nhánh [Đang hoạt động]                       ⋮
 *   CN01 · Mặc định
 *   ◎ địa chỉ · Phường/Xã · Tỉnh/TP
 *   ☏ SĐT                                            [15 xe]
 *
 * Thao tác (Sửa · Ngừng/Bật lại · Đặt làm mặc định) gom vào tấm mở từ ⋮ (người dùng chốt
 * 26/11/2026) - cùng luật khoá như trước (`useBranchRowActions`), lý do khoá in trong tấm. Người
 * chỉ xem vẫn mở được tấm và thấy lý do "không có quyền quản lý", như web khoá kèm lý do.
 */
export function ShopBranchRow({
  branch,
  canManage,
  pendingAction,
  actionState,
  onEdit,
  onAction,
}: {
  branch: Branch;
  canManage: boolean;
  pendingAction: BranchAction | null;
  actionState: Readonly<Record<BranchAction, BranchCardActionState>>;
  onEdit: (branch: Branch) => void;
  onAction: (branch: Branch, action: BranchAction) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Branches');
  const tAddr = useTranslations('Address');
  const tActions = useTranslations('Common.actions');
  const tMenu = useTranslations('Bookings.detailPage.actions');
  const domainLabel = useDomainLabel();
  const [menuOpen, setMenuOpen] = useState(false);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const isActive = branch.status === BRANCH_STATUS.ACTIVE;
  const toggle: BranchAction = isActive ? BRANCH_ACTION.DEACTIVATE : BRANCH_ACTION.ACTIVATE;
  const meta = BRANCH_STATUS_META[branch.status as BranchStatus];
  const area = [branch.wardName, branch.provinceName].filter(Boolean).join(LIST_SEPARATOR);
  const addressLine = [branch.address, area].filter(Boolean).join(LIST_SEPARATOR);
  const busy = pendingAction !== null;
  const canSetDefault = !branch.isDefault;
  const locked = busy || !canManage;

  const reasons = canManage
    ? [...(canSetDefault ? [BRANCH_ACTION.SET_DEFAULT] : []), toggle]
        .filter((a) => !actionState[a].enabled)
        .map((a) => actionState[a].reason)
        .filter((r): r is string => Boolean(r))
    : [t('blocked.manage')];

  const menu: { key: MenuKey; icon: LineIconName; label: string; disabled: boolean; danger: boolean }[] = [
    { key: 'edit', icon: 'edit', label: tActions('edit'), disabled: locked, danger: false },
    {
      key: toggle,
      icon: isActive ? 'lock-1' : 'rotate-left',
      label: isActive ? t('actions.deactivate') : t('actions.activate'),
      disabled: locked || !actionState[toggle].enabled,
      danger: isActive,
    },
    ...(canSetDefault
      ? [
          {
            key: BRANCH_ACTION.SET_DEFAULT as MenuKey,
            icon: 'star' as const,
            label: t('actions.setDefault'),
            disabled: locked || !actionState[BRANCH_ACTION.SET_DEFAULT].enabled,
            danger: false,
          },
        ]
      : []),
  ];

  function runMenu(key: MenuKey) {
    setMenuOpen(false);
    if (key === 'edit') onEdit(branch);
    else onAction(branch, key);
  }

  /* Khuôn tấm "Thao tác" chung (Đơn thuê - `ActionSheetButtons`): nút phụ viền, nguy hiểm viền đỏ. */
  const sheetActions: SheetAction[] = menu.map((entry) => ({
    key: entry.key,
    label: entry.label,
    /* Không icon (người dùng chốt 27/11/2026); "Sửa" hẹp lại để "Ngừng hoạt động" không bị cắt "…". */
    grow: entry.key === 'edit' ? 1 : 2,
    danger: entry.danger,
    /* "Đặt làm mặc định" là nút CHÍNH: dải vàng trải hết hàng ở dưới cùng (khuôn Đơn thuê). */
    primary: entry.key === BRANCH_ACTION.SET_DEFAULT,
    disabled: entry.disabled,
    loading: pendingAction !== null && pendingAction === entry.key,
    onPress: () => runMenu(entry.key),
  }));

  const bodyText = {
    col: colors.slateText,
    fos: typeScale.body.fontSize,
    lh: typeScale.body.lineHeight,
  } as const;

  return (
    <YStack p={CARD_PAD} gap={CARD_GAP} br={radius.card} bw={1} bc={colors.border} bg={colors.surface}>
      <XStack ai="flex-start" gap={12}>
        <YStack f={1} minWidth={0} gap={4}>
          <XStack ai="center" gap={6}>
            <Text
              flexShrink={1}
              col={colors.text}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {branch.name}
            </Text>
            <Pill
              label={domainLabel('branchStatus', branch.status, meta.label)}
              tone={pillToneOfStatusColor(meta.color)}
            />
          </XStack>
          <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
            {branch.code}
            {branch.isDefault ? (
              <Text col={colors.brandLink} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
                {`${LIST_SEPARATOR}${t('labels.default')}`}
              </Text>
            ) : null}
          </Text>
        </YStack>
        <Pressable
          onPress={openMenu}
          accessibilityRole="button"
          accessibilityLabel={t('actions.menu', { name: branch.name })}
          hitSlop={KEBAB_SLOP}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <LineIcon name="menu-kebab" size={iconSize.lg} color={colors.textMuted} />
          )}
        </Pressable>
      </XStack>

      <XStack ai="flex-start" gap={space.sm}>
        <LineIcon name="location" size={iconSize.lg} color={colors.textPlaceholder} />
        {addressLine && branch.provinceCode ? (
          /* Cần soát địa chỉ: dòng địa chỉ chuyển cam + đuôi "· Cần soát địa chỉ" (người dùng chốt 27/11/2026). */
          <Text f={1} {...bodyText} {...(branch.needsLocationReview ? { col: colors.warningHigh } : {})}>
            {branch.needsLocationReview
              ? `${addressLine}${LIST_SEPARATOR}${tAddr('review.badge')}`
              : addressLine}
          </Text>
        ) : (
          <Text f={1} {...bodyText} col={colors.warningHigh}>
            {[branch.address, t('labels.noProvince')].filter(Boolean).join(LIST_SEPARATOR)}
          </Text>
        )}
      </XStack>

      <XStack ai="center" gap={space.sm}>
        <LineIcon name="calling" size={iconSize.lg} color={colors.textPlaceholder} />
        <Text f={1} {...bodyText} numberOfLines={1}>
          {branch.phone ? toLocalVnPhone(branch.phone) : ''}
        </Text>
        <YStack px={8} py={2} br={COUNT_RADIUS} bg={colors.surfaceMuted}>
          <Text
            col={colors.slateStrong}
            fos={typeScale.label.fontSize}
            lh={typeScale.label.lineHeight}
            fow={fontWeight.medium}
          >
            {t('labels.vehicles', { count: branch.vehicleCount })}
          </Text>
        </YStack>
      </XStack>


      <BottomSheet open={menuOpen} onClose={closeMenu} title={tMenu('menuTitle')} chrome="v2" headerDivider>
        <YStack gap={space.sm}>
          <ActionSheetButtons actions={sheetActions} />
          {reasons.map((reason) => (
            <Text
              key={reason}
              col={colors.placeholder}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fontStyle="italic"
            >
              {reason}
            </Text>
          ))}
        </YStack>
      </BottomSheet>
    </YStack>
  );
}
