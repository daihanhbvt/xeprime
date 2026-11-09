'use client';

import {
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  KeyOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { App, Button, Skeleton, Switch } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
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
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { StatusTag } from '@/components/data-display/StatusTag';
import { InfoCard, InfoRow, InfoRows } from '@/components/layout/InfoCard';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { useAuditLabels } from '@/features/admin-audit/hooks/use-audit-labels';
import { useAppFormat } from '@/i18n/use-app-format';
import { useMemberActivity, useMemberRoles } from '../hooks/use-roster';
import type { MemberRosterItem } from '../types';
import { LastActiveText } from './LastActiveText';
import { memberBranchNames, useBranchScopeOptions } from './MemberBranchScopeSelect';
import { RolePill } from './RolePill';
import styles from './MemberDetailDrawer.module.css';

/** Những gì người đang xem ĐƯỢC làm với dòng này — trang danh sách tính sẵn từ quyền + gói + phạm vi. */
export interface MemberDetailActions {
  onEdit?: () => void;
  onResetPassword?: () => void;
  /** `true` = khoá. Vắng ⇒ không có công tắc truy cập (chủ, chính mình, khoá vì hết gói). */
  onSetLocked?: (locked: boolean) => void;
  lockPending?: boolean;
  onRemove?: () => void;
  onRevoke?: () => void;
}

/**
 * "Xem chi tiết" một nhân viên (ADR 0086 điều 8 · ADR 0087). Đọc những gì người quản lý cần để
 * QUẢN người đó: ai, liên hệ thế nào, đang vào được gian hàng không (công tắc khoá ngay tại đây), vai
 * làm được gì, đã làm gì gần đây. Mọi thao tác ở đây cũng có ở menu "…" của dòng — cùng điều kiện.
 */
export function MemberDetailDrawer({
  item,
  open,
  rolesHref,
  isSelf,
  actions,
  onClose,
}: {
  item: MemberRosterItem | null;
  open: boolean;
  rolesHref: string | null;
  isSelf: boolean;
  actions: MemberDetailActions;
  onClose: () => void;
}) {
  const t = useTranslations('Members');
  const tCommon = useTranslations('Common');
  const { modal } = App.useApp();
  const fmt = useAppFormat();
  const scope = useBranchScopeOptions();
  const empty = tCommon('labels.emptyValue');
  const isInvite = item?.kind === MEMBER_ROSTER_KIND.INVITE;

  const name = item
    ? isInvite
      ? (item.nickname ?? t('roster.pendingName'))
      : (item.displayName ?? '')
    : '';

  function confirmLock(locked: boolean) {
    void modal.confirm({
      title: t(locked ? 'roster.confirm.lock' : 'roster.confirm.unlock', { name }),
      content: locked ? t('roster.confirm.lockBody') : undefined,
      okText: t(locked ? 'roster.actions.lock' : 'roster.actions.unlock'),
      okButtonProps: { danger: locked },
      cancelText: tCommon('actions.close'),
      onOk: () => actions.onSetLocked?.(locked),
    });
  }

  function confirmRemove() {
    void modal.confirm({
      title: t('roster.confirm.remove', { name }),
      content: t('roster.confirm.removeBody'),
      okText: tCommon('actions.remove'),
      okButtonProps: { danger: true },
      cancelText: tCommon('actions.close'),
      onOk: () => actions.onRemove?.(),
    });
  }

  function confirmRevoke() {
    void modal.confirm({
      title: t('roster.confirm.revoke'),
      content: t('roster.confirm.revokeBody'),
      okText: t('roster.actions.revoke'),
      okButtonProps: { danger: true },
      cancelText: tCommon('actions.close'),
      onOk: () => actions.onRevoke?.(),
    });
  }

  const footerButtons = item
    ? [
        actions.onEdit ? (
          <Button key="edit" icon={<EditOutlined />} onClick={actions.onEdit}>
            {t('roster.actions.edit')}
          </Button>
        ) : null,
        actions.onResetPassword ? (
          <Button key="reset" icon={<KeyOutlined />} onClick={actions.onResetPassword}>
            {t('roster.actions.resetPassword')}
          </Button>
        ) : null,
        actions.onRemove ? (
          <Button key="remove" danger icon={<DeleteOutlined />} onClick={confirmRemove}>
            {t('roster.actions.remove')}
          </Button>
        ) : null,
        actions.onRevoke ? (
          <Button key="revoke" danger icon={<StopOutlined />} onClick={confirmRevoke}>
            {t('roster.actions.revoke')}
          </Button>
        ) : null,
      ].filter(Boolean)
    : [];

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title={t(isInvite ? 'detail.inviteTitle' : 'detail.title')}
      size="md"
      footer={footerButtons.length > 0 ? <div className={styles.footer}>{footerButtons}</div> : null}
    >
      {item ? (
        <div className={styles.body}>
          <header className={styles.profile}>
            <EntityIdentity
              kind="person"
              size="lg"
              imageUrl={item.avatarUrl}
              initialSource={name || item.phone || ''}
              name={
                <>
                  {name}
                  {isSelf ? <span className={styles.muted}> {t('roster.you')}</span> : null}
                </>
              }
              subtitle={
                [item.username ? `@${item.username}` : null, item.email]
                  .filter(Boolean)
                  .join(LIST_SEPARATOR) || null
              }
            />
            <div className={styles.badges}>
              <RolePill roleKey={item.roleKey} />
              <StatusTag
                value={item.status as MemberRosterStatus}
                meta={MEMBER_ROSTER_STATUS_META}
                group="memberRosterStatus"
                appearance="pill"
              />
            </div>
          </header>

          {isInvite ? (
            <InfoCard title={t('detail.inviteTitle')}>
              <InfoRows>
                <InfoRow label={t('detail.phone')} value={item.phone} emptyLabel={empty} />
                <InfoRow label={t('detail.invitedAt')} value={fmt.dateTime(item.invitedAt)} emptyLabel={empty} />
                <InfoRow label={t('detail.expiresAt')} value={fmt.dateTime(item.expiresAt)} emptyLabel={empty} />
                <InfoRow label={t('detail.invitedBy')} value={item.invitedByName} emptyLabel={empty} />
              </InfoRows>
            </InfoCard>
          ) : (
            <AccessCard
              item={item}
              branchNames={memberBranchNames(item, scope.labelById, t('roster.unknownBranch'))}
              onToggle={actions.onSetLocked ? confirmLock : undefined}
              pending={Boolean(actions.lockPending)}
            />
          )}

          {isInvite ? null : (
            <InfoCard title={t('detail.sections.contact')}>
              <InfoRows>
                {/* Tài khoản do gian hàng cấp không có SĐT đăng nhập — chỉ SĐT liên hệ chủ ghi. */}
                {item.managedAccount ? null : (
                  <InfoRow label={t('detail.phone')} value={item.phone} emptyLabel={empty} />
                )}
                {item.managedAccount || (item.contactPhone && item.contactPhone !== item.phone) ? (
                  <InfoRow label={t('detail.contactPhone')} value={item.contactPhone} emptyLabel={empty} />
                ) : null}
                <InfoRow label={t('detail.email')} value={item.email} emptyLabel={empty} />
              </InfoRows>
            </InfoCard>
          )}

          <RolePermissionsCard roleKey={item.roleKey} rolesHref={rolesHref} />

          {isInvite ? null : (
            <>
              <InfoCard title={t('detail.sections.activity')}>
                <InfoRows>
                  <InfoRow label={t('detail.lastActive')} value={<LastActiveText item={item} />} emptyLabel={empty} />
                  <InfoRow
                    label={t('detail.joinedAt')}
                    value={item.joinedAt ? fmt.date(item.joinedAt) : null}
                    emptyLabel={empty}
                  />
                  <InfoRow label={t('detail.createdBy')} value={item.invitedByName} emptyLabel={empty} />
                </InfoRows>
              </InfoCard>
              {item.userId ? <RecentActivityCard userId={item.userId} /> : null}
            </>
          )}
        </div>
      ) : null}
    </DetailDrawer>
  );
}

