'use client';

import { CodeSandboxOutlined, CopyOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BILLING_MODE, PLAN_STATUS, PLAN_STATUS_VALUES } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { InfoHint } from '@/components/data-display/InfoHint';
import { RowActions, type RowAction } from '@/components/data-display/RowActions';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { PlanCatalogStats } from '@/features/admin-plans/components/PlanCatalogStats';
import {
  PlanKindCell,
  PlanNameCell,
  PlanPriceCell,
  PlanStatusCell,
  usePlanKindLabel,
} from '@/features/admin-plans/components/PlanCells';
import { PlanFormModal } from '@/features/admin-plans/components/PlanFormModal';
import { useSetPlanStatus } from '@/features/admin-plans/hooks/use-plan-mutations';
import { usePlans } from '@/features/admin-plans/hooks/use-plans';
import {
  PLAN_KIND,
  PLAN_KIND_VALUES,
  filterPlans,
  hasActivePlanFilters,
  parsePlanCatalogFilters,
  planKindOf,
  summarizePlans,
  type PlanCatalogFilters,
} from '@/features/admin-plans/plan-catalog';
import type { Plan } from '@/features/admin-plans/types';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import styles from './plans-page.module.css';

/** Tổng bề rộng các cột — hẹp hơn thì bảng cuộn ngang, không nén cột (xem `DataTable`). */
const MIN_TABLE_WIDTH = 1180;

/**
 * Hộp tạo/sửa đang mở. `duplicate` là TẠO MỚI điền sẵn từ một bậc có sẵn — không phải sửa nó.
 */
type DialogState =
  | { mode: 'create' }
  | { mode: 'edit'; plan: Plan }
  | { mode: 'duplicate'; plan: Plan };

/**
 * Danh mục gói dịch vụ — ADR 0041.
 *
 * Bảng chứa HAI LOẠI hàng, và đây là chỗ hiểu nhầm đắt nhất của màn này:
 *
 *  - **Bậc `commission`** là TUYẾN vào cửa, không phải một SKU: đúng một hàng, gán tự động cho
 *    mọi gian hàng mới. Nó luôn hoạt động — không có công tắc, không nhân bản được
 *    (`COMMISSION_PLAN_IS_SINGLETON`), backend chặn archive bằng `DEFAULT_PLAN_PROTECTED`.
 *  - **Bậc `package`** là SKU thật: tắt/mở bán được, qua CÔNG TẮC có hộp xác nhận ở cả hai chiều.
 *
 * Tắt một bậc nói về DANH MỤC, không nói về khách hàng: thuê bao đang chạy trên bậc đó vẫn chạy
 * hết kỳ với đúng giá và hạn mức đã snapshot (ADR 0024 · ADR 0041 điều 3). Mở lại
 * (`POST /platform/plans/:id/activate`) cũng chỉ đổi danh mục.
 *
 * Danh mục không phân trang — API trả trọn vài bậc, và thẻ số liệu cần chính tập đó. Bộ lọc nằm
 * trên URL (ADR 0004), phép lọc chạy ở client trên tập đầy đủ (`filterPlans`).
 */
