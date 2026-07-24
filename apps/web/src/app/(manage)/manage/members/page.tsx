'use client';

import { DeleteOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';
import { App, Avatar, Button, Empty, Input, Popconfirm, Result, Select, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import {
  PERMISSION,
  TENANT_ROLE,
  TENANT_ROLE_LABEL,
  type MembershipStatus,
  type TenantRole,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
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

const ROLE_FILTER_OPTIONS = [{ value: 'all', label: 'Tất cả vai trò' }, ...ALL_ROLE_OPTIONS];

export default function MembersPage() {
  const { message } = App.useApp();
  const { has } = usePermissions();
  const { data: me } = useCurrentUser();

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
    setFilters((prev) => ({ ...prev, ...next, ...(('page' in next) ? {} : { page: 1 }) }));
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

  const columns: ColumnsType<Member> = [
    {
      title: 'Thành viên',
      key: 'member',
      render: (_, row) => (
        <div className={styles.cell}>
          <Avatar src={row.avatarUrl ?? undefined} icon={<UserOutlined />}>
            {(row.displayName || '?').charAt(0).toUpperCase()}
          </Avatar>
          <div>
            <div className={styles.name}>
              {row.displayName}
              {row.userId === me?.id ? <span className={styles.you}> (bạn)</span> : null}
            </div>
            <div className={styles.meta}>{row.email ?? '—'}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Vai trò',
      key: 'role',
      width: 200,
      render: (_, row) => {
        const isOwner = row.roleKey === TENANT_ROLE.SHOP_OWNER;
        const editable = canUpdate && !isOwner && row.userId !== me?.id;
        return editable ? (
          <Select
            size="small"
            className={styles.roleSelect}
            value={row.roleKey}
            options={ASSIGNABLE_ROLE_OPTIONS}
            loading={updateRole.isPending && updateRole.variables?.userId === row.userId}
            onChange={(value: string) => handleRoleChange(row.userId, value)}
          />
        ) : (
          <Tag color={isOwner ? 'gold' : 'default'}>
            {TENANT_ROLE_LABEL[row.roleKey as TenantRole] ?? row.roleKey}
          </Tag>
        );
      },
    },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_, row) => (
        <StatusTag value={row.status as MembershipStatus} meta={MEMBERSHIP_STATUS_META} />
      ),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      width: 70,
      render: (_, row) =>
        canRemove && row.roleKey !== TENANT_ROLE.SHOP_OWNER && row.userId !== me?.id ? (
          <Popconfirm
            title="Gỡ thành viên này?"
            okText="Gỡ"
            okButtonProps={{ danger: true }}
            cancelText="Đóng"
            onConfirm={() => handleRemove(row.userId)}
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              loading={removeMember.isPending && removeMember.variables === row.userId}
            />
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <div>
      <ManagePageHeader
        title="Người dùng"
        extra={
          canInvite ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
              Thêm thành viên
            </Button>
          ) : null
        }
      />

      <div className={styles.filters}>
        <Input.Search
          className={styles.search}
          allowClear
          size="large"
          placeholder="Tìm theo tên hoặc email"
          defaultValue={filters.q}
          onSearch={(value) => patch({ q: value || undefined })}
        />
        <Select
          className={styles.roleFilter}
          size="large"
          value={filters.roleKey ?? 'all'}
          options={ROLE_FILTER_OPTIONS}
          onChange={(value: string) => patch({ roleKey: value === 'all' ? undefined : value })}
        />
      </div>

      {isError && !data ? (
        <Result
          status="error"
          title="Không tải được danh sách thành viên"
          extra={
            <Button type="primary" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : !isFetching && items.length === 0 ? (
        <Empty className={styles.state} description="Chưa có thành viên nào">
          {canInvite ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
              Thêm thành viên
            </Button>
          ) : null}
        </Empty>
      ) : (
        <Table<Member>
          rowKey="userId"
          columns={columns}
          dataSource={items}
          loading={isFetching}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: meta.page,
            pageSize: meta.limit,
            total: meta.total,
            showSizeChanger: true,
            showTotal: (total) => `${total} thành viên`,
            onChange: (page, pageSize) => patch({ page, limit: pageSize }),
          }}
        />
      )}

      <AddMemberModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
