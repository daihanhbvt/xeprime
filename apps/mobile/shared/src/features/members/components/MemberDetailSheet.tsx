import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  MEMBER_ROSTER_KIND,
  MEMBER_ROSTER_STATUS,
  MEMBER_ROSTER_STATUS_META,
  ROLE_MATRIX_LEVEL,
  ROLE_MATRIX_ROWS,
  roleMatrixLevel,
  type MemberRosterStatus,
  type TenantRole,
} from '@xeprime/types';
import { Ionicons } from '@/components/icons/Ionicons';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { DataRow, Divider } from '@/components/ui/DataRow';
import { InlineAction } from '@/components/ui/InlineAction';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useDomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import type { MemberRosterItem } from '../api';
import { memberBranchNames, useBranchScopeOptions } from '../branch-scope';
import { useMemberActivity, useMemberRoles } from '../hooks/use-members';
import { useActivityLabels } from '../use-activity-labels';
import { LastActiveText } from './LastActiveText';
import { RolePill } from './RolePill';
import type { RosterAbilities } from './RosterCard';

/** Thao tác nơi gọi mở — tấm chi tiết đóng lại trước, hộp xác nhận / tấm sửa mở ở màn danh sách. */
export interface MemberDetailHandlers {
  onEdit: (item: MemberRosterItem) => void;
  onResetPassword: (item: MemberRosterItem) => void;
  onSetLocked: (item: MemberRosterItem, locked: boolean) => void;
  onRemove: (item: MemberRosterItem) => void;
  onRevoke: (item: MemberRosterItem) => void;
  onOpenMatrix: () => void;
}

/**
 * "Xem chi tiết" một nhân viên (ADR 0086 điều 8 · ADR 0087) — bản native của web
 * `MemberDetailDrawer`. Đọc những gì người quản lý cần để QUẢN người đó: ai, liên hệ thế nào, đang
 * vào được gian hàng không (khoá / mở khoá ngay tại đây), vai làm được gì, đã làm gì gần đây.
 *
 * Web dùng công tắc; native dùng nút "Tạm khoá / Mở khoá" kèm hộp xác nhận — cùng điều kiện, cùng câu.
 */
export function MemberDetailSheet({
  item,
  isSelf,
  abilities,
  canOpenMatrix,
  handlers,
  onClose,
}: {
  item: MemberRosterItem | null;
  isSelf: boolean;
  abilities: RosterAbilities | null;
  canOpenMatrix: boolean;
  handlers: MemberDetailHandlers;
  onClose: () => void;
}) {
  const t = useTranslations('Members');
  const isInvite = item?.kind === MEMBER_ROSTER_KIND.INVITE;

  return (
    <BottomSheet
      open={item !== null}
      onClose={onClose}
      title={t(isInvite ? 'detail.inviteTitle' : 'detail.title')}
      footer={
        item && abilities ? (
          <DetailActions item={item} abilities={abilities} handlers={handlers} />
        ) : undefined
      }
    >
      {item && abilities ? (
        <DetailBody
          item={item}
          isSelf={isSelf}
          abilities={abilities}
          canOpenMatrix={canOpenMatrix}
          handlers={handlers}
        />
      ) : null}
    </BottomSheet>
  );
}

/**
 * Hành động chính (Sửa · Gỡ, hoặc Thu hồi lời mời) — dính ở đáy tấm, chia đôi bề ngang, để không
 * phải cuộn hết thông tin mới tới. Đặt lại mật khẩu là việc phụ, ở lại trong thân tấm.
 */
function DetailActions({
  item,
  abilities,
  handlers,
}: {
  item: MemberRosterItem;
  abilities: RosterAbilities;
  handlers: MemberDetailHandlers;
}) {
  const t = useTranslations('Members');
  if (!abilities.edit && !abilities.remove && !abilities.revoke) return null;
  return (
    <XStack gap={space.sm}>
      {abilities.edit ? (
        <YStack f={1}>
          <Button
            label={t('roster.actions.edit')}
            icon="create-outline"
            variant="secondary"
            onPress={() => handlers.onEdit(item)}
          />
        </YStack>
      ) : null}
      {abilities.remove ? (
        <YStack f={1}>
          <Button
            label={t('roster.actions.remove')}
            icon="person-remove-outline"
            variant="dangerOutline"
            onPress={() => handlers.onRemove(item)}
          />
        </YStack>
      ) : null}
      {abilities.revoke ? (
        <YStack f={1}>
          <Button
            label={t('roster.actions.revoke')}
            icon="close-circle-outline"
            variant="dangerOutline"
            onPress={() => handlers.onRevoke(item)}
          />
        </YStack>
      ) : null}
    </XStack>
  );
}

