'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Select, Tag } from 'antd';
import { useState } from 'react';
import {
  PERMISSION,
  TENANT_ROLE,
  TENANT_ROLE_LABEL,
  type MembershipStatus,
  type TenantRole,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorMessage } from '@/services/api-client';
import { MEMBERS_DEFAULT_LIMIT } from '@/features/members/api';
import { AddMemberModal } from '@/features/members/components/AddMemberModal';
import {
  ALL_ROLE_OPTIONS,
  ASSIGNABLE_ROLE_OPTIONS,
  MEMBERSHIP_STATUS_META,
} from '@/features/members/constants';
import { useMembers } from '@/features/members/hooks/use-members';
import {
  useRemoveMember,
  useUpdateMemberRole,
} from '@/features/members/hooks/use-member-mutations';
import type { Member, MemberFilters, UpdateMemberRoleInput } from '@/features/members/types';
import styles from './members-page.module.css';

const FILTER_FIELDS: FilterField[] = [
  { kind: 'search', key: 'q', label: 'Tìm thành viên', placeholder: 'Tìm theo tên hoặc email' },
  {
    kind: 'select',
    key: 'roleKey',
    label: 'Vai trò',
    options: [{ value: 'all', label: 'Tất cả vai trò' }, ...ALL_ROLE_OPTIONS],
    allowClear: false,
  },
];

/** Suy từ tổng bề rộng cột (P25). Figma `127:1725` ghi 580px cho 5 cột; code có 4. */
const MIN_TABLE_WIDTH = 720;

export default function MembersPage() {
  const { message } = App.useApp();
  const { has } = usePermissions();
  const { data: me } = useCurrentUser();

  // Bộ lọc của trang này là state CỤC BỘ (không nằm trên URL) — giữ nguyên, đưa lên URL là
  // đổi hành vi ngoài phạm vi wave giao diện.
  const [filters, setFilters] = useState<MemberFilters>({});
  const [addOpen, setAddOpen] = useState(false);

  const { data, isError, refetch, isFetching } = useMembers(filters);
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();

  const canInvite = has(PERMISSION.MEMBER_INVITE);
  const canUpdate = has(PERMISSION.MEMBER_UPDATE_ROLE);
  const canRemove = has(PERMISSION.MEMBER_REMOVE);

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: MEMBERS_DEFAULT_LIMIT, total: 0, hasNext: false };

  function patch(next: Partial<MemberFilters>) {
    setFilters((prev) => ({ ...prev, ...next, ...('page' in next ? {} : { page: 1 }) }));
  }

  function handleRoleChange(userId: string, roleKey: string) {
    updateRole.mutate(
      { userId, roleKey: roleKey as UpdateMemberRoleInput['roleKey'] },
      {
        onSuccess: () => message.success('Đã đổi vai trò'),
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  }

  function handleRemove(userId: string) {
    removeMember.mutate(userId, {
      onSuccess: () => message.success('Đã gỡ thành viên'),
      onError: (err) => message.error(getErrorMessage(err)),
    });
  }

  const inviteButton = canInvite ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
      Thêm thành viên
    </Button>
  ) : null;

  const columns: DataTableColumn<Member>[] = [
    {
      title: 'Thành viên',
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
              {row.userId === me?.id ? <span className={styles.you}> (bạn)</span> : null}
            </>
          }
          subtitle={row.email ?? '—'}
        />
      ),
    },
    {
      title: 'Vai trò',
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
            aria-label={`Vai trò của ${row.displayName}`}
            value={row.roleKey}
            options={ASSIGNABLE_ROLE_OPTIONS}
            loading={updateRole.isPending && updateRole.variables?.userId === row.userId}
            onChange={(value: string) => handleRoleChange(row.userId, value)}
          />
        ) : (
          // KHÔNG chuyển sang `StatusTag`: đây là NHÃN VAI TRÒ, không phải trạng thái nghiệp vụ,
          // và `@xeprime/types` không có `TENANT_ROLE_META` — chuyển sẽ phải bịa màu (P5).
          <Tag color={isOwner ? 'gold' : 'default'}>
            {TENANT_ROLE_LABEL[row.roleKey as TenantRole] ?? row.roleKey}
          </Tag>
        );
      },
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 130,
      render: (_, row) => (
        <StatusTag value={row.status as MembershipStatus} meta={MEMBERSHIP_STATUS_META} />
      ),
    },
    actionColumn<Member>((row) => [
      {
        key: 'remove',
        label: 'Gỡ thành viên',
        icon: <DeleteOutlined />,
        danger: true,
        // Ba điều kiện y hệt trước migrate: có quyền, không phải chủ shop, không phải chính mình.
        hidden: !canRemove || row.roleKey === TENANT_ROLE.SHOP_OWNER || row.userId === me?.id,
        loading: removeMember.isPending && removeMember.variables === row.userId,
        confirm: { title: 'Gỡ thành viên này?', okText: 'Gỡ', cancelText: 'Đóng' },
        onClick: () => handleRemove(row.userId),
      },
    ]),
  ];

  return (
    <div>
      <ManagePageHeader title="Người dùng" />

      <FilterBar
        fields={FILTER_FIELDS}
        values={{ q: filters.q, roleKey: filters.roleKey ?? 'all' }}
        onChange={(next) =>
          patch({ q: next.q, roleKey: next.roleKey === 'all' ? undefined : next.roleKey })
        }
        actions={inviteButton}
      />

      <DataTable<Member>
        label="Danh sách thành viên"
        columns={columns}
        items={items}
        rowKey={(row) => row.userId}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data
            ? { title: 'Không tải được danh sách thành viên', onRetry: () => void refetch() }
            : null
        }
        empty={{ title: 'Chưa có thành viên nào', action: inviteButton ?? undefined }}
        pagination={{
          meta,
          onChange: (page, pageSize) => patch({ page, limit: pageSize }),
          totalLabel: (total) => `${total} thành viên`,
        }}
      />

      <AddMemberModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