/** Thẻ "Quyền truy cập": công tắc khoá, vai, chi nhánh, loại tài khoản, tên đăng nhập. */
function AccessCard({
  item,
  branchNames,
  onToggle,
  pending,
}: {
  item: MemberRosterItem;
  branchNames: string[] | null;
  onToggle?: (locked: boolean) => void;
  pending: boolean;
}) {
  const t = useTranslations('Members');
  const tCommon = useTranslations('Common');
  const empty = tCommon('labels.emptyValue');
  const locked = item.status === MEMBER_ROSTER_STATUS.LOCKED;
  const stateText = item.lockedReason
    ? t('detail.accessSystemLocked')
    : t(locked ? 'detail.accessOff' : 'detail.accessOn');

  return (
    <InfoCard title={t('detail.sections.access')}>
      <div className={styles.access}>
        <div className={styles.accessText}>
          <span className={styles.accessTitle}>{t('detail.accessSwitch')}</span>
          <span className={locked ? styles.accessOff : styles.muted}>{stateText}</span>
        </div>
        {onToggle ? (
          <Switch
            checked={!locked}
            loading={pending}
            aria-label={t('detail.accessSwitch')}
            onChange={(checked) => onToggle(!checked)}
          />
        ) : null}
      </div>
      <InfoRows>
        <InfoRow
          label={t('detail.role')}
          value={
            <span className={styles.stack}>
              <RolePill roleKey={item.roleKey} />
              <span className={styles.muted}>{t(`roleHint.${item.roleKey as TenantRole}`)}</span>
            </span>
          }
          emptyLabel={empty}
        />
        <InfoRow
          label={t('detail.branches')}
          value={
            branchNames === null ? (
              t('roster.allBranches')
            ) : branchNames.length === 0 ? null : (
              <ul className={styles.plainList}>
                {branchNames.map((branch, i) => (
                  <li key={`${item.branchIds[i]}`}>{branch}</li>
                ))}
              </ul>
            )
          }
          emptyLabel={empty}
        />
        <InfoRow
          label={t('detail.accountType')}
          value={t(item.managedAccount ? 'detail.accountManaged' : 'detail.accountOwn')}
          emptyLabel={empty}
        />
        {item.managedAccount ? (
          <InfoRow label={t('detail.username')} value={item.username} emptyLabel={empty} />
        ) : null}
      </InfoRows>
    </InfoCard>
  );
}

