'use client';

import { PlusOutlined, TagsOutlined } from '@ant-design/icons';
import { App, Button, Segmented, Space, Spin } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Suspense, useMemo, useState } from 'react';
import { PERMISSION, PLAN_FEATURE } from '@xeprime/types';
import { FeatureWriteTooltip } from '@/components/feedback/FeatureWriteTooltip';
import { FilterBar, type FilterField, type FilterValues } from '@/components/filter/FilterBar';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { buildPeriodRange } from '@/lib/datetime';
import {
  RECEIPTS_DEFAULT_LIMIT,
  RECEIPT_PERIOD_VALUES,
  type ReceiptPeriod,
} from '@/features/finance/constants';
import { CategoryManagerModal } from '@/features/finance/components/CategoryManagerModal';
import { ReceiptDetailDrawer } from '@/features/finance/components/ReceiptDetailDrawer';
import { ReceiptFormDrawer } from '@/features/finance/components/ReceiptFormDrawer';
import { ReceiptSummaryCards } from '@/features/finance/components/ReceiptSummaryCards';
import { ReceiptTable } from '@/features/finance/components/ReceiptTable';
import { useFinanceCategories } from '@/features/finance/hooks/use-finance-categories';
import { useFinanceOptions } from '@/features/finance/hooks/use-finance-options';
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

/**
 * Số trường lọc đứng TRÊN hàng; bốn trường còn lại vào popover "Bộ lọc".
 *
 * Hai trường được chọn là `Loại` (thu hay chi) và `Trạng thái` (đã duyệt hay chưa) — hai câu hỏi
 * người giữ sổ hỏi hằng ngày. `Danh mục`/`Nguồn`/`Hình thức`/`Khoảng ngày` là lọc khi đi tìm một
 * thứ cụ thể, và ô chọn khoảng ngày còn có lối tắt riêng ngay trên (`Hôm nay`/`Tuần này`/…).
 */
const INLINE_FILTER_COUNT = 2;

export default function ReceiptsPage() {
  // useReceiptFilters đọc useSearchParams → cần Suspense trong route tĩnh (Next).
  return (
    <Suspense fallback={<Spin size="large" className={styles.state} />}>
      <ReceiptsView />
    </Suspense>
  );
}

