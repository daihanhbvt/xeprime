'use client';

import { Button, Empty, Result, Segmented, Select, Space, Spin } from 'antd';
import { Suspense, useState } from 'react';
import { APPROVAL_TARGET_TYPE } from '@xeprime/types';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ApprovalDetailDrawer } from '@/features/approvals/components/ApprovalDetailDrawer';
import { ApprovalTable } from '@/features/approvals/components/ApprovalTable';
import { APPROVALS_DEFAULT_LIMIT } from '@/features/approvals/api';
import { APPROVAL_STATUS_OPTIONS } from '@/features/approvals/constants';
import { useApprovalFilters } from '@/features/approvals/hooks/use-approval-filters';
import { useApprovals } from '@/features/approvals/hooks/use-approvals';
import styles from './admin-page.module.css';

const STATUS_OPTIONS = [{ value: 'all', label: 'Tất cả' }, ...APPROVAL_STATUS_OPTIONS];
const TARGET_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: APPROVAL_TARGET_TYPE.TENANT, label: 'Gian hàng' },
  { value: APPROVAL_TARGET_TYPE.VEHICLE, label: 'Xe' },
];

export default function AdminApprovalsPage() {
  return (
    <Suspense fallback={<Spin size="large" className={styles.state} />}>
      <AdminApprovalsView />
    </Suspense>
  );
}

function AdminApprovalsView() {
  const { filters, setFilters } = useApprovalFilters();
  const { data, isError, refetch, isFetching } = useApprovals(filters);
  const [selected, setSelected] = useState<string | null>(null);

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: APPROVALS_DEFAULT_LIMIT, total: 0, hasNext: false };

  return (
    <div>
      <ManagePageHeader
        title="Duyệt hồ sơ"
        extra={
          <Space wrap>
            <Segmented
              value={filters.targetType ?? 'all'}
              options={TARGET_OPTIONS}
              onChange={(value) =>
                setFilters({ targetType: value === 'all' ? undefined : String(value) })
              }
            />
            <Select
              className={styles.statusSelect}
              size="large"
              value={filters.status ?? 'pending'}
              options={STATUS_OPTIONS}
              onChange={(value: string) => setFilters({ status: value })}
            />
          </Space>
        }
      />

      {isError && !data ? (
        <Result
          status="error"
          title="Không tải được hàng đợi duyệt"
          extra={
            <Button type="primary" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : !isFetching && items.length === 0 ? (
        <Empty className={styles.state} description="Không có phiếu nào" />
      ) : (
        <ApprovalTable
          items={items}
          meta={meta}
          loading={isFetching}
          onView={(id) => setSelected(id)}
          onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
        />
      )}

      <ApprovalDetailDrawer taskId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