/** Tóm tắt vai làm được gì — cùng phép tính với ma trận "Vai trò & quyền". */
function RolePermissionsCard({ roleKey, rolesHref }: { roleKey: string; rolesHref: string | null }) {
  const t = useTranslations('Members');
  const roles = useMemberRoles();
  const role = roles.data?.find((r) => r.roleKey === roleKey);
  const permissions = new Set(role?.permissions ?? []);
  const rows = role
    ? ROLE_MATRIX_ROWS.map((row) => ({ row, level: roleMatrixLevel(row, roleKey, permissions) })).filter(
        ({ level }) => level !== ROLE_MATRIX_LEVEL.NONE,
      )
    : [];

  return (
    <InfoCard
      title={t('detail.sections.permissions')}
      extra={
        rolesHref ? (
          <Link href={rolesHref} className={styles.link}>
            {t('detail.viewMatrix')}
          </Link>
        ) : null
      }
    >
      {roles.isLoading ? (
        <Skeleton active paragraph={{ rows: 3 }} title={false} />
      ) : rows.length === 0 ? (
        <p className={styles.muted}>{t('detail.permissionsNone')}</p>
      ) : (
        <ul className={styles.permList}>
          {rows.map(({ row, level }) => (
            <li key={row.key} className={styles.permItem}>
              <span className={styles.permIcon} data-level={level} aria-hidden="true">
                {level === ROLE_MATRIX_LEVEL.VIEW ? <EyeOutlined /> : <CheckOutlined />}
              </span>
              <span>{t(`matrix.rows.${row.key as 'members'}`)}</span>
              {level === ROLE_MATRIX_LEVEL.LIMITED ? (
                <span className={styles.muted}>{t('detail.permissionsLimited')}</span>
              ) : level === ROLE_MATRIX_LEVEL.VIEW ? (
                <span className={styles.muted}>{t('detail.permissionsView')}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </InfoCard>
  );
}

/** 10 việc gần nhất người đó làm trong gian hàng — `GET /members/:userId/activity`. */
function RecentActivityCard({ userId }: { userId: string }) {
  const t = useTranslations('Members');
  const fmt = useAppFormat();
  const labels = useAuditLabels();
  const activity = useMemberActivity(userId);

  return (
    <InfoCard title={t('detail.sections.recent')}>
      {activity.isLoading ? (
        <Skeleton active paragraph={{ rows: 3 }} title={false} />
      ) : activity.isError ? (
        <p className={styles.muted}>{t('detail.recentError')}</p>
      ) : (activity.data ?? []).length === 0 ? (
        <p className={styles.muted}>{t('detail.recentEmpty')}</p>
      ) : (
        <ol className={styles.timeline}>
          {activity.data!.map((row) => (
            <li key={row.id} className={styles.timelineItem}>
              <span className={styles.timelineAction}>{labels.action(row.action)}</span>
              <span className={styles.muted}>
                {row.targetType ? `${labels.targetType(row.targetType)}${LIST_SEPARATOR}` : ''}
                {fmt.dateTime(row.createdAt)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </InfoCard>
  );
}
