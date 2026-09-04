'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Select, Tag } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  PERMISSION,
  PLAN_FEATURE,
  TENANT_ROLE,
  type MembershipStatus,
  type TenantRole,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FeatureWriteTooltip } from '@/components/feedback/FeatureWriteTooltip';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePermissions } from '@/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { MEMBERS_DEFAULT_LIMIT } from '@/features/members/api';
import { InviteMemberModal } from '@/features/members/components/InviteMemberModal';
import { PendingInvitesPanel } from '@/features/members/components/PendingInvitesPanel';
import { ALL_ROLES, ASSIGNABLE_ROLES, MEMBERSHIP_STATUS_META } from '@/features/members/constants';
import { useMembers } from '@/features/members/hooks/use-members';
import {
  useRemoveMember,
  useUpdateMemberRole,
} from '@/features/members/hooks/use-member-mutations';
import type { Member, MemberFilters, UpdateMemberRoleInput } from '@/features/members/types';
import styles from './members-page.module.css';

/** Suy từ tổng bề rộng cột (P25). Figma `127:1725` ghi 580px cho 5 cột; code có 4. */
const MIN_TABLE_WIDTH = 720;

export default function MembersPage() {
  const t = useTranslations('Members');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const { has } = usePermissions();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { data: me } = useCurrentUser();

  // Bộ lọc của trang này là state CỤC BỘ (không nằm trên URL) — giữ nguyên, đưa lên URL là
  // đổi hành vi ngoài phạm vi wave giao diện.
  const [filters, setFilters] = useState<MemberFilters>({});
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data, isError, refetch, isFetching } = useMembers(filters);
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();

  const canInvite = has(PERMISSION.MEMBER_INVITE);
  const canUpdate = has(PERMISSION.MEMBER_UPDATE_ROLE);
  const canRemove = has(PERMISSION.MEMBER_REMOVE);

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: MEMBERS_DEFAULT_LIMIT, total: 0, hasNext: false };

  // Nhãn vai trò dựng lúc render qua `Domain.tenantRole` — mã đi trên dây không đổi theo ngôn ngữ.
  const roleOptions = (roles: readonly TenantRole[]) =>
    roles.map((role) => ({ value: role, label: domainLabel('tenantRole', role) }));

  const filterFields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.search'),
      placeholder: t('filters.searchPlaceholder'),
    },
    {
      kind: 'select',
      key: 'roleKey',
      label: t('filters.role'),
      options: [{ value: 'all', label: t('filters.allRoles') }, ...roleOptions(ALL_ROLES)],
      allowClear: false,
    },
  ];

  function patch(next: Partial<MemberFilters>) {
    setFilters((prev) => ({ ...prev, ...next, ...('page' in next ? {} : { page: 1 }) }));
  }

  function handleRoleChange(userId: string, roleKey: string) {
    updateRole.mutate(
      { userId, roleKey: roleKey as UpdateMemberRoleInput['roleKey'] },
      {
        onSuccess: () => message.success(t('toast.roleChanged')),
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  function handleRemove(userId: string) {
    removeMember.mutate(userId, {
      onSuccess: () => message.success(t('toast.removed')),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  // Nhân viên & phân quyền là tính năng của GÓI (ADR 0027): hết hạn thì xem được danh sách,
  // không thêm được người. Lớp chặn thật là `PlanFeatureGuard` ở backend.
  const inviteButton = canInvite ? (
    <FeatureWriteTooltip feature={PLAN_FEATURE.MEMBERS}>
      {(disabled) => (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={disabled}
          onClick={() => setInviteOpen(true)}
        >
          {t('actions.invite')}
        </Button>
      )}
    </FeatureWriteTooltip>
  ) : null;

  const columns: DataTableColumn<Member>[] = [
    {
      title: t('columns.member'),
      key: 'member',
      width: 280,
      render: (_, row) => (
        <EntityIdentity
          kind="person"
          size="sm"
          imageUrl={row.avatarUrl}
          initialSource={row.displayName}
          name={
            <>
              {row.displayName}
              {row.userId === me?.id ? <span className={styles.you}> {t('you')}</span> : null}
            </>
          }
          subtitle={row.email ?? tCommon('labels.emptyValue')}
        />
      ),
    },
    {
      title: t('columns.role'),
      key: 'role',
      width: 200,
      render: (_, row) => {
        // Chủ gian hàng không đổi vai trò được từ đây, và không ai tự đổi vai trò của mình.
        const isOwner = row.roleKey === TENANT_ROLE.SHOP_OWNER;
        const editable = canUpdate && !isOwner && row.userId !== me?.id;
        return editable ? (
          <Select
            size="small"
            className={styles.roleSelect}
            aria-label={t('roleSelectAria', { name: row.displayName })}
            value={row.roleKey}
            options={roleOptions(ASSIGNABLE_ROLES)}
            loading={updateRole.isPending && updateRole.variables?.userId === row.userId}
            onChange={(value: string) => handleRoleChange(row.userId, value)}
          />
        ) : (
          // KHÔNG chuyển sang `StatusTag`: đây là NHÃN VAI TRÒ, không phải trạng thái nghiệp vụ,
          // và `@xeprime/types` không có `TENANT_ROLE_META` — chuyển sẽ phải bịa màu (P5).
          <Tag color={isOwner ? 'gold' : 'default'}>
            {domainLabel('tenantRole', row.roleKey, row.roleKey)}
          </Tag>
        );
      },
    },
    {
      title: t('columns.status'),
      key: 'status',
      width: 130,
      render: (_, row) => (
        <StatusTag value={row.status as MembershipStatus} meta={MEMBERSHIP_STATUS_META} group="membershipStatus" />
      ),
    },
    actionColumn<Member>((row) => [
      {
        key: 'remove',
        label: t('actions.remove'),
        icon: <DeleteOutlined />,
        danger: true,
        // Ba điều kiện y hệt trước migrate: có quyền, không phải chủ shop, không phải chính mình.
        hidden: !canRemove || row.roleKey === TENANT_ROLE.SHOP_OWNER || row.userId === me?.id,
        loading: removeMember.isPending && removeMember.variables === row.userId,
        confirm: {
          title: t('actions.removeConfirm'),
          okText: tCommon('actions.remove'),
          cancelText: tCommon('actions.close'),
        },
        onClick: () => handleRemove(row.userId),
      },
    ]),
  ];

  return (
    <div>
      <ManagePageHeader title={t('page.title')} />

      <FilterBar
        fields={filterFields}
        values={{ q: filters.q, roleKey: filters.roleKey ?? 'all' }}
        onChange={(next) =>
          patch({ q: next.q, roleKey: next.roleKey === 'all' ? undefined : next.roleKey })
        }
        actions={inviteButton}
      />

      <DataTable<Member>
        label={t('page.tableLabel')}
        columns={columns}
        items={items}
        rowKey={(row) => row.userId}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data ? { title: t('page.loadError'), onRetry: () => void refetch() } : null
        }
        empty={{ title: t('page.empty'), action: inviteButton ?? undefined }}
        pagination={{
          meta,
          onChange: (page, pageSize) => patch({ page, limit: pageSize }),
          totalLabel: (total) => t('page.total', { count: total }),
        }}
      />

      <PendingInvitesPanel />

      <InviteMemberModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}