function Section({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <YStack gap={space.xs} p={space.sm} br={radius.card} bw={1} bc={colors.border}>
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
          {title}
        </Text>
        {extra}
      </XStack>
      {children}
    </YStack>
  );
}

function DetailBody({
  item,
  isSelf,
  abilities,
  canOpenMatrix,
  handlers,
}: {
  item: MemberRosterItem;
  isSelf: boolean;
  abilities: RosterAbilities;
  canOpenMatrix: boolean;
  handlers: MemberDetailHandlers;
}) {
  const colors = useColors();
  const t = useTranslations('Members');
  const tCommon = useTranslations('Common.labels');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const scope = useBranchScopeOptions();
  const empty = tCommon('emptyValue');
  const isInvite = item.kind === MEMBER_ROSTER_KIND.INVITE;
  const locked = item.status === MEMBER_ROSTER_STATUS.LOCKED;

  const name = isInvite ? (item.nickname ?? t('roster.pendingName')) : (item.displayName ?? '');
  const subtitle = [item.username ? `@${item.username}` : null, item.email]
    .filter(Boolean)
    .join(LIST_SEPARATOR);
  const statusMeta = MEMBER_ROSTER_STATUS_META[item.status as MemberRosterStatus];
  const branchNames = memberBranchNames(item, scope.labelById, t('roster.unknownBranch'));
  const branchText =
    branchNames === null
      ? t('roster.allBranches')
      : branchNames.length === 0
        ? empty
        : branchNames.join('\n');

  const accessText = item.lockedReason
    ? t('detail.accessSystemLocked')
    : t(locked ? 'detail.accessOff' : 'detail.accessOn');

  return (
    <YStack gap={space.md}>
      <XStack ai="center" gap={space.sm}>
        <Avatar name={name || item.phone || ''} url={item.avatarUrl ?? null} size={sizing.touchTarget} />
        <YStack f={1} minWidth={0} gap={2}>
          <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
            {name}
            {isSelf ? ` ${t('roster.you')}` : ''}
          </Text>
          {subtitle ? (
            <Text col={colors.textMuted} fos={fontSize.meta}>
              {subtitle}
            </Text>
          ) : null}
          <XStack gap={space.xs} flexWrap="wrap" ai="center" mt={space.xs}>
            <RolePill roleKey={item.roleKey} badge />
            {statusMeta ? (
              <StatusBadge
                label={domainLabel('memberRosterStatus', item.status, statusMeta.label)}
                color={statusMeta.color}
              />
            ) : null}
          </XStack>
        </YStack>
      </XStack>

      {isInvite ? (
        <Section title={t('detail.inviteTitle')}>
          <DataRow label={t('detail.phone')} value={item.phone ?? empty} />
          <DataRow label={t('detail.invitedAt')} value={fmt.dateTime(item.invitedAt) || empty} />
          <DataRow label={t('detail.expiresAt')} value={fmt.dateTime(item.expiresAt) || empty} />
          <DataRow label={t('detail.invitedBy')} value={item.invitedByName ?? empty} />
        </Section>
      ) : (
        <Section title={t('detail.sections.access')}>
          <YStack gap={2}>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
              {t('detail.accessSwitch')}
            </Text>
            <Text col={locked ? colors.danger : colors.textMuted} fos={fontSize.meta}>
              {accessText}
            </Text>
          </YStack>
          {abilities.lock ? (
            <Button
              label={t(locked ? 'roster.actions.unlock' : 'roster.actions.lock')}
              icon={locked ? 'lock-open-outline' : 'lock-closed-outline'}
              variant={locked ? 'secondary' : 'dangerOutline'}
              onPress={() => handlers.onSetLocked(item, !locked)}
            />
          ) : null}
          <Divider />
          <YStack gap={space.xs}>
            <Text col={colors.textMuted} fos={fontSize.meta}>
              {t('detail.role')}
            </Text>
            <RolePill roleKey={item.roleKey} />
            <Text col={colors.textMuted} fos={fontSize.meta}>
              {t(`roleHint.${item.roleKey as TenantRole}`)}
            </Text>
          </YStack>
          <DataRow label={t('detail.branches')} value={branchText} />
          <DataRow
            label={t('detail.accountType')}
            value={t(item.managedAccount ? 'detail.accountManaged' : 'detail.accountOwn')}
          />
          {item.managedAccount ? (
            <DataRow label={t('detail.username')} value={item.username ?? empty} />
          ) : null}
        </Section>
      )}

      {isInvite ? null : (
        <Section title={t('detail.sections.contact')}>
          {/* Tài khoản do gian hàng cấp không có SĐT đăng nhập — chỉ SĐT liên hệ chủ ghi. */}
          {item.managedAccount ? null : (
            <DataRow label={t('detail.phone')} value={item.phone ?? empty} />
          )}
          {item.managedAccount || (item.contactPhone && item.contactPhone !== item.phone) ? (
            <DataRow label={t('detail.contactPhone')} value={item.contactPhone ?? empty} />
          ) : null}
          <DataRow label={t('detail.email')} value={item.email ?? empty} />
        </Section>
      )}

      <RolePermissionsSection
        roleKey={item.roleKey}
        {...(canOpenMatrix ? { onOpenMatrix: handlers.onOpenMatrix } : {})}
      />

      {isInvite ? null : (
        <>
          <Section title={t('detail.sections.activity')}>
            <XStack jc="space-between" ai="center" gap={space.sm}>
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('detail.lastActive')}
              </Text>
              <LastActiveText item={item} />
            </XStack>
            <DataRow
              label={t('detail.joinedAt')}
              value={item.joinedAt ? fmt.date(item.joinedAt) : empty}
            />
            <DataRow label={t('detail.createdBy')} value={item.invitedByName ?? empty} />
          </Section>
          {item.userId ? <RecentActivitySection userId={item.userId} /> : null}
        </>
      )}

      {abilities.resetPassword ? (
        <Button
          label={t('roster.actions.resetPassword')}
          icon="key-outline"
          variant="secondary"
          onPress={() => handlers.onResetPassword(item)}
        />
      ) : null}
    </YStack>
  );
}

