import { useMemo } from 'react';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LineIcon } from '@/components/icons/LineIcon';
import { IconSquareButton } from '@/components/ui/IconSquareButton';
import { UnderlineTabs } from '@/components/ui/UnderlineTabs';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { useColors } from '@/theme/ThemeProvider';
import { iconSize } from '@/theme/tokens';
import { useMemberRoles } from '../hooks/use-members';

export type MembersTab = 'members' | 'roles';

/**
 * Thanh trên chung của "Nhân viên & phân quyền" (Figma Header MB `24231:114136` · `24232:115557`):
 * tiêu đề + nút "+" (Thêm nhân viên) và hàng tab gạch chân "Nhân viên (số) · Vai trò & quyền".
 *
 * Hai tab là HAI ROUTE có sẵn (`/manage/members` · `/manage/members/roles`, deep-link được) - tab chỉ
 * điều hướng, nơi gọi quyết đi tới hay lùi về. Số cạnh "Nhân viên" là tổng thành viên theo vai
 * (`GET /members/roles`, cùng query màn Vai trò dùng) - không đổi theo ô tìm / bộ lọc của danh sách.
 */
export function MembersHeader({
  tab,
  onTab,
  onBack,
  canView,
  add,
}: {
  tab: MembersTab;
  onTab: (next: MembersTab) => void;
  onBack?: () => void;
  canView: boolean;
  /** Vắng ⇒ không có quyền thêm, không vẽ nút. */
  add?: { label: string; disabled: boolean; onPress: () => void };
}) {
  const colors = useColors();
  const t = useTranslations('Members');
  const roles = useMemberRoles(canView);
  const memberCount = roles.data?.reduce((sum, role) => sum + role.memberCount, 0);

  const items = useMemo(
    () => [
      {
        key: 'members' as const,
        label: t('tabs.members'),
        ...(memberCount === undefined ? {} : { count: memberCount }),
      },
      { key: 'roles' as const, label: t('matrix.title') },
    ],
    [memberCount, t],
  );

  return (
    <ManagePageHeader
      title={t('page.title')}
      {...(onBack ? { onBack } : {})}
      {...(add
        ? {
            actions: (
              <IconSquareButton
                label={add.label}
                tone="brand"
                disabled={add.disabled}
                onPress={add.onPress}
              >
                <LineIcon name="plus" size={iconSize.lg} color={colors.onPrimary} />
              </IconSquareButton>
            ),
          }
        : {})}
      below={
        <YStack accessibilityLabel={t('tabs.label')}>
          <UnderlineTabs stretch items={items} value={tab} onChange={onTab} />
        </YStack>
      }
    />
  );
}