function ReceiptsView() {
  const t = useTranslations('Finance.receipts');
  const { message } = App.useApp();
  const { has } = usePermissions();
  const errorMessage = useErrorMessage();
  const { filters, setFilters } = useReceiptFilters();
  const { data, isError, refetch, isFetching } = useReceipts(filters);
  const summary = useReceiptSummary(filters);
  const approve = useApproveReceipt();
  const cancel = useCancelReceipt();
  const options = useFinanceOptions();

  // Danh mục nạp sẵn cho ô lọc: người dùng phải THẤY có những nhóm chi nào rồi mới chọn được.
  const { data: categories } = useFinanceCategories();

  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const canView = has(PERMISSION.FINANCE_VIEW);
  const canCreate = has(PERMISSION.RECEIPT_CREATE);
  const canApprove = has(PERMISSION.RECEIPT_APPROVE);

  /**
   * Form mở bằng state cục bộ, nhưng URL MỞ ĐƯỢC nó.
   *
   * `?create=1` là ý định mang sang từ hồ sơ xe — nút "Tạo phiếu thu/chi" ở đó là một đường dẫn
   * thường, nên nó vừa lọc sổ về xe đó vừa mở sẵn form, và vẫn gửi/quay lại được. Tham số chỉ là
   * giá trị KHỞI TẠO: đẩy hẳn trạng thái mở/đóng lên URL thì mỗi lần bấm là một `router.replace`,
   * và một drawer mở sau một vòng chuyển trang thì cảm giác như bấm hụt.
   *
   * Đóng lại thì gỡ `create` khỏi URL — F5 không mở lại một form người dùng vừa bỏ. `resetPage:
   * false` vì đóng form không phải là đổi bộ lọc, không được cuốn họ về trang 1 đang đọc.
   */
  const [formOpen, setFormOpen] = useState(Boolean(filters.create) && canCreate);

  function closeForm() {
    setFormOpen(false);
    if (filters.create) setFilters({ create: undefined }, { resetPage: false });
  }

  const periodOptions = useMemo(
    () => RECEIPT_PERIOD_VALUES.map((value) => ({ value, label: t(`periods.${value}`) })),
    [t],
  );

  /**
   * Bảy điều khiển lọc, xếp theo mức dùng: hai cái đầu ở lại trên hàng, phần còn lại vào popover
   * (xem `INLINE_FILTER_COUNT`). Thứ tự trong mảng CHÍNH LÀ thứ tự cắt, nên đừng đảo tuỳ tiện.
   */
  const filterFields = useMemo<readonly FilterField[]>(
    () => [
      {
        kind: 'search',
        key: 'q',
        label: t('filters.searchLabel'),
        placeholder: t('filters.searchPlaceholder'),
      },
      { kind: 'select', key: 'type', label: t('filters.type'), options: options.receiptType },
      {
        kind: 'select',
        key: 'status',
        label: t('filters.status'),
        options: options.receiptStatus,
      },
      {
        kind: 'select',
        key: 'categoryId',
        label: t('filters.category'),
        options: (categories ?? []).map((c) => ({ value: c.id, label: c.name })),
        searchable: true,
      },
      { kind: 'select', key: 'source', label: t('filters.source'), options: options.receiptSource },
      {
        kind: 'select',
        key: 'paymentMethod',
        label: t('filters.paymentMethod'),
        options: options.paymentMethod,
      },
      { kind: 'dateRange', fromKey: 'from', toKey: 'to', label: t('filters.dateRange') },
    ],
    [t, options, categories],
  );

  // Thiếu quyền xem → thay TOÀN BỘ nội dung. Trước đây trang vẫn dựng đủ tiêu đề, bộ lọc và một
  // bảng lỗi 403 — trông như hỏng chứ không như "bạn không được vào". Chặn thật là guard backend.
  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title={t('forbidden.title')}
        description={t('forbidden.description')}
        missingPermissions={[PERMISSION.FINANCE_VIEW]}
        action={
          <Link href={ROUTES.MANAGE.ROOT}>
            <Button type="primary">{t('forbidden.home')}</Button>
          </Link>
        }
      />
    );
  }

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: RECEIPTS_DEFAULT_LIMIT, total: 0, hasNext: false };
  const filtered = hasReceiptFilters(filters);

  function onApprove(id: string) {
    approve.mutate(id, {
      onSuccess: () => message.success(t('toast.approved')),
      onError: (err) => message.error(errorMessage(err)),
    });
  }
  function onCancel(id: string) {
    cancel.mutate(
      { id },
      {
        onSuccess: () => message.success(t('toast.cancelled')),
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  /** Kỳ dựng sẵn ghi thẳng `from`/`to` — cùng tham số với ô chọn ngày, không đẻ tham số thứ hai. */
  function onPeriod(period: ReceiptPeriod) {
    setFilters(buildPeriodRange(period) as Partial<ReceiptFilters>);
  }

  const activePeriod = periodOptions.find((option) => {
    const range = buildPeriodRange(option.value);
    return filters.from === range.from && filters.to === range.to;
  })?.value;

  return (
    <div>
      <ManagePageHeader title={t('page.title')} subtitle={t('page.subtitle')} />

      <ReceiptSummaryCards
        data={summary.data}
        loading={summary.isFetching}
        error={summary.isError}
        filtered={filtered}
      />

      <div className={styles.periods}>
        <Segmented
          options={periodOptions}
          // Không kỳ nào khớp (khoảng ngày tự chọn, hoặc không lọc) → không tô sáng nút nào.
          value={activePeriod ?? ''}
          onChange={(value) => onPeriod(value as ReceiptPeriod)}
          aria-label={t('periods.label')}
        />
      </div>

      <FilterBar
        fields={filterFields}
        values={filters as FilterValues}
        onChange={(patch) => setFilters(patch as Partial<ReceiptFilters>)}
        onClear={filtered ? () => setFilters(clearedReceiptFilters()) : undefined}
        showActiveChips
        // Bảy điều khiển + hai nút hành động không đứng vừa một hàng ở bất kỳ bề rộng nào: thanh
        // lọc tự xuống dòng và ô chọn ngày rơi lẻ xuống hàng hai. Hình thái gọn + nhóm phụ trong
        // popover giữ đúng một hàng mà không bỏ đi trường nào; chip bên dưới nói rõ đang lọc gì.
        compactFields
        inlineFieldLimit={INLINE_FILTER_COUNT}
        actions={
          <Space>
            <Button icon={<TagsOutlined />} onClick={() => setCategoriesOpen(true)}>
              {t('actions.categories')}
            </Button>
            {canCreate ? (
              <FeatureWriteTooltip feature={PLAN_FEATURE.FINANCE}>
                {(disabled) => (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    disabled={disabled}
                    onClick={() => setFormOpen(true)}
                  >
                    {t('actions.create')}
                  </Button>
                )}
              </FeatureWriteTooltip>
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
            <FeatureWriteTooltip feature={PLAN_FEATURE.FINANCE}>
              {(disabled) => (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  disabled={disabled}
                  onClick={() => setFormOpen(true)}
                >
                  {t('actions.createFirst')}
                </Button>
              )}
            </FeatureWriteTooltip>
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
      <ReceiptFormDrawer
        /*
         * Đổi xe đang lọc là đổi GIÁ TRỊ KHỞI TẠO của form, nên phải dựng lại cây.
         *
         * `defaultValues` của RHF chỉ đọc một lần lúc mount, mà drawer này sống suốt vòng đời
         * trang. Cách còn lại là một effect ghi đè sau khi đã render — thứ vừa vi phạm
         * `react-hooks/set-state-in-effect` vừa có nguy cơ đè lên đúng ô người dùng đang gõ.
         */
        key={filters.vehicleId ?? 'no-vehicle'}
        open={formOpen}
        onClose={closeForm}
        // Xe đang lọc CŨNG là xe của phiếu sắp tạo — đó chính là ngữ cảnh người dùng mang sang từ
        // hồ sơ xe. Đọc từ filter chứ không phải một tham số thứ hai: hai nguồn cho cùng một chiếc
        // xe là hai nguồn sẽ trôi khỏi nhau.
        initialVehicleId={filters.vehicleId ?? null}
      />
      <CategoryManagerModal open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />
    </div>
  );
}
