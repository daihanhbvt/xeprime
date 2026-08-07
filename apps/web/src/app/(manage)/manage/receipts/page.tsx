'use client';

import { PlusOutlined, TagsOutlined } from '@ant-design/icons';
import { App, Button, Select, Space, Spin } from 'antd';
import { Suspense, useState } from 'react';
import { PERMISSION } from '@xeprime/types';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { usePermissions } from '@/hooks/use-permissions';
import {
  RECEIPTS_DEFAULT_LIMIT,
  RECEIPT_STATUS_OPTIONS,
  RECEIPT_TYPE_OPTIONS,
} from '@/features/finance/constants';
import { CategoryManagerModal } from '@/features/finance/components/CategoryManagerModal';
import { ReceiptFormDrawer } from '@/features/finance/components/ReceiptFormDrawer';
import { ReceiptTable } from '@/features/finance/components/ReceiptTable';
import { useReceiptFilters } from '@/features/finance/hooks/use-receipt-filters';
import { useReceipts } from '@/features/finance/hooks/use-receipts';
import {
  useApproveReceipt,
  useCancelReceipt,
} from '@/features/finance/hooks/use-receipt-mutations';
import { getErrorMessage } from '@/services/api-client';
import styles from './receipts-page.module.css';

const TYPE_OPTIONS = [{ value: 'all', label: 'Tất cả loại' }, ...RECEIPT_TYPE_OPTIONS];
const STATUS_OPTIONS = [{ value: 'all', label: 'Tất cả trạng thái' }, ...RECEIPT_STATUS_OPTIONS];

export default function ReceiptsPage() {
  // useReceiptFilters đọc useSearchParams → cần Suspense trong route tĩnh (Next).
  return (
    <Suspense fallback={<Spin size="large" className={styles.state} />}>
      <ReceiptsView />
    </Suspense>
  );
}

function ReceiptsView() {
  const { message } = App.useApp();
  const { has } = usePermissions();
  const { filters, setFilters } = useReceiptFilters();
  const { data, isError, refetch, isFetching } = useReceipts(filters);
  const approve = useApproveReceipt();
  const cancel = useCancelReceipt();

  const [formOpen, setFormOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const canCreate = has(PERMISSION.RECEIPT_CREATE);
  const canApprove = has(PERMISSION.RECEIPT_APPROVE);
  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: RECEIPTS_DEFAULT_LIMIT, total: 0, hasNext: false };
  const hasFilters = Boolean(filters.type || filters.status);

  function onApprove(id: string) {
    approve.mutate(id, {
      onSuccess: () => message.success('Đã duyệt phiếu'),
      onError: (err) => message.error(getErrorMessage(err)),
    });
  }
  function onCancel(id: string) {
    cancel.mutate(
      { id },
      {
        onSuccess: () => message.success('Đã huỷ phiếu'),
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  }

  return (
    <div>
      <ManagePageHeader
        title="Thu chi"
        extra={
          <Space>
            <Button icon={<TagsOutlined />} onClick={() => setCategoriesOpen(true)}>
              Danh mục
            </Button>
            {canCreate ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                Tạo phiếu
              </Button>
            ) : null}
          </Space>
        }
      />

      <div className={styles.filters}>
        <Select
          className={styles.select}
          size="large"
          value={filters.type ?? 'all'}
          options={TYPE_OPTIONS}
          onChange={(value: string) => setFilters({ type: value === 'all' ? undefined : value })}
        />
        <Select
          className={styles.select}
          size="large"
          value={filters.status ?? 'all'}
          options={STATUS_OPTIONS}
          onChange={(value: string) => setFilters({ status: value === 'all' ? undefined : value })}
        />
      </div>

      <ReceiptTable
        items={items}
        meta={meta}
        loading={isFetching}
        canApprove={canApprove}
        // Chỉ coi là lỗi khi KHÔNG còn dữ liệu cũ — refetch nền hỏng thì giữ bảng đang đọc.
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={hasFilters}
        onClearFilters={() => setFilters({ type: undefined, status: undefined })}
        emptyAction={
          canCreate ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              Tạo phiếu đầu tiên
            </Button>
          ) : undefined
        }
        onApprove={onApprove}
        onCancel={onCancel}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />

      <ReceiptFormDrawer open={formOpen} onClose={() => setFormOpen(false)} />
      <CategoryManagerModal open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />
    </div>
  );
}
