'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Select, Tag } from 'antd';
import { useState } from 'react';
import {
  PLATFORM_ROLE,
  PLATFORM_ROLE_LABEL,
  type MembershipStatus,
  type PlatformRole,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
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

const FILTER_FIELDS: FilterField[] = [
  { kind: 'search', key: 'q', label: 'Tìm nhân sự', placeholder: 'Tìm theo tên hoặc email' },
  {
    kind: 'select',
    key: 'roleKey',
    label: 'Vai trò',
    options: [{ value: 'all', label: 'Tất cả vai trò' }, ...PLATFORM_ROLE_OPTIONS],
    allowClear: false,
  },
];

/** Figma `127:1725` ghi 680px cho bảng Platform Staff; code có 4 cột nên rộng hơn một chút. */
const MIN_TABLE_WIDTH = 740;

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

  const addButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
      Thêm nhân sự
    </Button>
  );

  const columns: DataTableColumn<Staff>[] = [
    {
      title: 'Nhân sự',
      key: 'staff',
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
      width: 220,
      render: (_, row) => {
        // BE chặn tự thao tác mình + hạ Super Admin cuối cùng; FE chỉ khoá dòng của chính mình.
        const editable = row.userId !== me?.id;
        return editable ? (
          <Select
            size="small"
            className={styles.roleSelect}
            aria-label={`Vai trò của ${row.displayName}`}
            value={row.roleKey}
            options={PLATFORM_ROLE_OPTIONS}
            loading={updateRole.isPending && updateRole.variables?.userId === row.userId}
            onChange={(value: string) => handleRoleChange(row.userId, value)}
          />
        ) : (
          // Nhãn vai trò, KHÔNG phải trạng thái nghiệp vụ — không chuyển sang `StatusTag` (P5).
          <Tag color={row.roleKey === PLATFORM_ROLE.PLATFORM_ADMIN ? 'gold' : 'default'}>
            {PLATFORM_ROLE_LABEL[row.roleKey as PlatformRole] ?? row.roleKey}
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
    actionColumn<Staff>((row) => [
      {
        key: 'remove',
        label: 'Gỡ nhân sự',
        icon: <DeleteOutlined />,
        danger: true,
        hidden: row.userId === me?.id,
        loading: removeStaff.isPending && removeStaff.variables === row.userId,
        confirm: { title: 'Gỡ nhân sự này khỏi nền tảng?', okText: 'Gỡ', cancelText: 'Đóng' },
        onClick: () => handleRemove(row.userId),
      },
    ]),
  ];

  return (
    <div>
      <ManagePageHeader title="Nhân sự nền tảng" />

      <FilterBar
        fields={FILTER_FIELDS}
        values={{ q: filters.q, roleKey: filters.roleKey ?? 'all' }}
        onChange={(next) =>
          patch({ q: next.q, roleKey: next.roleKey === 'all' ? undefined : next.roleKey })
        }
        actions={addButton}
      />

      <DataTable<Staff>
        label="Danh sách nhân sự nền tảng"
        columns={columns}
        items={items}
        rowKey={(row) => row.userId}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data
            ? { title: 'Không tải được danh sách nhân sự', onRetry: () => void refetch() }
            : null
        }
        empty={{ title: 'Chưa có nhân sự nào', action: addButton }}
        pagination={{
          meta,
          onChange: (page, pageSize) => patch({ page, limit: pageSize }),
          totalLabel: (total) => `${total} nhân sự`,
        }}
      />

      <AddStaffModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
