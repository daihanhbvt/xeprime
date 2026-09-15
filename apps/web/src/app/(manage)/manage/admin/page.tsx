'use client';

import { Segmented, Select, Space, Spin } from 'antd';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';
import { APPROVAL_TARGET_TYPE, APPROVAL_STATUS_VALUES, type ApprovalStatus } from '@xeprime/types';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ApprovalDetailDrawer } from '@/features/approvals/components/ApprovalDetailDrawer';
import { ApprovalTable } from '@/features/approvals/components/ApprovalTable';
import { APPROVALS_DEFAULT_LIMIT } from '@/features/approvals/api';
import { useApprovalFilters } from '@/features/approvals/hooks/use-approval-filters';
import { useApprovals } from '@/features/approvals/hooks/use-approvals';
import { useDomainLabel } from '@/i18n/use-domain-label';
import styles from './admin-page.module.css';

const ALL = 'all';

export default function AdminApprovalsPage() {
  return (
    <Suspense fallback={<Spin size="large" className={styles.state} />}>
      <AdminApprovalsView />
    </Suspense>
  );
}

/**
 * Hàng đợi duyệt hồ sơ của nền tảng.
 *
 * Bộ lọc loại phiếu liệt kê ĐỦ các loại có mặt trong bảng, không chỉ hai loại duyệt được ở đây:
 * phiếu `seller_profile` do `SellerProfileService` ghi vào cùng `approval_tasks` và vẫn hiện
 * trong danh sách, nên giấu nó khỏi bộ lọc chỉ khiến reviewer không lọc nó ra được. Việc "duyệt
 * ở đâu" do drawer nói (`Approvals.unsupported`).
 */
function AdminApprovalsView() {
  const t = useTranslations('Approvals');
  const domainLabel = useDomainLabel();
  const { filters, setFilters } = useApprovalFilters();
  const { data, isError, refetch, isFetching } = useApprovals(filters);
  const [selected, setSelected] = useState<string | null>(null);

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: APPROVALS_DEFAULT_LIMIT, total: 0, hasNext: false };

  const statusOptions = [
    { value: ALL, label: t('filters.all') },
    ...APPROVAL_STATUS_VALUES.map((value: ApprovalStatus) => ({
      value,
      label: domainLabel('approvalStatus', value, value),
    })),
  ];
  const targetOptions = [
    { value: ALL, label: t('filters.all') },
    { value: APPROVAL_TARGET_TYPE.TENANT, label: t(`targetType.${APPROVAL_TARGET_TYPE.TENANT}`) },
    { value: APPROVAL_TARGET_TYPE.VEHICLE, label: t(`targetType.${APPROVAL_TARGET_TYPE.VEHICLE}`) },
    {
      value: APPROVAL_TARGET_TYPE.SELLER_PROFILE,
      label: t(`targetType.${APPROVAL_TARGET_TYPE.SELLER_PROFILE}`),
    },
  ];

  return (
    <div>
      <ManagePageHeader
        title={t('page.title')}
        extra={
          <Space wrap>
            <Segmented
              value={filters.targetType ?? ALL}
              options={targetOptions}
              onChange={(value) =>
                setFilters({ targetType: value === ALL ? undefined : String(value) })
              }
            />
            <Select
              className={styles.statusSelect}
              size="large"
              value={filters.status ?? 'pending'}
              options={statusOptions}
              onChange={(value: string) => setFilters({ status: value })}
            />
          </Space>
        }
      />

      <ApprovalTable
        items={items}
        meta={meta}
        loading={isFetching}
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        onView={(id) => setSelected(id)}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />

      <ApprovalDetailDrawer taskId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
