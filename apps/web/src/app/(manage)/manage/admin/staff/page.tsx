'use client';

import { DeleteOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';
import { App, Avatar, Button, Empty, Input, Popconfirm, Result, Select, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import {
  PLATFORM_ROLE,
  PLATFORM_ROLE_LABEL,
  type MembershipStatus,
  type PlatformRole,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { useCurrentUser } from '@/hooks/use-current-user';
import { getErrorMessage } from '@/services/api-client';
import { STAFF_DEFAULT_LIMIT } from '@/features/admin-staff/api';
import { AddStaffModal } from '@/features/admin-staff/components/AddStaffModal';
import { PLATFORM_ROLE_OPTIONS } from '@/features/admin-staff/constants';
import { useStaff } from '@/features/admin-staff/hooks/use-staff';
import {
  useRemoveStaff,
  useUpdateStaffRole,
} from '@/features/admin-staff/hooks/use-staff-mutations';
import { MEMBERSHIP_STATUS_META } from '@/features/members/constants';
import type { Staff, StaffFilters, UpdateStaffRoleInput } from '@/features/admin-staff/types';
import styles from './staff-page.module.css';

const ROLE_FILTER_OPTIONS = [{ value: 'all', label: 'Tất cả vai trò' }, ...PLATFORM_ROLE_OPTIONS];

export default function AdminStaffPage() {
  const { message } = App.useApp();
  const { data: me } = useCurrentUser();

  const [filters, setFilters] = useState<StaffFilters>({});
  const [addOpen, setAddOpen] = useState(false);

  const { data, isError, refetch, isFetching } = useStaff(filters);
  const updateRole = useUpdateStaffRole();
  const removeStaff = useRemoveStaff();

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: STAFF_DEFAULT_LIMIT, total: 0, hasNext: false };

  function patch(next: Partial<StaffFilters>) {
    setFilters((prev) => ({ ...prev, ...next, ...('page' in next ? {} : { page: 1 }) }));
  }

  function handleRoleChange(userId: string, roleKey: string) {
    updateRole.mutate(
      { userId, roleKey: roleKey as UpdateStaffRoleInput['roleKey'] },
      {
        onSuccess: () => message.success('Đã đổi vai trò'),
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  }

  function handleRemove(userId: string) {
    removeStaff.mutate(userId, {
      onSuccess: () => message.success('Đã gỡ nhân sự'),
      onError: (err) => message.error(getErrorMessage(err)),
    });
  }

  const columns: ColumnsType<Staff> = [
    {
      title: 'Nhân sự',
      key: 'staff',
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
      width: 220,
      render: (_, row) => {
        // BE chặn tự thao tác mình + hạ Super Admin cuối cùng; FE chỉ khoá dòng của chính mình.
        const editable = row.userId !== me?.id;
        return editable ? (
          <Select
            size="small"
            className={styles.roleSelect}
            value={row.roleKey}
            options={PLATFORM_ROLE_OPTIONS}
            loading={updateRole.isPending && updateRole.variables?.userId === row.userId}
            onChange={(value: string) => handleRoleChange(row.userId, value)}
          />
        ) : (
          <Tag color={row.roleKey === PLATFORM_ROLE.PLATFORM_ADMIN ? 'gold' : 'default'}>
            {PLATFORM_ROLE_LABEL[row.roleKey as PlatformRole] ?? row.roleKey}
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
        row.userId !== me?.id ? (
          <Popconfirm
            title="Gỡ nhân sự này khỏi nền tảng?"
            okText="Gỡ"
            okButtonProps={{ danger: true }}
            cancelText="Đóng"
            onConfirm={() => handleRemove(row.userId)}
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              loading={removeStaff.isPending && removeStaff.variables === row.userId}
            />
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <div>
      <ManagePageHeader
        title="Nhân sự nền tảng"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            Thêm nhân sự
          </Button>
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
          title="Không tải được danh sách nhân sự"
          extra={
            <Button type="primary" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : !isFetching && items.length === 0 ? (
        <Empty className={styles.state} description="Chưa có nhân sự nào">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            Thêm nhân sự
          </Button>
        </Empty>
      ) : (
        <Table<Staff>
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
            showTotal: (total) => `${total} nhân sự`,
            onChange: (page, pageSize) => patch({ page, limit: pageSize }),
          }}
        />
      )}

      <AddStaffModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