/** Tóm tắt vai làm được gì — cùng phép tính `roleMatrixLevel` với màn "Vai trò & quyền". */
function RolePermissionsSection({
  roleKey,
  onOpenMatrix,
}: {
  roleKey: string;
  onOpenMatrix?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Members');
  const roles = useMemberRoles();
  const role = roles.data?.find((r) => r.roleKey === roleKey);
  const permissions = new Set(role?.permissions ?? []);
  const rows = role
    ? ROLE_MATRIX_ROWS.map((row) => ({
        row,
        level: roleMatrixLevel(row, roleKey, permissions),
      })).filter(({ level }) => level !== ROLE_MATRIX_LEVEL.NONE)
    : [];

  return (
    <Section
      title={t('detail.sections.permissions')}
      {...(onOpenMatrix
        ? { extra: <InlineAction label={t('detail.viewMatrix')} onPress={onOpenMatrix} /> }
        : {})}
    >
      {roles.isPending ? (
        <Skeleton height={60} />
      ) : rows.length === 0 ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('detail.permissionsNone')}
        </Text>
      ) : (
        <YStack gap={space.xs}>
          {rows.map(({ row, level }) => (
            <XStack key={row.key} ai="center" gap={space.xs}>
              <Ionicons
                name={level === ROLE_MATRIX_LEVEL.VIEW ? 'eye-outline' : 'checkmark'}
                size={iconSize.sm}
                color={level === ROLE_MATRIX_LEVEL.VIEW ? colors.info : colors.success}
              />
              <Text col={colors.text} fos={fontSize.bodySm} f={1}>
                {t(`matrix.rows.${row.key as 'members'}`)}
                {level === ROLE_MATRIX_LEVEL.LIMITED ? (
                  <Text col={colors.textMuted}>{` ${t('detail.permissionsLimited')}`}</Text>
                ) : level === ROLE_MATRIX_LEVEL.VIEW ? (
                  <Text col={colors.textMuted}>{` ${t('detail.permissionsView')}`}</Text>
                ) : null}
              </Text>
            </XStack>
          ))}
        </YStack>
      )}
    </Section>
  );
}

/** 10 việc gần nhất người đó làm trong gian hàng — `GET /members/:userId/activity`. */
function RecentActivitySection({ userId }: { userId: string }) {
  const colors = useColors();
  const t = useTranslations('Members');
  const fmt = useAppFormat();
  const labels = useActivityLabels();
  const activity = useMemberActivity(userId);
  const rows = activity.data ?? [];

  return (
    <Section title={t('detail.sections.recent')}>
      {activity.isPending ? (
        <Skeleton height={60} />
      ) : activity.isError ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('detail.recentError')}
        </Text>
      ) : rows.length === 0 ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('detail.recentEmpty')}
        </Text>
      ) : (
        <YStack gap={space.sm}>
          {rows.map((row) => (
            <YStack key={row.id} gap={2}>
              <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
                {labels.action(row.action)}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.meta}>
                {row.targetType ? `${labels.targetType(row.targetType)}${LIST_SEPARATOR}` : ''}
                {fmt.dateTime(row.createdAt)}
              </Text>
            </YStack>
          ))}
        </YStack>
      )}
    </Section>
  );
}