export default function AdminPlansPage() {
  const t = useTranslations('AdminPlans');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const kindLabel = usePlanKindLabel();
  const errorMessage = useErrorMessage();
  const { message, modal } = App.useApp();

  const { filters, setFilters } = useUrlFilters<PlanCatalogFilters>(parsePlanCatalogFilters);
  const { data, isError, refetch, isFetching } = usePlans('all');
  const setStatus = useSetPlanStatus();
  /*
   * `session` tăng MỖI lần mở và làm `key` của form: mở "Tạo" hai lần liền phải ra hai form
   * sạch (cùng một `key` thì RHF giữ nguyên chữ gõ dở của lần trước). Hộp luôn được mount và chỉ
   * lật `open`, để hiệu ứng đóng của Modal còn chạy.
   */
  const [dialog, setDialog] = useState<{ state: DialogState; session: number; open: boolean }>({
    state: { mode: 'create' },
    session: 0,
    open: false,
  });
  const openDialog = (state: DialogState) =>
    setDialog((current) => ({ state, session: current.session + 1, open: true }));

  const plans = data ?? [];
  const items = filterPlans(plans, filters);
  /*
   * Hộp sửa nhận bản MỚI NHẤT của gói từ danh sách, không phải ảnh chụp lúc mở: cờ `deletable`
   * có thể đổi sau một lượt làm mới (vừa có người mua, hoặc xoá bị từ chối `PLAN_IN_USE`) và nút
   * "Xoá gói" phải biến theo. Chữ đang gõ không mất — RHF chỉ đọc `defaultValues` lúc mount.
   */
  const dialogState = dialog.state;
  const editingPlan =
    dialogState.mode === 'edit'
      ? (plans.find((plan) => plan.id === dialogState.plan.id) ?? dialogState.plan)
      : null;
  const filtered = hasActivePlanFilters(filters);
  const loadFailed = isError && !data;
  /*
   * Danh mục chỉ có MỘT bậc hoa hồng (singleton, kể cả bậc đã tắt). Chưa tải xong thì coi như
   * đã có — mở sẵn lựa chọn đó là mở con đường duy nhất server sẽ từ chối.
   */
  const allowCommission =
    data !== undefined && !data.some((plan) => plan.billingMode === BILLING_MODE.COMMISSION);

  const filterFields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('page.filters.search'),
      placeholder: t('page.filters.searchPlaceholder'),
    },
    {
      kind: 'select',
      key: 'kind',
      label: t('page.filters.kind'),
      options: PLAN_KIND_VALUES.map((kind) => ({ value: kind, label: kindLabel(kind) })),
    },
    {
      kind: 'select',
      key: 'status',
      label: t('page.filters.status'),
      options: PLAN_STATUS_VALUES.map((status) => ({
        value: status,
        label: domainLabel('planStatus', status),
      })),
    },
  ];

  /**
   * Bật/tắt — CÓ xác nhận ở CẢ HAI chiều: tắt là gỡ khỏi bảng giá gian hàng, mở là bày lại một
   * giá có thể đã cũ. Câu xác nhận nói rõ điều dễ hiểu sai nhất: tắt KHÔNG huỷ thuê bao nào.
   */
  function confirmToggle(plan: Plan) {
    const activating = plan.status !== PLAN_STATUS.ACTIVE;
    const next = activating ? PLAN_STATUS.ACTIVE : PLAN_STATUS.ARCHIVED;
    modal.confirm({
      title: activating
        ? t('page.confirm.activateTitle', { name: plan.name })
        : t('page.confirm.deactivateTitle', { name: plan.name }),
      content: activating ? t('page.confirm.activateBody') : t('page.confirm.deactivateBody'),
      okText: activating ? t('page.confirm.activateOk') : t('page.confirm.deactivateOk'),
      cancelText: tCommon('actions.close'),
      okButtonProps: activating ? undefined : { danger: true },
      onOk: () =>
        new Promise<void>((resolve) => {
          setStatus.mutate(
            { id: plan.id, status: next },
            {
              onSuccess: () => {
                message.success(
                  activating
                    ? t('page.toast.activated', { name: plan.name })
                    : t('page.toast.deactivated', { name: plan.name }),
                );
                resolve();
              },
              onError: (err) => {
                message.error(errorMessage(err));
                resolve();
              },
            },
          );
        }),
    });
  }

  function rowActions(plan: Plan): RowAction[] {
    return [
      {
        key: 'edit',
        label: t('page.editAction'),
        icon: <EditOutlined />,
        showLabel: false,
        onClick: () => openDialog({ mode: 'edit', plan }),
      },
      {
        key: 'duplicate',
        label: t('page.duplicateAction'),
        icon: <CopyOutlined />,
        showLabel: false,
        // Nhân bản tuyến hoa hồng là tạo bậc hoa hồng thứ hai — server từ chối, nên không mời.
        hidden: planKindOf(plan) === PLAN_KIND.COMMISSION,
        onClick: () => openDialog({ mode: 'duplicate', plan }),
      },
    ];
  }

  const isPending = (plan: Plan) => setStatus.isPending && setStatus.variables?.id === plan.id;

  const createButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => openDialog({ mode: 'create' })}>
      {t('page.createButton')}
    </Button>
  );

  const columns: DataTableColumn<Plan>[] = [
    {
      title: t('page.columns.index'),
      key: 'index',
      width: 64,
      render: (_, __, index) => index + 1,
    },
    {
      title: t('page.columns.name'),
      key: 'name',
      width: 340,
      render: (_, plan) => <PlanNameCell plan={plan} />,
    },
    {
      title: t('page.columns.kind'),
      key: 'kind',
      width: 190,
      render: (_, plan) => <PlanKindCell plan={plan} />,
    },
    {
      title: t('page.columns.price'),
      key: 'price',
      width: 270,
      render: (_, plan) => <PlanPriceCell plan={plan} />,
    },
    {
      title: (
        <span className={styles.headerWithHint}>
          {t('page.columns.subscriptions')}
          <InfoHint
            label={t('page.columns.subscriptionsHintLabel')}
            content={t('page.columns.subscriptionsHint')}
          />
        </span>
      ),
      key: 'subscriptions',
      align: 'right',
      width: 130,
      render: (_, plan) => fmt.count(plan.subscriptionCount),
    },
    {
      title: t('page.columns.status'),
      key: 'status',
      width: 210,
      render: (_, plan) => (
        <PlanStatusCell plan={plan} pending={isPending(plan)} onToggle={confirmToggle} />
      ),
    },
    actionColumn<Plan>(rowActions, { width: 110, maxInline: 2 }),
  ];

  return (
    <div>
      <ManagePageHeader
        icon={<CodeSandboxOutlined />}
        title={t('page.title')}
        subtitle={
          <>
            {t('page.subtitle')}
            <InfoHint label={t('page.introLabel')} content={t('page.introBody')} />
          </>
        }
        extra={createButton}
      />

      <section className={styles.panel}>
        {/* Lỗi tải lần đầu: không có con số nào đáng tin — 4 số 0 sẽ được đọc như sự thật. */}
        {loadFailed ? null : (
          <PlanCatalogStats summary={summarizePlans(plans)} loading={isFetching && !data} />
        )}

        <FilterBar
          className={styles.filters}
          fields={filterFields}
          values={{ q: filters.q, kind: filters.kind, status: filters.status }}
          onChange={(patch) => setFilters(patch as Partial<PlanCatalogFilters>)}
          onClear={() => setFilters({ q: undefined, kind: undefined, status: undefined })}
        />

        <DataTable<Plan>
          label={t('page.title')}
          columns={columns}
          items={items}
          onRowClick={(plan) => openDialog({ mode: 'edit', plan })}
          minWidth={MIN_TABLE_WIDTH}
          loading={isFetching}
          error={loadFailed ? { title: t('page.loadError'), onRetry: () => void refetch() } : null}
          filtered={filtered}
          empty={{ title: t('page.empty'), action: createButton }}
          noResults={{
            title: t('page.noResults'),
            action: (
              <Button
                onClick={() => setFilters({ q: undefined, kind: undefined, status: undefined })}
              >
                {tCommon('actions.clear')}
              </Button>
            ),
          }}
          renderCard={(plan) => (
            <div className={styles.card}>
              <PlanNameCell plan={plan} />
              <div className={styles.cardMeta}>
                <PlanKindCell plan={plan} />
                <PlanStatusCell plan={plan} pending={isPending(plan)} onToggle={confirmToggle} />
              </div>
              <PlanPriceCell plan={plan} />
              <RowActions actions={rowActions(plan)} maxInline={2} variant="filled" align="start" />
            </div>
          )}
        />

        {items.length > 0 ? (
          <p className={styles.footer}>
            {t('page.showing', { count: items.length, total: plans.length })}
          </p>
        ) : null}
      </section>

      <PlanFormModal
        key={dialog.session}
        open={dialog.open}
        plan={editingPlan}
        template={dialog.state.mode === 'duplicate' ? dialog.state.plan : null}
        allowCommission={allowCommission}
        onClose={() => setDialog((current) => ({ ...current, open: false }))}
      />
    </div>
  );
}
