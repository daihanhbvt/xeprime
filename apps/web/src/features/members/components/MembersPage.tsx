'use client';

import {
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  LockOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { App, Button } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  MEMBER_ROSTER_KIND,
  MEMBER_ROSTER_STATUS,
  MEMBER_ROSTER_STATUS_META,
  MEMBER_ROSTER_STATUS_VALUES,
  PERMISSION,
  PLAN_FEATURE,
  TENANT_ROLE,
  type MemberRosterStatus,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import type { RowAction } from '@/components/data-display/RowActions';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FeatureWriteTooltip } from '@/components/feedback/FeatureWriteTooltip';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ALL_FILTER } from '@/constants/filters';
import { ROUTES } from '@/constants/routes';
import { useAvailableHref } from '@/features/tenant-support/support-session';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useFeature } from '@/hooks/use-feature';
import { usePermissions } from '@/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { MEMBERS_DEFAULT_LIMIT } from '@/features/members/api';
import { ALL_ROLES } from '@/features/members/constants';
import { LastActiveText } from '@/features/members/components/LastActiveText';
import {
  MemberDetailDrawer,
  type MemberDetailActions,
} from '@/features/members/components/MemberDetailDrawer';
import { MemberEditDialog } from '@/features/members/components/MemberEditDialog';
import {
  canManageMemberScope,
  memberBranchNames,
  useBranchScopeOptions,
} from '@/features/members/components/MemberBranchScopeSelect';
import { ResetPasswordDialog } from '@/features/members/components/ResetPasswordDialog';
import { RolePill } from '@/features/members/components/RolePill';
import { StaffAccountDialog } from '@/features/members/components/StaffAccountDialog';
import {
  useRemoveMember,
  useRevokeInvite,
  useSetMemberLock,
} from '@/features/members/hooks/use-member-mutations';
import { useRoster } from '@/features/members/hooks/use-roster';
import { useRosterFilters } from '@/features/members/hooks/use-roster-filters';
import type { MemberRosterItem } from '@/features/members/types';
import styles from './MembersPage.module.css';

/** Suy từ tổng bề rộng cột của design `24035:69458` (1560px khung, cột tên 328). */
const MIN_TABLE_WIDTH = 1180;

/** Người đang xem được làm gì với MỘT dòng — một chỗ tính, dùng cho menu "…" và ngăn chi tiết. */
interface RowAbilities {
  edit: boolean;
  lock: boolean;
  resetPassword: boolean;
  remove: boolean;
  revoke: boolean;
}

/**
 * Nhân viên & Phân quyền (design `24035:69458`, ADR 0086 · ADR 0087).
 *
 * MỘT bảng cho thành viên lẫn lời mời cũ còn chờ ("Chờ xác nhận") — server ghép và phân trang
 * (`GET /members/roster`). Chủ CẤP tài khoản cho nhân viên ("Thêm nhân viên": tên đăng nhập + mật
 * khẩu — ADR 0087); mời bằng SĐT đã gỡ, lời mời cũ chỉ còn thu hồi được. Đổi vai / chi nhánh / họ tên
 * qua hộp "Chỉnh sửa"; khoá, đặt lại mật khẩu, gỡ nằm trong menu "…" và ngăn chi tiết.
 *
 * Dùng chung với phiên hỗ trợ gian hàng (ADR 0050): ở đó quyền chỉ có `members.view`, nên mọi nút
 * ghi tự vắng — và nút "Vai trò & quyền" trỏ vào route của phiên qua `useAvailableHref`.
 */
