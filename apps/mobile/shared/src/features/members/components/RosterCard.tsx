import { memo, useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { MEMBER_ROSTER_KIND, MEMBER_ROSTER_STATUS } from '@xeprime/types';
import { LineIcon } from '@/components/icons/LineIcon';
import { ActionSheetButtons, type SheetAction } from '@/components/ui/ActionSheetButtons';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Card } from '@/components/ui/Card';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, sizing, space, typeScale } from '@/theme/tokens';
import type { MemberRosterItem } from '../api';
import { RolePill } from './RolePill';

/** Figma "Card" `24231:114594`: đệm 16, hai khối cách 16; avatar 40 (người dùng bỏ chấm trạng thái 26/11/2026). */
const CARD_GAP = 16;
const AVATAR_SIZE = 40;
/** Chip chi nhánh: bo 6 (Figma `_Badge` `24231:114659`). */
const BRANCH_CHIP_RADIUS = 6;
const KEBAB_SLOP = Math.ceil((sizing.touchTarget - iconSize.lg) / 2);

/** Người đang xem được làm gì với MỘT dòng — màn danh sách tính một chỗ, thẻ và tấm chi tiết dùng chung. */
export interface RosterAbilities {
  edit: boolean;
  lock: boolean;
  resetPassword: boolean;
  remove: boolean;
  revoke: boolean;
}

type MenuKey = 'edit' | 'resetPassword' | 'lock' | 'remove' | 'revoke';

/**
 * MỘT dòng của danh sách GỘP Nhân viên & phân quyền — Figma Partner-XePrime "Staff & Permissions
 * MB" (`24231:114135`). Thành viên hoặc lời mời cũ còn chờ ("Chờ xác nhận").
 *
 * Avatar, tên, email - SĐT, nút "⋮"; dưới là viên vai trò và chip chi nhánh phụ trách. Chạm thẻ mở tấm chi tiết (ở đó có
 * hoạt động gần nhất, lý do khoá, khoá / đặt lại mật khẩu / gỡ). Menu "⋮" giữ đúng các thao tác
 * của web, cùng điều kiện quyền: Xem chi tiết · Chỉnh sửa · Đặt lại mật khẩu · Tạm khoá / Mở khoá ·
 * Gỡ khỏi gian hàng · Thu hồi lời mời.
 */
