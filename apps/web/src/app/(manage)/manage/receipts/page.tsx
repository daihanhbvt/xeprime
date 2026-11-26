'use client';

import { PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, Segmented, Spin } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { FEATURE_STATE, PERMISSION, PLAN_FEATURE } from '@xeprime/types';
import { FeatureExpiredNotice } from '@/components/feedback/FeatureExpiredNotice';
import { FeatureWriteTooltip } from '@/components/feedback/FeatureWriteTooltip';
import { FilterBar, type FilterField, type FilterValues } from '@/components/filter/FilterBar';
import segmentedStyles from '@/components/filter/segmented.module.css';
import { ALL_FILTER } from '@/constants/filters';
import { useBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import {
  RECEIPTS_VIEW,
  RECEIPTS_VIEW_PARAM,
  ROUTES,
  receiptsPath,
  type ReceiptsView,
} from '@/constants/routes';
import { useFeature } from '@/hooks/use-feature';
import { usePermissions } from '@/hooks/use-permissions';
import { buildPeriodRange } from '@/lib/datetime';
import {
  RECEIPTS_DEFAULT_LIMIT,
  RECEIPT_DEFAULT_PERIOD,
  RECEIPT_PERIOD_VALUES,
  type ReceiptPeriod,
} from '@/features/finance/constants';
import { CategoryManagerModal } from '@/features/finance/components/CategoryManagerModal';
import { DebtsView } from '@/features/finance/components/DebtsView';
import { FinanceBoard } from '@/features/finance/components/FinanceBoard';
import { ReceiptDetailDialog } from '@/features/finance/components/ReceiptDetailDialog';
import { ReceiptFormDialog } from '@/features/finance/components/ReceiptFormDialog';
import { ReceiptSummaryCards } from '@/features/finance/components/ReceiptSummaryCards';
import { ReceiptTable } from '@/features/finance/components/ReceiptTable';
import { useDebtSummary } from '@/features/finance/hooks/use-debts';
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
 * Số trường lọc đứng TRÊN hàng; phần còn lại vào popover "Bộ lọc".
 *
 * Design (`23813:58308`) để `Loại` và `Chi nhánh` trên hàng — hai câu hỏi người giữ sổ hỏi
 * hằng ngày. `Trạng thái`/`Danh mục`/`Nguồn`/`Hình thức`/`Khoảng ngày` là lọc khi đi tìm một thứ
 * cụ thể, và khoảng ngày còn có lối tắt riêng ngay bên trái (`Hôm nay`/`Tuần này`/…).
 */
const INLINE_FILTER_COUNT = 2;

export default function ReceiptsPage() {
  // Hai tab đọc useSearchParams → cần Suspense trong route tĩnh (Next).
  return (
    <Suspense fallback={<Spin size="large" className={styles.state} />}>
      <TransactionHistoryView />
    </Suspense>
  );
}

/**
 * "Lịch sử giao dịch" — design Partner-XePrime: tab "Giao dịch thu chi" (sổ Thu-Chi, mặc định) và
 * tab "Công nợ" (`?view=debts`). MỘT route (chốt 04/11/2026); `/debts` cũ chuyển tiếp về tab Công
 * nợ. Kiểm kê và quyết định: `docs/design/09_PARTNER_REDESIGN.md` §3.11.
 *
 * Tab Công nợ mang cờ gói RIÊNG (`PLAN_FEATURE.DEBTS`): gói không có thì nút chuyển vắng hẳn và
 * `?view=debts` rơi về sổ Thu-Chi; gói hết hạn (chỉ-xem) thì tab vẫn mở kèm băng gia hạn — băng
 * của vỏ trang chỉ biết cờ của mục menu ("Lịch sử giao dịch" = `FINANCE`).
 */
function TransactionHistoryView() {
  const t = useTranslations('Finance.history');
  const tReceipts = useTranslations('Finance.receipts');
  const { has } = usePermissions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const debtsFeature = useFeature(PLAN_FEATURE.DEBTS);

  const requested = searchParams.get(RECEIPTS_VIEW_PARAM);
  const view: ReceiptsView =
    requested === RECEIPTS_VIEW.DEBTS && debtsFeature.isVisible
      ? RECEIPTS_VIEW.DEBTS
      : RECEIPTS_VIEW.LEDGER;

  // Thiếu quyền xem → thay TOÀN BỘ nội dung. Chặn thật là guard backend.
  if (!has(PERMISSION.FINANCE_VIEW)) {
    return (
      <PermissionState
        kind="forbidden"
        title={tReceipts('forbidden.title')}
        description={tReceipts('forbidden.description')}
        missingPermissions={[PERMISSION.FINANCE_VIEW]}
        action={
          <Link href={ROUTES.MANAGE.ROOT}>
            <Button type="primary">{tReceipts('forbidden.home')}</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className={styles.page}>
      <ManagePageHeader
        title={t('page.title')}
        subtitle={t('page.subtitle')}
        extra={
          debtsFeature.isVisible ? (
            <Segmented
              className={segmentedStyles.outlined}
              size="large"
              value={view}
              aria-label={t('views.label')}
              options={[
                { value: RECEIPTS_VIEW.LEDGER, label: t('views.ledger') },
                { value: RECEIPTS_VIEW.DEBTS, label: t('views.debts') },
              ]}
              // Đổi tab là đổi BỘ tham số (hai tab lọc khác nhau), nên đi tới URL sạch của tab đó
              // thay vì mang theo bộ lọc của tab kia.
              onChange={(next) =>
                router.push(
                  next === RECEIPTS_VIEW.DEBTS ? receiptsPath.debts() : ROUTES.MANAGE.RECEIPTS,
                )
              }
            />
          ) : null
        }
      />

      {view === RECEIPTS_VIEW.DEBTS ? (
        <>
          {debtsFeature.state === FEATURE_STATE.READ_ONLY ? (
            <FeatureExpiredNotice
              feature={PLAN_FEATURE.DEBTS}
              planEndsAt={debtsFeature.planEndsAt}
            />
          ) : null}
          <DebtsView />
        </>
      ) : (
        <ReceiptsLedger debtsVisible={debtsFeature.isVisible} />
      )}
    </div>
  );
}

/** Tab "Giao dịch thu chi" — sổ phiếu thu/chi. */
function ReceiptsLedger({ debtsVisible }: { debtsVisible: boolean }) {
  const t = useTranslations('Finance.receipts');
  const { message } = App.useApp();
  const { has } = usePermissions();
  const errorMessage = useErrorMessage();
  const { filters, setFilters } = useReceiptFilters();

  /**
   * Mặc định "Tháng này" (chốt 26/11/2026): mở sổ mà URL KHÔNG mang bộ lọc nào thì ghi kỳ tháng
   * này vào URL. Chỉ chạy MỘT lần lúc mở trang — gỡ bộ lọc sau đó là người dùng muốn xem toàn bộ
   * sổ, không được tự gắn lại. Lối vào có tham số (hồ sơ xe/khách, thẻ Tổng quan) giữ nguyên ý
   * của nó, không bị kẹp thêm kỳ.
   */
  const defaultPeriodApplied = useRef(false);
  useEffect(() => {
    if (defaultPeriodApplied.current) return;
    defaultPeriodApplied.current = true;
    if (hasReceiptFilters(filters) || filters.create) return;
    setFilters(buildPeriodRange(RECEIPT_DEFAULT_PERIOD) as Partial<ReceiptFilters>);
  }, [filters, setFilters]);
  const branch = useBranchFilter({
    value: filters.branchId,
    onChange: (branchId) => setFilters({ branchId }),
  });
  const { data, isError, refetch, isFetching } = useReceipts(filters);
  const summary = useReceiptSummary(filters);
  // Thẻ "Công nợ khách hàng" theo CÙNG chi nhánh đang lọc — số tại lúc này, không theo kỳ.
  const debtSummary = useDebtSummary({ branchId: filters.branchId }, debtsVisible);
  const approve = useApproveReceipt();
  const cancel = useCancelReceipt();
  const options = useFinanceOptions();

  // Danh mục nạp sẵn cho ô lọc: người dùng phải THẤY có những nhóm chi nào rồi mới chọn được.
  const { data: categories } = useFinanceCategories();

  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const canCreate = has(PERMISSION.RECEIPT_CREATE);
  const canApprove = has(PERMISSION.RECEIPT_APPROVE);

  /**
   * Form mở bằng state cục bộ, nhưng URL MỞ ĐƯỢC nó.
   *
   * `?create=1` là ý định mang sang từ hồ sơ xe — nút "Tạo phiếu thu/chi" ở đó là một đường dẫn
   * thường, nên nó vừa lọc sổ về xe đó vừa mở sẵn form, và vẫn gửi/quay lại được. Tham số chỉ là
   * giá trị KHỞI TẠO; đóng lại thì gỡ `create` khỏi URL — F5 không mở lại một form vừa bỏ.
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
   * Các điều khiển lọc, xếp theo mức dùng: `INLINE_FILTER_COUNT` cái đầu (sau ô tìm kiếm) ở lại
   * trên hàng, phần còn lại vào popover. Thứ tự trong mảng CHÍNH LÀ thứ tự cắt.
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
      ...(branch.field ? [branch.field] : []),
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
    [t, options, categories, branch.field],
  );

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: RECEIPTS_DEFAULT_LIMIT, total: 0, hasNext: false };
  const unassignedCount = data?.meta?.unassignedCount ?? 0;
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

  const createButton = (label: string) =>
    canCreate ? (
      <FeatureWriteTooltip feature={PLAN_FEATURE.FINANCE}>
        {(disabled) => (
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            disabled={disabled}
            onClick={() => setFormOpen(true)}
          >
            {label}
          </Button>
        )}
      </FeatureWriteTooltip>
    ) : undefined;

  return (
    <>
      <ReceiptSummaryCards
        data={summary.data}
        loading={summary.isFetching}
        error={summary.isError}
        filtered={filtered}
        debt={
          debtsVisible
            ? {
                data: debtSummary.data,
                loading: debtSummary.isFetching,
                href: receiptsPath.debts({ branchId: filters.branchId }),
              }
            : null
        }
      />

      <FinanceBoard
        title={t('board.title')}
        actions={
          <>
            <Button size="large" onClick={() => setCategoriesOpen(true)}>
              {t('actions.categories')}
            </Button>
            {createButton(t('actions.create'))}
          </>
        }
        toolbar={
          <>
            <div className={styles.periods}>
              <Segmented
                className={segmentedStyles.outlined}
                size="large"
                options={periodOptions}
                // Không kỳ nào khớp (khoảng ngày tự chọn, hoặc không lọc) → không tô sáng nút nào.
                value={activePeriod ?? ''}
                onChange={(value) => onPeriod(value as ReceiptPeriod)}
                aria-label={t('periods.label')}
              />
            </div>
            <FilterBar
              className={styles.filters}
              fields={filterFields}
              values={{ ...(filters as FilterValues), branchId: filters.branchId ?? ALL_FILTER }}
              onChange={(patch) =>
                setFilters(
                  ('branchId' in patch
                    ? {
                        ...patch,
                        branchId: patch.branchId === ALL_FILTER ? undefined : patch.branchId,
                      }
                    : patch) as Partial<ReceiptFilters>,
                )
              }
              onClear={filtered ? () => setFilters(clearedReceiptFilters()) : undefined}
              showActiveChips
              inlineFieldLimit={INLINE_FILTER_COUNT}
            />
          </>
        }
      >
        {/*
         * Lọc chi nhánh bỏ lại các khoản chi CHUNG (marketing, văn phòng…) vì chúng không gắn xe
         * nào — ADR 0052 điều 3. Phải nói ra, nếu không tổng bốn chi nhánh nhỏ hơn tổng gian hàng
         * và người dùng đi tìm một lỗi không tồn tại. Cố ý KHÔNG tự phân bổ theo tỉ lệ.
         */}
        {filters.branchId && unassignedCount > 0 ? (
          <Alert
            type="info"
            showIcon
            title={t('branchFilter.unassigned', { count: unassignedCount })}
            action={
              <Button size="small" type="link" onClick={() => setFilters({ branchId: undefined })}>
                {t('branchFilter.showAll')}
              </Button>
            }
          />
        ) : null}

        <ReceiptTable
          items={items}
          meta={meta}
          loading={isFetching}
          canApprove={canApprove}
          // Chỉ coi là lỗi khi KHÔNG còn dữ liệu cũ — refetch nền hỏng thì giữ bảng đang đọc.
          error={isError && !data ? { onRetry: () => void refetch() } : null}
          filtered={filtered}
          onClearFilters={() => setFilters(clearedReceiptFilters())}
          emptyAction={createButton(t('actions.createFirst'))}
          onOpen={setDetailId}
          onApprove={onApprove}
          onCancel={onCancel}
          onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
        />
      </FinanceBoard>

      <ReceiptDetailDialog
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
      <ReceiptFormDialog
        /*
         * Đổi xe đang lọc là đổi GIÁ TRỊ KHỞI TẠO của form, nên phải dựng lại cây: `defaultValues`
         * của RHF chỉ đọc một lần lúc mount, mà hộp này sống suốt vòng đời trang.
         */
        key={filters.vehicleId ?? 'no-vehicle'}
        open={formOpen}
        onClose={closeForm}
        // Xe đang lọc CŨNG là xe của phiếu sắp tạo — ngữ cảnh người dùng mang sang từ hồ sơ xe.
        initialVehicleId={filters.vehicleId ?? null}
      />
      <CategoryManagerModal open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />
    </>
  );
}
