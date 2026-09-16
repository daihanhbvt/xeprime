'use client';

import { EditOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import { Alert, App, Button, Tag, Tooltip } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BILLING_MODE,
  PLAN_STATUS,
  PLAN_STATUS_META,
  VEHICLE_TYPE,
  type PlanStatus,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { PlanFormModal } from '@/features/admin-plans/components/PlanFormModal';
import { useArchivePlan } from '@/features/admin-plans/hooks/use-plan-mutations';
import { usePlans } from '@/features/admin-plans/hooks/use-plans';
import type { Plan } from '@/features/admin-plans/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import styles from './plans-page.module.css';

/**
 * Suy từ tổng bề rộng cột (P25 — Figma `127:1725` không đặc tả cột cho bảng này).
 * Bảng gói là ngoại lệ **không phân trang** đã ghi nhận ở Figma `130:1752`.
 */
const MIN_TABLE_WIDTH = 1080;

/**
 * Bảng này chứa HAI LOẠI hàng, và gộp chúng vào một cột trạng thái là chỗ hiểu nhầm đắt nhất
 * của màn quản trị gói:
 *
 *  - **Bậc `commission`** là TUYẾN vào cửa, không phải một SKU. Đúng một hàng, gán tự động cho
 *    mọi gian hàng mới, không có kỳ hạn nào để bán. Nó hiện "Đang bán" như ba hàng còn lại thì
 *    admin đọc ra "đây là một gói khách chọn mua" — và nút Ngừng bán bên cạnh nó trông như một
 *    thao tác hợp lệ, trong khi bấm vào là gỡ tuyến vào cửa của toàn sàn (backend từ chối bằng
 *    `DEFAULT_PLAN_PROTECTED`, nhưng một nút chỉ để báo lỗi là một nút sai).
 *  - **Bậc `package`** là SKU thật: bán được, ngừng bán được.
 *
 * Và "Ngừng bán" nói về DANH MỤC, không nói về khách hàng: thuê bao đang chạy trên một bậc đã
 * ngừng bán vẫn chạy hết kỳ của nó với đúng giá và số chỗ đã snapshot (ADR 0024). Cột "Đã gán"
 * ngay cạnh là bằng chứng — nó vẫn đếm ra số khác 0.
 */

export default function AdminPlansPage() {
  const t = useTranslations('AdminPlans');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();

  const { message } = App.useApp();
  // Bộ lọc của trang này là state CỤC BỘ, không nằm trên URL — khác mọi danh sách khác.
  // Giữ nguyên: đưa lên URL là đổi hành vi, không thuộc phạm vi wave giao diện.
  const [filter, setFilter] = useState<string>('all');
  const { data, isError, refetch, isFetching } = usePlans('all');
  const archive = useArchivePlan();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);

  const items = (data ?? []).filter((p) => filter === 'all' || p.status === filter);

  const statusFilter: FilterField[] = [
    {
      kind: 'segmented',
      key: 'status',
      label: t('page.filterLabel'),
      options: [
        { value: 'all', label: t('page.filterAll') },
        { value: PLAN_STATUS.ACTIVE, label: t('page.filterActive') },
        { value: PLAN_STATUS.ARCHIVED, label: t('page.filterArchived') },
      ],
    },
  ];

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(plan: Plan) {
    setEditing(plan);
    setFormOpen(true);
  }

  function handleArchive(plan: Plan) {
    archive.mutate(plan.id, {
      onSuccess: () => message.success(t('page.archiveSuccess')),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  const createButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
      {t('page.createButton')}
    </Button>
  );

  const empty = tCommon('labels.emptyValue');

  /** `{gồm sẵn} → {trần}` cho một loại xe — trần null hiện "Không giới hạn". */
  function slotRange(included: number | undefined, max: number | null | undefined): string {
    return t('page.slotRange', {
      included: included ?? 0,
      max: max == null ? t('page.unlimited') : max,
    });
  }

  const columns: DataTableColumn<Plan>[] = [
    {
      title: t('page.columns.plan'),
      key: 'name',
      width: 240,
      render: (_, p) => (
        <div>
          <div className={styles.planName}>
            <span>{p.name}</span>
            {p.billingMode === BILLING_MODE.COMMISSION ? (
              <Tooltip title={t('page.defaultTrackHint')}>
                <Tag color="green">{t('page.defaultTrackTag')}</Tag>
              </Tooltip>
            ) : null}
          </div>
          <div className={styles.meta}>
            {p.code}
            {p.description ? ` · ${p.description}` : ''}
          </div>
        </div>
      ),
    },
    {
      title: t('page.columns.billingMode'),
      key: 'billingMode',
      width: 170,
      render: (_, p) => (
        <div>
          <div>{domainLabel('billingMode', p.billingMode)}</div>
          {p.billingMode === BILLING_MODE.COMMISSION && p.commissionPercent != null ? (
            <div>{t('page.commissionSummary', { percent: p.commissionPercent })}</div>
          ) : null}
        </div>
      ),
    },
    {
      title: t('page.columns.baseFee'),
      key: 'baseFee',
      align: 'right',
      width: 140,
      render: (_, p) => (p.billingMode === BILLING_MODE.PACKAGE ? fmt.money(p.basePriceMonthly) : empty),
    },
    {
      title: t('page.columns.slotPrice'),
      key: 'slotPrice',
      width: 190,
      render: (_, p) => {
        if (p.billingMode !== BILLING_MODE.PACKAGE) return empty;
        const { car, motorbike } = p.limits.perVehiclePrice;
        if (car == null && motorbike == null) return t('page.noSlotSale');
        return (
          <div>
            {car != null ? (
              <div>{`${domainLabel('vehicleType', VEHICLE_TYPE.CAR)} · ${fmt.money(car)}`}</div>
            ) : null}
            {motorbike != null ? (
              <div>{`${domainLabel('vehicleType', VEHICLE_TYPE.MOTORBIKE)} · ${fmt.money(motorbike)}`}</div>
            ) : null}
          </div>
        );
      },
    },
    {
      title: t('page.columns.slots'),
      key: 'slots',
      width: 190,
      render: (_, p) => {
        if (p.billingMode !== BILLING_MODE.PACKAGE) return empty;
        return (
          <div>
            <div>{`${domainLabel('vehicleType', VEHICLE_TYPE.CAR)} · ${slotRange(p.limits.includedCars, p.limits.maxCars)}`}</div>
            <div>{`${domainLabel('vehicleType', VEHICLE_TYPE.MOTORBIKE)} · ${slotRange(p.limits.includedMotorbikes, p.limits.maxMotorbikes)}`}</div>
          </div>
        );
      },
    },
    {
      title: t('page.columns.assigned'),
      key: 'subs',
      align: 'right',
      width: 90,
      render: (_, p) => p.subscriptionCount,
    },
    {
      title: t('page.columns.status'),
      key: 'status',
      width: 110,
      render: (_, p) => {
        /*
         * Bậc tuyến hoa hồng không có trạng thái BÁN HÀNG — nó không được bày ra cho gian hàng
         * chọn (`listPlansForTenant` lọc `billingMode = package`). "Đang bán" ở đây là một câu
         * nói về một việc không tồn tại.
         */
        if (p.billingMode === BILLING_MODE.COMMISSION) {
          return <Tag>{t('page.notForSale')}</Tag>;
        }
        const tag = (
          <StatusTag value={p.status as PlanStatus} meta={PLAN_STATUS_META} group="planStatus" />
        );
        // "Ngừng bán" bị đọc nhầm thành "thuê bao của gian hàng bị huỷ" — nói rõ ngay tại chỗ.
        return p.status === PLAN_STATUS.ARCHIVED ? (
          <Tooltip title={t('page.archivedHint', { count: p.subscriptionCount })}>{tag}</Tooltip>
        ) : (
          tag
        );
      },
    },
    // Hai nút có chữ → rộng hơn thang icon; giữ cả hai inline như trước, không đẩy vào menu ⋮.
    actionColumn<Plan>(
      (p) => [
        {
          key: 'edit',
          label: t('page.editAction'),
          icon: <EditOutlined />,
          onClick: () => openEdit(p),
        },
        {
          key: 'archive',
          label: t('page.archiveAction'),
          icon: <StopOutlined />,
          danger: true,
          /*
           * Ẩn với bậc tuyến hoa hồng: backend chặn bằng `DEFAULT_PLAN_PROTECTED`, và một nút
           * chỉ tồn tại để báo lỗi dạy admin bỏ qua thông báo lỗi. Đây là ẩn cho ĐÚNG, không
           * phải ẩn THAY cho kiểm soát — cổng thật vẫn ở server.
           */
          hidden:
            p.status !== PLAN_STATUS.ACTIVE || p.billingMode === BILLING_MODE.COMMISSION,
          loading: archive.isPending && archive.variables === p.id,
          confirm: {
            title: t('page.archiveConfirmTitle'),
            okText: t('page.archiveConfirmOk'),
            cancelText: t('page.archiveConfirmCancel'),
          },
          onClick: () => handleArchive(p),
        },
      ],
      { width: 260, maxInline: 2 },
    ),
  ];

  return (
    <div>
      <ManagePageHeader title={t('page.title')} />

      {/* Hai loại hàng, hai nghĩa của "ngừng bán" — xem docblock đầu file. */}
      <Alert
        type="info"
        showIcon
        className={styles.intro}
        title={t('page.introTitle')}
        description={t('page.introBody')}
      />

      <FilterBar
        fields={statusFilter}
        values={{ status: filter }}
        onChange={(patch) => setFilter(patch.status ?? 'all')}
        actions={createButton}
      />

      <DataTable<Plan>
        label={t('page.title')}
        columns={columns}
        items={items}
        onRowClick={openEdit}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data ? { title: t('page.loadError'), onRetry: () => void refetch() } : null
        }
        filtered={filter !== 'all'}
        empty={{ title: t('page.empty'), action: createButton }}
        // Giữ đúng hành vi cũ: nhánh đã-lọc trước đây cũng chỉ đổi câu chữ và vẫn mở lối tạo gói.
        noResults={{ title: t('page.noResults'), action: createButton }}
      />

      <PlanFormModal
        key={editing?.id ?? 'new'}
        open={formOpen}
        plan={editing}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}
