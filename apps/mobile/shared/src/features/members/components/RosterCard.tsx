import { memo } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  MEMBER_ROSTER_KIND,
  MEMBER_ROSTER_STATUS_META,
  type MemberRosterStatus,
} from '@xeprime/types';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { CardAction } from '@/components/ui/CardActionBar';
import { FactRow } from '@/components/ui/FactRow';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import type { IconName } from '@/components/ui/Chip';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space, typeScale } from '@/theme/tokens';
import type { MemberRosterItem } from '../api';
import { LastActiveText } from './LastActiveText';
import { RolePill } from './RolePill';

/** Cùng cỡ với thẻ thành viên cũ — vừa chiều cao khối tên + dòng phụ. */
const AVATAR_SIZE = 40;
const body = { fos: typeScale.body.fontSize, lh: typeScale.body.lineHeight } as const;

/** Người đang xem được làm gì với MỘT dòng — màn danh sách tính một chỗ, thẻ và tấm chi tiết dùng chung. */
export interface RosterAbilities {
  edit: boolean;
  lock: boolean;
  resetPassword: boolean;
  remove: boolean;
  revoke: boolean;
}

/**
 * MỘT dòng của danh sách GỘP Nhân viên & phân quyền — bản native của một hàng `DataTable` bên web
 * (`MembersPage`, design `24035:69458`). Thành viên hoặc lời mời cũ còn chờ ("Chờ xác nhận").
 *
 * Đủ các cột của web: tên (+ `@tên đăng nhập` · email), SĐT, vai, chi nhánh phụ trách, trạng thái
 * (kèm "khoá vì hết gói"), hoạt động gần nhất. Thanh thao tác giữ việc hay dùng (Xem chi tiết,
 * Chỉnh sửa, Thu hồi lời mời); khoá / đặt lại mật khẩu / gỡ nằm ở tấm chi tiết — cùng điều kiện.
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
}) {
  const colors = useColors();
  const t = useTranslations('Members');
  const tCommon = useTranslations('Common.labels');
  const domainLabel = useDomainLabel();

  const isInvite = item.kind === MEMBER_ROSTER_KIND.INVITE;
  const name = isInvite
    ? (item.nickname ?? t('roster.pendingName'))
    : (item.displayName ?? item.nickname ?? item.phone ?? t('roster.pendingName'));
  // Tài khoản do gian hàng cấp hiện tên đăng nhập — thứ chủ cần đọc lại cho nhân viên.
  const subtitle = [item.username ? `@${item.username}` : null, item.email]
    .filter(Boolean)
    .join(LIST_SEPARATOR);
  const statusMeta = MEMBER_ROSTER_STATUS_META[item.status as MemberRosterStatus];
  const statusLabel = domainLabel('memberRosterStatus', item.status, statusMeta?.label);
  const branchText =
    branchNames === null
      ? t('roster.allBranches')
      : branchNames.length === 0
        ? tCommon('emptyValue')
        : branchNames.join(LIST_SEPARATOR);

  const actions: CardAction[] = [
    {
      key: 'view',
      label: t('roster.actions.view'),
      icon: 'eye-outline' as IconName,
      onPress: () => onView(item),
    },
    ...(abilities.edit
      ? [
          {
            key: 'edit',
            label: t('roster.actions.edit'),
            icon: 'create-outline' as IconName,
            disabled: pending,
            onPress: () => onEdit(item),
          },
        ]
      : []),
    ...(abilities.revoke
      ? [
          {
            key: 'revoke',
            label: t('roster.actions.revoke'),
            icon: 'close-circle-outline' as IconName,
            tone: 'danger' as const,
            disabled: pending,
            loading: pending,
            onPress: () => onRevoke(item),
          },
        ]
      : []),
  ];

  return (
    // Khuôn thẻ danh sách chuẩn (Đơn thuê): danh tính + viên trạng thái, dòng nhãn/giá trị, nút vàng.
    <Card>
      <YStack gap={space.sm}>
        <XStack ai="center" gap={space.sm}>
          <Avatar name={name} url={item.avatarUrl ?? null} size={AVATAR_SIZE} />
          <YStack f={1} minWidth={0} gap={2}>
            <Text col={colors.text} {...body} fow={fontWeight.semibold} numberOfLines={1}>
              {name}
              {isMe ? ` ${t('roster.you')}` : ''}
            </Text>
            <Text col={colors.textMuted} {...body} numberOfLines={1}>
              {subtitle || item.phone || tCommon('emptyValue')}
            </Text>
          </YStack>
          {statusMeta ? (
            <Pill label={statusLabel} tone={pillToneOfStatusColor(statusMeta.color)} />
          ) : null}
        </XStack>

        <XStack ai="center" gap={space.sm} flexWrap="wrap">
          <RolePill roleKey={item.roleKey} />
          {subtitle && item.phone ? (
            <Text col={colors.textMuted} {...body} numberOfLines={1}>
              {item.phone}
            </Text>
          ) : null}
        </XStack>

        <FactRow label={t('roster.columns.branches')}>{branchText}</FactRow>
        <XStack jc="space-between" ai="flex-start" gap={space.sm}>
          <Text col={colors.textMuted} {...body}>
            {t('roster.columns.lastActive')}
          </Text>
          <LastActiveText item={item} />
        </XStack>
        {item.lockedReason ? (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('roster.lockedBySystem')}
          </Text>
        ) : null}

        {actions.length > 0 ? (
          <XStack gap={space.sm} pt={space.xs}>
            {actions.map((action) => (
              <YStack key={action.key} f={1} minWidth={0}>
                <Button
                  label={action.label}
                  icon={action.icon}
                  variant={action.tone === 'danger' ? 'dangerOutline' : 'gradient'}
                  size="compact"
                  disabled={action.disabled ?? false}
                  loading={action.loading ?? false}
                  onPress={action.onPress}
                />
              </YStack>
            ))}
          </XStack>
        ) : null}
      </YStack>
    </Card>
  );
}

export const RosterCard = memo(RosterCardImpl);
