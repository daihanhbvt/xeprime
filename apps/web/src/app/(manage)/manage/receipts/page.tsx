'use client';

import { PlusOutlined, TagsOutlined } from '@ant-design/icons';
import { App, Button, Segmented, Space, Spin } from 'antd';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { PERMISSION } from '@xeprime/types';
import { FilterBar, type FilterField, type FilterValues } from '@/components/filter/FilterBar';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { buildPeriodRange } from '@/lib/datetime';
import {
  PAYMENT_METHOD_OPTIONS,
  RECEIPTS_DEFAULT_LIMIT,
  RECEIPT_PERIOD,
  RECEIPT_PERIOD_LABEL,
  RECEIPT_SOURCE_OPTIONS,
  RECEIPT_STATUS_OPTIONS,
  RECEIPT_TYPE_OPTIONS,
  type ReceiptPeriod,
} from '@/features/finance/constants';
import { CategoryManagerModal } from '@/features/finance/components/CategoryManagerModal';
import { ReceiptDetailDrawer } from '@/features/finance/components/ReceiptDetailDrawer';
import { ReceiptFormDrawer } from '@/features/finance/components/ReceiptFormDrawer';
import { ReceiptSummaryCards } from '@/features/finance/components/ReceiptSummaryCards';
import { ReceiptTable } from '@/features/finance/components/ReceiptTable';
import { useFinanceCategories } from '@/features/finance/hooks/use-finance-categories';
import {
  clearedReceiptFilters,
  hasReceiptFilters,
  useReceiptFilters,
} from '@/features/finance/hooks/use-receipt-filters';
import { useReceipts } from '@/features/finance/hooks/use-receipts';
import { useReceiptSummary } from '@/features/finance/hooks/use-receipt-summary';
import {
  useApproveReceipt,
  useCancelReceipt,
} from '@/features/finance/hooks/use-receipt-mutations';
import { useErrorMessage } from '@/i18n/use-error-message';
import type { ReceiptFilters } from '@/features/finance/types';
import styles from './receipts-page.module.css';