function RosterCardImpl({
  item,
  isMe,
  branchNames,
  abilities,
  pending,
  onView,
  onEdit,
  onRevoke,
  onResetPassword,
  onSetLocked,
  onRemove,
}: {
  item: MemberRosterItem;
  isMe: boolean;
  /** `null` = "Tất cả chi nhánh"; mảng rỗng = chưa có chi nhánh nào. */
  branchNames: string[] | null;
  abilities: RosterAbilities;
  /** Có mutation đang chạy trên CHÍNH dòng này. */
  pending: boolean;
  onView: (item: MemberRosterItem) => void;
  onEdit: (item: MemberRosterItem) => void;
  onRevoke: (item: MemberRosterItem) => void;
  onResetPassword: (item: MemberRosterItem) => void;
  onSetLocked: (item: MemberRosterItem, locked: boolean) => void;
  onRemove: (item: MemberRosterItem) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Members');
  const tCommon = useTranslations('Common.labels');
  const [menuOpen, setMenuOpen] = useState(false);

  const isInvite = item.kind === MEMBER_ROSTER_KIND.INVITE;
  const name = isInvite
    ? (item.nickname ?? t('roster.pendingName'))
    : (item.displayName ?? item.nickname ?? item.phone ?? t('roster.pendingName'));
  // Tài khoản do gian hàng cấp hiện tên đăng nhập — thứ chủ cần đọc lại cho nhân viên. Figma vẽ
  // "email - SĐT"; tên đăng nhập (nếu có) đứng trước để không mất thông tin của thẻ cũ.
  const contacts = [item.username ? `@${item.username}` : null, item.email, item.phone].filter(
    (part): part is string => Boolean(part),
  );

  const locked = item.status === MEMBER_ROSTER_STATUS.LOCKED;
  const branchText =
    branchNames === null
      ? t('roster.allBranches')
      : branchNames.length === 0
        ? tCommon('emptyValue')
        : t('roster.branchCount', { count: branchNames.length });

  // Người dùng 26/11/2026: bỏ "Xem chi tiết" khỏi menu - chạm thẻ đã mở chi tiết.
  const menu: SheetAction[] = [
    {
      key: 'edit',
      icon: 'edit-1' as const,
      label: t('roster.actions.edit'),
      show: abilities.edit,
      danger: false,
    },
    {
      key: 'resetPassword',
      icon: 'password' as const,
      label: t('roster.actions.resetPassword'),
      show: abilities.resetPassword,
      danger: false,
    },
    {
      key: 'lock',
      icon: locked ? ('lock-1' as const) : ('lock' as const),
      label: t(locked ? 'roster.actions.unlock' : 'roster.actions.lock'),
      show: abilities.lock,
      danger: false,
      // "Tạm khoá" ngắn hơn "Gỡ khỏi gian hàng" đứng cùng hàng: chia 2 : 3 thay vì đều.
      grow: 2,
    },
    {
      key: 'remove',
      icon: 'delete-2' as const,
      label: t('roster.actions.remove'),
      show: abilities.remove,
      danger: true,
      grow: 3,
    },
    {
      key: 'revoke',
      icon: 'rotate-left' as const,
      label: t('roster.actions.revoke'),
      show: abilities.revoke,
      danger: true,
    },
  ]
    .filter((entry) => entry.show)
    .map(({ show: _show, ...entry }) => ({
      ...entry,
      disabled: pending,
      onPress: () => runMenu(entry.key as MenuKey),
    }));

  const runMenu = (key: MenuKey) => {
    setMenuOpen(false);
    if (key === 'edit') onEdit(item);
    else if (key === 'resetPassword') onResetPassword(item);
    else if (key === 'lock') onSetLocked(item, !locked);
    else if (key === 'remove') onRemove(item);
    else onRevoke(item);
  };

  return (
    <>
    {/* Chạm thẻ mở chi tiết - `onPress` của `Card` cho hiệu ứng lún khi nhấn như thẻ Đơn thuê. */}
    <Card
      padded={false}
      onPress={() => onView(item)}
      accessibilityLabel={t('roster.openDetail', { name })}
    >
        <YStack p={space.md} gap={CARD_GAP}>
          <XStack ai="flex-start" gap={space.sm}>
            <Avatar name={name} url={item.avatarUrl ?? null} size={AVATAR_SIZE} />
            <YStack f={1} minWidth={0} gap={2} jc="center" minHeight={AVATAR_SIZE}>
              <Text
                col={colors.text}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                fow={fontWeight.semibold}
                numberOfLines={1}
              >
                {name}
                {isMe ? ` ${t('roster.you')}` : ''}
              </Text>
              {contacts.length > 0 ? (
                <XStack gap={6} ai="center" minWidth={0}>
                  {contacts.map((part, index) => (
                    <XStack key={part} gap={6} ai="center" flexShrink={index === contacts.length - 1 ? 0 : 1} minWidth={0}>
                      {index > 0 ? (
                        <Text col={colors.borderInput} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
                          -
                        </Text>
                      ) : null}
                      <Text
                        col={colors.placeholder}
                        fos={typeScale.label.fontSize}
                        lh={typeScale.label.lineHeight}
                        numberOfLines={1}
                        flexShrink={1}
                      >
                        {part}
                      </Text>
                    </XStack>
                  ))}
                </XStack>
              ) : null}
            </YStack>
            {menu.length > 0 ? (
              <Pressable
                onPress={() => setMenuOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t('roster.menu', { name })}
                hitSlop={KEBAB_SLOP}
                disabled={pending}
              >
                <LineIcon name="menu-kebab" size={iconSize.lg} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </XStack>

          <XStack ai="center" jc="space-between" gap={space.sm}>
            {/* Viên vai KHÔNG co - chip chi nhánh (đã gọn "N chi nhánh") nhường chỗ nếu hẹp. */}
            <YStack flexShrink={0}>
              <RolePill roleKey={item.roleKey} compact />
            </YStack>
            <YStack
              flexShrink={1}
              minWidth={0}
              px={space.sm}
              py={2}
              br={BRANCH_CHIP_RADIUS}
              bg={colors.background}
            >
              <Text
                col={colors.textMuted}
                fos={typeScale.label.fontSize}
                lh={typeScale.label.lineHeight}
                fow={fontWeight.medium}
                numberOfLines={1}
              >
                {branchText}
              </Text>
            </YStack>
          </XStack>
        </YStack>
    </Card>

      <BottomSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={t('roster.menuTitle')}
        chrome="v2"
        headerDivider
      >
        <ActionSheetButtons actions={menu} />
      </BottomSheet>
    </>
  );
}

export const RosterCard = memo(RosterCardImpl);
