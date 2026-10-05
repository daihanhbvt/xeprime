'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Select, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { PLATFORM_ROLE, type MembershipStatus } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ALL_FILTER } from '@/constants/filters';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { STAFF_DEFAULT_LIMIT } from '@/features/admin-staff/api';
import { AddStaffModal } from '@/features/admin-staff/components/AddStaffModal';
import { usePlatformRoleOptions } from '@/features/admin-staff/constants';
import { useStaff } from '@/features/admin-staff/hooks/use-staff';
import {
  useRemoveStaff,
  useUpdateStaffRole,
} from '@/features/admin-staff/hooks/use-staff-mutations';
import { MEMBERSHIP_STATUS_META } from '@/features/members/constants';
import type { Staff, StaffFilters, UpdateStaffRoleInput } from '@/features/admin-staff/types';
import styles from './staff-page.module.css';

/** Figma `127:1725` ghi 680px cho bảng Platform Staff; code có 4 cột nên rộng hơn một chút. */
const MIN_TABLE_WIDTH = 740;

export default function AdminStaffPage() {
  const t = useTranslations('AdminStaff');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const dl = useDomainLabel();
  const roleOptions = usePlatformRoleOptions();
  const { data: me } = useCurrentUser();

  const [filters, setFilters] = useState<StaffFilters>({});
  const [addOpen, setAddOpen] = useState(false);

  const { data, isError, refetch, isFetching } = useStaff(filters);
  const updateRole = useUpdateStaffRole();
  const removeStaff = useRemoveStaff();

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: STAFF_DEFAULT_LIMIT, total: 0, hasNext: false };

  const filterFields: FilterField[] = useMemo(
    () => [
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
        options: [{ value: ALL_FILTER, label: t('filters.allRoles') }, ...roleOptions],
        allowClear: false,
      },
    ],
    [t, roleOptions],
  );

  function patch(next: Partial<StaffFilters>) {
    setFilters((prev) => ({ ...prev, ...next, ...('page' in next ? {} : { page: 1 }) }));
  }

  function handleRoleChange(userId: string, roleKey: string) {
    updateRole.mutate(
      { userId, roleKey: roleKey as UpdateStaffRoleInput['roleKey'] },
      {
        onSuccess: () => message.success(t('toast.roleChanged')),
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  function handleRemove(userId: string) {
    removeStaff.mutate(userId, {
      onSuccess: () => message.success(t('toast.removed')),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  const addButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
      {t('actions.add')}
    </Button>
  );

  const columns: DataTableColumn<Staff>[] = [
    {
      title: t('columns.staff'),
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
              {row.userId === me?.id ? <span className={styles.you}> {t('page.you')}</span> : null}
            </>
          }
          subtitle={row.email ?? '—'}
        />
      ),
    },
    {
      title: t('columns.role'),
      key: 'role',
      width: 220,
      render: (_, row) => {
        // BE chặn tự thao tác mình + hạ Super Admin cuối cùng; FE chỉ khoá dòng của chính mình.
        const editable = row.userId !== me?.id;
        return editable ? (
          <Select
            size="small"
            className={styles.roleSelect}
            aria-label={t('roleOf', { name: row.displayName })}
            value={row.roleKey}
            options={roleOptions}
            loading={updateRole.isPending && updateRole.variables?.userId === row.userId}
            onChange={(value: string) => handleRoleChange(row.userId, value)}
          />
        ) : (
          // Nhãn vai trò, KHÔNG phải trạng thái nghiệp vụ — không chuyển sang `StatusTag` (P5).
          <Tag color={row.roleKey === PLATFORM_ROLE.PLATFORM_ADMIN ? 'gold' : 'default'}>
            {dl('platformRole', row.roleKey)}
          </Tag>
        );
      },
    },
    {
      title: t('columns.status'),
      key: 'status',
      width: 130,
      render: (_, row) => (
        <StatusTag
          value={row.status as MembershipStatus}
          meta={MEMBERSHIP_STATUS_META}
          group="membershipStatus"
        />
      ),
    },
    actionColumn<Staff>((row) => [
      {
        key: 'remove',
        label: t('actions.remove'),
        icon: <DeleteOutlined />,
        danger: true,
        hidden: row.userId === me?.id,
        loading: removeStaff.isPending && removeStaff.variables === row.userId,
        confirm: {
          title: t('actions.removeConfirm'),
          okText: t('actions.removeOk'),
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
        values={{ q: filters.q, roleKey: filters.roleKey ?? ALL_FILTER }}
        onChange={(next) =>
          // FilterBar chỉ gửi ô vừa đổi — dựng lại cả hai khoá là xoá mất ô còn lại.
          patch({
            ...('q' in next ? { q: next.q } : {}),
            ...('roleKey' in next
              ? { roleKey: next.roleKey === ALL_FILTER ? undefined : next.roleKey }
              : {}),
          })
        }
        actions={addButton}
      />

      <DataTable<Staff>
        label={t('page.tableLabel')}
        columns={columns}
        items={items}
        rowKey={(row) => row.userId}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data ? { title: t('states.loadError'), onRetry: () => void refetch() } : null
        }
        empty={{ title: t('states.empty'), action: addButton }}
        pagination={{
          meta,
          onChange: (page, pageSize) => patch({ page, limit: pageSize }),
          totalLabel: (total) => t('page.total', { total }),
        }}
      />

      <AddStaffModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