export function MembersPage() {
  const t = useTranslations('Members');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const { has } = usePermissions();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { data: me } = useCurrentUser();
  const membersFeature = useFeature(PLAN_FEATURE.MEMBERS);
  const availableHref = useAvailableHref();

  const { filters, setFilters } = useRosterFilters();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<MemberRosterItem | null>(null);
  const [resetting, setResetting] = useState<MemberRosterItem | null>(null);

  const { data, isError, refetch, isFetching } = useRoster(filters);
  const setLock = useSetMemberLock();
  const removeMember = useRemoveMember();
  const revoke = useRevokeInvite();
  const scope = useBranchScopeOptions();

  /*
   * Nhân viên & phân quyền là tính năng của GÓI (ADR 0027): hết hạn thì xem được danh sách, không
   * thêm hay sửa được người. Lớp chặn thật là `PlanFeatureGuard` ở backend.
   */
  const writable = membersFeature.canWrite;
  const canAdd = has(PERMISSION.MEMBER_INVITE);
  const canUpdate = has(PERMISSION.MEMBER_UPDATE_ROLE) && writable;
  const canRemove = has(PERMISSION.MEMBER_REMOVE) && writable;
  const canRevoke = canAdd && writable;
  const rolesHref = availableHref(ROUTES.MANAGE.MEMBER_ROLES);

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: MEMBERS_DEFAULT_LIMIT, total: 0, hasNext: false };
  const hasFilters = Boolean(filters.q || filters.roleKey || filters.status);

  const nameOf = (row: MemberRosterItem) =>
    row.displayName ?? row.nickname ?? row.phone ?? t('roster.pendingName');
  const isSelf = (row: MemberRosterItem) => Boolean(row.userId) && row.userId === me?.id;

  /**
   * Gương của luật server: không ai thao tác lên CHỦ hay CHÍNH MÌNH; người bị giới hạn chi nhánh chỉ
   * chạm dòng nằm gọn trong phần của mình (`assertWithinActorScope`); đặt lại mật khẩu chỉ cho tài
   * khoản do gian hàng cấp; khoá vì hết gói không mở tay.
   */
  function abilitiesOf(row: MemberRosterItem): RowAbilities {
    const withinScope = canManageMemberScope(scope.allowAll, scope.branchIds, row);
    if (row.kind === MEMBER_ROSTER_KIND.INVITE) {
      return { edit: false, lock: false, resetPassword: false, remove: false, revoke: canRevoke && withinScope };
    }
    const manageable = row.roleKey !== TENANT_ROLE.SHOP_OWNER && !isSelf(row) && withinScope;
    const systemLocked = row.status === MEMBER_ROSTER_STATUS.LOCKED && Boolean(row.lockedReason);
    return {
      edit: canUpdate && manageable,
      lock: canUpdate && manageable && !systemLocked,
      resetPassword: canUpdate && manageable && row.managedAccount,
      remove: canRemove && manageable,
      revoke: false,
    };
  }

  function handleLock(row: MemberRosterItem, locked: boolean) {
    if (!row.userId) return;
    setLock.mutate(
      { userId: row.userId, locked },
      {
        onSuccess: () => message.success(t(locked ? 'roster.toast.locked' : 'roster.toast.unlocked')),
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  function handleRemove(row: MemberRosterItem) {
    if (!row.userId) return;
    removeMember.mutate(row.userId, {
      onSuccess: () => {
        message.success(t('toast.removed'));
        if (filters.open === row.id) setFilters({ open: undefined }, { resetPage: false });
      },
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  function handleRevoke(row: MemberRosterItem) {
    revoke.mutate(row.id, {
      onSuccess: () => {
        message.success(t('toast.revoked'));
        if (filters.open === row.id) setFilters({ open: undefined }, { resetPage: false });
      },
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  const filterFields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('roster.searchLabel'),
      placeholder: t('roster.searchPlaceholder'),
    },
    {
      kind: 'select',
      key: 'roleKey',
      label: t('roster.role'),
      options: [
        { value: ALL_FILTER, label: t('roster.allRoles') },
        ...ALL_ROLES.map((role) => ({ value: role, label: domainLabel('tenantRole', role) })),
      ],
      allowClear: false,
    },
    {
      kind: 'select',
      key: 'status',
      label: t('roster.status'),
      options: [
        { value: ALL_FILTER, label: t('roster.allStatuses') },
        ...MEMBER_ROSTER_STATUS_VALUES.map((status) => ({
          value: status,
          label: domainLabel('memberRosterStatus', status),
        })),
      ],
      allowClear: false,
    },
  ];

  const addButton = canAdd ? (
    <FeatureWriteTooltip feature={PLAN_FEATURE.MEMBERS}>
      {(disabled) => (
        <Button type="primary" icon={<PlusOutlined />} disabled={disabled} onClick={() => setAddOpen(true)}>
          {t('staff.addButton')}
        </Button>
      )}
    </FeatureWriteTooltip>
  ) : null;

  function rowActions(row: MemberRosterItem): RowAction[] {
    const can = abilitiesOf(row);
    const name = nameOf(row);
    const locked = row.status === MEMBER_ROSTER_STATUS.LOCKED;
    return [
      {
        key: 'edit',
        label: t('roster.actions.edit'),
        icon: <EditOutlined />,
        hidden: !can.edit,
        onClick: () => setEditing(row),
      },
      {
        key: 'resetPassword',
        label: t('roster.actions.resetPassword'),
        icon: <KeyOutlined />,
        hidden: !can.resetPassword,
        onClick: () => setResetting(row),
      },
      {
        key: 'lock',
        label: t(locked ? 'roster.actions.unlock' : 'roster.actions.lock'),
        icon: locked ? <UnlockOutlined /> : <LockOutlined />,
        danger: !locked,
        hidden: !can.lock,
        loading: setLock.isPending && setLock.variables?.userId === row.userId,
        confirm: {
          title: t(locked ? 'roster.confirm.unlock' : 'roster.confirm.lock', { name }),
          description: locked ? undefined : t('roster.confirm.lockBody'),
          okText: t(locked ? 'roster.actions.unlock' : 'roster.actions.lock'),
          cancelText: tCommon('actions.close'),
        },
        onClick: () => handleLock(row, !locked),
      },
      {
        key: 'remove',
        label: t('roster.actions.remove'),
        icon: <DeleteOutlined />,
        danger: true,
        hidden: !can.remove,
        loading: removeMember.isPending && removeMember.variables === row.userId,
        confirm: {
          title: t('roster.confirm.remove', { name }),
          description: t('roster.confirm.removeBody'),
          okText: tCommon('actions.remove'),
          cancelText: tCommon('actions.close'),
        },
        onClick: () => handleRemove(row),
      },
      {
        key: 'revoke',
        label: t('roster.actions.revoke'),
        icon: <StopOutlined />,
        danger: true,
        hidden: !can.revoke,
        loading: revoke.isPending && revoke.variables === row.id,
        confirm: {
          title: t('roster.confirm.revoke'),
          description: t('roster.confirm.revokeBody'),
          okText: t('roster.actions.revoke'),
          cancelText: tCommon('actions.close'),
        },
        onClick: () => handleRevoke(row),
      },
    ];
  }

  const columns: DataTableColumn<MemberRosterItem>[] = [
    {
      title: t('roster.columns.member'),
      key: 'member',
      width: 300,
      render: (_, row) => {
        const isInvite = row.kind === MEMBER_ROSTER_KIND.INVITE;
        // Tài khoản do gian hàng cấp hiện tên đăng nhập — thứ chủ cần đọc lại cho nhân viên.
        const subtitle = [row.username ? `@${row.username}` : null, row.email]
          .filter(Boolean)
          .join(LIST_SEPARATOR);
        return (
          <EntityIdentity
            kind="person"
            size="sm"
            imageUrl={row.avatarUrl}
            initialSource={nameOf(row)}
            name={
              <>
                {isInvite ? (row.nickname ?? t('roster.pendingName')) : row.displayName}
                {isSelf(row) ? <span className={styles.you}> {t('roster.you')}</span> : null}
              </>
            }
            subtitle={subtitle || null}
          />
        );
      },
    },
    {
      title: t('roster.columns.phone'),
      key: 'phone',
      width: 150,
      render: (_, row) => row.phone ?? tCommon('labels.emptyValue'),
    },
    {
      title: t('roster.columns.role'),
      key: 'role',
      width: 190,
      render: (_, row) => <RolePill roleKey={row.roleKey} />,
    },
    {
      title: t('roster.columns.branches'),
      key: 'branches',
      width: 220,
      render: (_, row) => {
        const names = memberBranchNames(row, scope.labelById, t('roster.unknownBranch'));
        if (!names) return t('roster.allBranches');
        if (names.length === 0) return tCommon('labels.emptyValue');
        return (
          <ul className={styles.branchList}>
            {names.map((name, i) => (
              <li key={`${row.branchIds[i]}`}>{name}</li>
            ))}
          </ul>
        );
      },
    },
    {
      title: t('roster.columns.status'),
      key: 'status',
      width: 160,
      render: (_, row) => (
        <span className={styles.status}>
          <StatusTag
            value={row.status as MemberRosterStatus}
            meta={MEMBER_ROSTER_STATUS_META}
            group="memberRosterStatus"
            appearance="pill"
          />
          {row.lockedReason ? (
            <span className={styles.statusNote}>{t('roster.lockedBySystem')}</span>
          ) : null}
        </span>
      ),
    },
    {
      title: t('roster.columns.lastActive'),
      key: 'lastActive',
      width: 180,
      render: (_, row) => <LastActiveText item={row} />,
    },
    actionColumn<MemberRosterItem>(
      (row) => [
        {
          key: 'view',
          label: t('roster.actions.view'),
          showLabel: true,
          primary: true,
          onClick: () => setFilters({ open: row.id }, { resetPage: false }),
        },
        ...rowActions(row),
      ],
      { width: 180, maxInline: 1, title: t('roster.columns.actions'), variant: 'standard' },
    ),
  ];

  const opened = filters.open ? (items.find((row) => row.id === filters.open) ?? null) : null;
  const openedCan = opened ? abilitiesOf(opened) : null;
  const drawerActions: MemberDetailActions =
    opened && openedCan
      ? {
          onEdit: openedCan.edit ? () => setEditing(opened) : undefined,
          onResetPassword: openedCan.resetPassword ? () => setResetting(opened) : undefined,
          onSetLocked: openedCan.lock ? (locked) => handleLock(opened, locked) : undefined,
          lockPending: setLock.isPending,
          onRemove: openedCan.remove ? () => handleRemove(opened) : undefined,
          onRevoke: openedCan.revoke ? () => handleRevoke(opened) : undefined,
        }
      : {};

  return (
    <div className={styles.page}>
      <ManagePageHeader
        title={t('page.title')}
        subtitle={t('page.subtitle')}
        extra={
          <div className={styles.headerActions}>
            {rolesHref ? (
              <Link href={rolesHref}>
                <Button icon={<SafetyCertificateOutlined />}>{t('roster.rolesButton')}</Button>
              </Link>
            ) : null}
            {addButton}
          </div>
        }
      />

      <FilterBar
        fields={filterFields}
        values={{
          q: filters.q,
          roleKey: filters.roleKey ?? ALL_FILTER,
          status: filters.status ?? ALL_FILTER,
        }}
        onChange={(patch) => setFilters(patch)}
        onClear={
          hasFilters
            ? () => setFilters({ q: undefined, roleKey: undefined, status: undefined })
            : undefined
        }
        searchDebounceMs={300}
      />

      <DataTable<MemberRosterItem>
        label={t('roster.tableLabel')}
        columns={columns}
        items={items}
        rowKey={(row) => `${row.kind}:${row.id}`}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data ? { title: t('roster.loadError'), onRetry: () => void refetch() } : null
        }
        empty={{
          title: t('roster.empty'),
          description: t('roster.emptyHint'),
          action: addButton ?? undefined,
        }}
        noResults={{ title: t('roster.emptyFiltered') }}
        selectedRowKey={opened ? `${opened.kind}:${opened.id}` : null}
        pagination={{
          meta,
          onChange: (page, limit) => setFilters({ page, limit }, { resetPage: false }),
          totalLabel: (total) => t('roster.total', { count: total }),
        }}
      />

      <MemberDetailDrawer
        item={opened}
        open={Boolean(opened)}
        rolesHref={rolesHref}
        isSelf={opened ? isSelf(opened) : false}
        actions={drawerActions}
        onClose={() => setFilters({ open: undefined }, { resetPage: false })}
      />

      <MemberEditDialog member={editing} onClose={() => setEditing(null)} />
      <ResetPasswordDialog member={resetting} onClose={() => setResetting(null)} />
      <StaffAccountDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
