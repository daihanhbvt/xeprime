import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  BRANCH_STATUS,
  BRANCH_STATUS_META,
  toLocalVnPhone,
  type BranchStatus,
} from '@xeprime/types';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { FactRow } from '@/components/ui/FactRow';
import { IconButton } from '@/components/ui/IconButton';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { BRANCH_ACTION, type Branch, type BranchAction } from '@/features/branches/api';
import type { BranchCardActionState } from '@/features/branches/components/BranchCard';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space, typeScale } from '@/theme/tokens';

/** Dọc mỗi hàng 12 - hàng PHẲNG trong thẻ "Chi nhánh", ngăn bằng vạch mảnh. */
const ROW_PAD_Y = 12;

/**
 * MỘT chi nhánh trong thẻ "Chi nhánh" của trang Thông tin cửa hàng - nội dung theo thẻ điện thoại
 * của `BranchesView` web (`renderCard`): tên · viên Mặc định · viên trạng thái; mã; "Phường · Tỉnh"
 * (hoặc viên "Chưa có tỉnh/thành"); viên "Cần soát địa chỉ"; địa chỉ; số xe · SĐT; lý do khoá; rồi
 * thao tác Sửa · Ngừng/Bật lại · "…" (Đặt làm mặc định).
 *
 * Hàng PHẲNG, không khung thẻ lồng và không vạch màu mép trái: nó đứng TRONG một thẻ đã có viền,
 * nên khung thứ hai chỉ ăn mất bề ngang (người dùng báo 10/11/2026). Màn danh sách Chi nhánh riêng
 * vẫn dùng `BranchCard`.
 */
export function ShopBranchRow({
  branch,
  first,
  canManage,
  pendingAction,
  actionState,
  onEdit,
  onAction,
}: {
  branch: Branch;
  first: boolean;
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
  const domainLabel = useDomainLabel();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = branch.status === BRANCH_STATUS.ACTIVE;
  const toggle: BranchAction = isActive ? BRANCH_ACTION.DEACTIVATE : BRANCH_ACTION.ACTIVATE;
  const meta = BRANCH_STATUS_META[branch.status as BranchStatus];
  const area = [branch.wardName, branch.provinceName].filter(Boolean).join(LIST_SEPARATOR);
  const facts = [
    t('labels.vehicles', { count: branch.vehicleCount }),
    branch.phone ? toLocalVnPhone(branch.phone) : null,
  ]
    .filter(Boolean)
    .join(LIST_SEPARATOR);
  const busy = pendingAction !== null;
  const canSetDefault = !branch.isDefault;

  /*
   * Web (`BranchesView.actionsOf`) vẫn HIỆN thao tác cho người chỉ có `branches.view` - khoá kèm lý
   * do "không có quyền quản lý". Trên điện thoại không có tooltip nên lý do in ngay dưới hàng.
   */
  const reasons = canManage
    ? [...(canSetDefault ? [BRANCH_ACTION.SET_DEFAULT] : []), toggle]
        .filter((a) => !actionState[a].enabled)
        .map((a) => actionState[a].reason)
        .filter((r): r is string => Boolean(r))
    : [t('blocked.manage')];
  const locked = busy || !canManage;

  return (
    // Hàng chi nhánh theo khuôn thẻ danh sách chuẩn: tên + viên, FactRow, nút vàng (người dùng 17/11/2026).
    <YStack
      py={ROW_PAD_Y}
      gap={space.sm}
      borderTopWidth={first ? 0 : 1}
      borderTopColor={colors.borderSubtle}
    >
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.semibold} flexShrink={1} numberOfLines={1}>
          {branch.name}
        </Text>
        <XStack ai="center" gap={space.xs}>
          {branch.isDefault ? <Pill label={t('labels.default')} tone="brand" /> : null}
          <Pill
            label={domainLabel('branchStatus', branch.status, meta.label)}
            tone={pillToneOfStatusColor(meta.color)}
          />
        </XStack>
      </XStack>
      <FactRow label={t('labels.code')}>{branch.code}</FactRow>
      <FactRow label={t('labels.area')}>{area || t('labels.noProvince')}</FactRow>
      {branch.address ? <FactRow label={t('labels.address')}>{branch.address}</FactRow> : null}
      <FactRow label={t('labels.vehiclesTitle')}>{facts}</FactRow>
      {branch.needsLocationReview ? (
        <XStack>
          <Pill label={tAddr('review.badge')} tone="warning" />
        </XStack>
      ) : null}
      {reasons.map((reason) => (
        <Text key={reason} col={colors.placeholder} fos={fontSize.label} fontStyle="italic">
          {reason}
        </Text>
      ))}

      <XStack gap={space.sm} pt={space.xs}>
        <YStack flexGrow={1} flexShrink={1} flexBasis="auto" minWidth={0}>
          <Button
            label={tActions('edit')}
            icon="create-outline"
            variant="gradient"
            size="compact"
            disabled={locked}
            onPress={() => onEdit(branch)}
          />
        </YStack>
        <YStack flexGrow={1} flexShrink={1} flexBasis="auto" minWidth={0}>
          <Button
            label={isActive ? t('actions.deactivate') : t('actions.activate')}
            icon={isActive ? 'pause-circle-outline' : 'play-circle-outline'}
            variant={isActive ? 'dangerOutline' : 'gradient'}
            size="compact"
            loading={pendingAction === toggle}
            disabled={locked || !actionState[toggle].enabled}
            onPress={() => onAction(branch, toggle)}
          />
        </YStack>
        {canSetDefault ? (
          <IconButton
            icon="ellipsis-horizontal"
            label={t('actions.setDefault')}
            disabled={locked}
            compact
            onPress={() => setMenuOpen(true)}
          />
        ) : null}
      </XStack>

      {canSetDefault ? (
        <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={branch.name}>
          <Button
            label={t('actions.setDefault')}
            icon="checkmark-circle-outline"
            variant="gradient"
            loading={pendingAction === BRANCH_ACTION.SET_DEFAULT}
            disabled={busy || !actionState[BRANCH_ACTION.SET_DEFAULT].enabled}
            onPress={() => {
              setMenuOpen(false);
              onAction(branch, BRANCH_ACTION.SET_DEFAULT);
            }}
          />
        </BottomSheet>
      ) : null}
    </YStack>
  );
}