const PERIOD_OPTIONS = Object.values(RECEIPT_PERIOD).map((value) => ({
  value,
  label: RECEIPT_PERIOD_LABEL[value],
}));

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
  const errorMessage = useErrorMessage();
  const { filters, setFilters } = useReceiptFilters();
  const { data, isError, refetch, isFetching } = useReceipts(filters);
  const summary = useReceiptSummary(filters);
  const approve = useApproveReceipt();
  const cancel = useCancelReceipt();

  // Danh mục nạp sẵn cho ô lọc: người dùng phải THẤY có những nhóm chi nào rồi mới chọn được.
  const { data: categories } = useFinanceCategories();

  const [formOpen, setFormOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const canView = has(PERMISSION.FINANCE_VIEW);
  const canCreate = has(PERMISSION.RECEIPT_CREATE);
  const canApprove = has(PERMISSION.RECEIPT_APPROVE);

  // Thiếu quyền xem → thay TOÀN BỘ nội dung. Trước đây trang vẫn dựng đủ tiêu đề, bộ lọc và một
  // bảng lỗi 403 — trông như hỏng chứ không như "bạn không được vào". Chặn thật là guard backend.
  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title="Không có quyền xem sổ thu chi"
        description="Bạn cần quyền dưới đây để xem trang này. Liên hệ chủ gian hàng để được cấp quyền."
        missingPermissions={[PERMISSION.FINANCE_VIEW]}
        action={
          <Link href={ROUTES.MANAGE.ROOT}>
            <Button type="primary">Về trang chủ</Button>
          </Link>
        }
      />
    );
  }

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: RECEIPTS_DEFAULT_LIMIT, total: 0, hasNext: false };
  const filtered = hasReceiptFilters(filters);

  const filterFields: readonly FilterField[] = [
    { kind: 'search', key: 'q', label: 'Tìm kiếm', placeholder: 'Mã phiếu, mã tra soát, mã đơn…' },
    { kind: 'select', key: 'type', label: 'Loại', options: RECEIPT_TYPE_OPTIONS, allowClear: true },
    {
      kind: 'select',
      key: 'status',
      label: 'Trạng thái',
      options: RECEIPT_STATUS_OPTIONS,
      allowClear: true,
    },
    {
      kind: 'select',
      key: 'categoryId',
      label: 'Danh mục',
      options: (categories ?? []).map((c) => ({ value: c.id, label: c.name })),
      allowClear: true,
      searchable: true,
    },
    {
      kind: 'select',
      key: 'source',
      label: 'Nguồn',
      options: RECEIPT_SOURCE_OPTIONS,
      allowClear: true,
    },
    {
      kind: 'select',
      key: 'paymentMethod',
      label: 'Hình thức',
      options: PAYMENT_METHOD_OPTIONS,
      allowClear: true,
    },
    { kind: 'dateRange', fromKey: 'from', toKey: 'to', label: 'Khoảng ngày' },
  ];

  function onApprove(id: string) {
    approve.mutate(id, {
      onSuccess: () => message.success('Đã duyệt phiếu'),
      onError: (err) => message.error(errorMessage(err)),
    });
  }
  function onCancel(id: string) {
    cancel.mutate(
      { id },
      {
        onSuccess: () => message.success('Đã huỷ phiếu'),
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  /** Kỳ dựng sẵn ghi thẳng `from`/`to` — cùng tham số với ô chọn ngày, không đẻ tham số thứ hai. */
  function onPeriod(period: ReceiptPeriod) {
    setFilters(buildPeriodRange(period) as Partial<ReceiptFilters>);
  }

  const activePeriod = PERIOD_OPTIONS.find((option) => {
    const range = buildPeriodRange(option.value);
    return filters.from === range.from && filters.to === range.to;
  })?.value;

  return (
    <div>
      <ManagePageHeader
        title="Thu chi"
        subtitle="Mọi khoản tiền của gian hàng — thu tiền đơn, cọc, hoàn cọc và chi phí xe đều tự lên sổ."
      />

      <ReceiptSummaryCards
        data={summary.data}
        loading={summary.isFetching}
        error={summary.isError}
        filtered={filtered}
      />

      <div className={styles.periods}>
        <Segmented
          options={PERIOD_OPTIONS}
          // Không kỳ nào khớp (khoảng ngày tự chọn, hoặc không lọc) → không tô sáng nút nào.
          value={activePeriod ?? ''}
          onChange={(value) => onPeriod(value as ReceiptPeriod)}
          aria-label="Kỳ xem nhanh"
        />
      </div>

      <FilterBar
        fields={filterFields}
        values={filters as FilterValues}
        onChange={(patch) => setFilters(patch as Partial<ReceiptFilters>)}
        onClear={filtered ? () => setFilters(clearedReceiptFilters()) : undefined}
        showActiveChips
        actions={
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

      <ReceiptTable
        items={items}
        meta={meta}
        loading={isFetching}
        canApprove={canApprove}
        // Chỉ coi là lỗi khi KHÔNG còn dữ liệu cũ — refetch nền hỏng thì giữ bảng đang đọc.
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={filtered}
        onClearFilters={() => setFilters(clearedReceiptFilters())}
        emptyAction={
          canCreate ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              Tạo phiếu đầu tiên
            </Button>
          ) : undefined
        }
        onOpen={setDetailId}
        onApprove={onApprove}
        onCancel={onCancel}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />

      <ReceiptDetailDrawer
        receiptId={detailId}
        onClose={() => setDetailId(null)}
        canApprove={canApprove}
        onApprove={(id) => {
          onApprove(id);
          setDetailId(null);
        }}
        onCancel={(id) => {
          onCancel(id);
          setDetailId(null);
        }}
      />
      <ReceiptFormDrawer open={formOpen} onClose={() => setFormOpen(false)} />
      <CategoryManagerModal open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />
    </div>
  );
}
