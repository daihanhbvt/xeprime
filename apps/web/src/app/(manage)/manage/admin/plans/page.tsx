'use client';

import { EditOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import { App, Button } from 'antd';
import { useState } from 'react';
import { PLAN_STATUS, PLAN_STATUS_META, type PlanStatus } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { formatMoneyVnd } from '@/lib/money';
import { getErrorMessage } from '@/services/api-client';
import { PlanFormModal } from '@/features/admin-plans/components/PlanFormModal';
import { useArchivePlan } from '@/features/admin-plans/hooks/use-plan-mutations';
import { usePlans } from '@/features/admin-plans/hooks/use-plans';
import type { Plan } from '@/features/admin-plans/types';

const STATUS_FILTER: FilterField[] = [
  {
    kind: 'segmented',
    key: 'status',
    label: 'Trạng thái gói',
    options: [
      { value: 'all', label: 'Tất cả' },
      { value: PLAN_STATUS.ACTIVE, label: 'Đang bán' },
      { value: PLAN_STATUS.ARCHIVED, label: 'Ngừng bán' },
    ],
  },
];

/**
 * Suy từ tổng bề rộng cột (P25 — Figma `127:1725` không đặc tả cột cho bảng này).
 * Bảng gói là ngoại lệ **không phân trang** đã ghi nhận ở Figma `130:1752`.
 */
const MIN_TABLE_WIDTH = 980;

export default function AdminPlansPage() {
  const { message } = App.useApp();
  // Bộ lọc của trang này là state CỤC BỘ, không nằm trên URL — khác mọi danh sách khác.
  // Giữ nguyên: đưa lên URL là đổi hành vi, không thuộc phạm vi wave giao diện.
  const [filter, setFilter] = useState<string>('all');
  const { data, isError, refetch, isFetching } = usePlans('all');
  const archive = useArchivePlan();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);

  const items = (data ?? []).filter((p) => filter === 'all' || p.status === filter);

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
      onSuccess: () => message.success('Đã ngừng bán gói'),
      onError: (err) => message.error(getErrorMessage(err)),
    });
  }

  const createButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
      Tạo gói
    </Button>
  );

  const columns: DataTableColumn<Plan>[] = [
    {
      title: 'Gói',
      key: 'name',
      width: 260,
      render: (_, p) => (
        <div>
          <div>{p.name}</div>
          <div>
            {p.code}
            {p.description ? ` · ${p.description}` : ''}
          </div>
        </div>
      ),
    },
    {
      title: 'Giá / chu kỳ',
      key: 'price',
      align: 'right',
      width: 130,
      render: (_, p) => formatMoneyVnd(p.price),
    },
    {
      title: 'Chu kỳ',
      key: 'duration',
      align: 'right',
      width: 100,
      render: (_, p) => `${p.durationDays} ngày`,
    },
    {
      title: 'Giới hạn xe',
      key: 'maxVehicles',
      align: 'right',
      width: 120,
      render: (_, p) => (p.maxVehicles == null ? 'Không giới hạn' : `${p.maxVehicles} xe`),
    },
    {
      title: 'Đã gán',
      key: 'subs',
      align: 'right',
      width: 90,
      render: (_, p) => p.subscriptionCount,
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 120,
      render: (_, p) => <StatusTag value={p.status as PlanStatus} meta={PLAN_STATUS_META} />,
    },
    // Hai nút có chữ → rộng hơn thang icon; giữ cả hai inline như trước, không đẩy vào menu ⋮.
    actionColumn<Plan>(
      (p) => [
        {
          key: 'edit',
          label: 'Chỉnh sửa',
          icon: <EditOutlined />,
          onClick: () => openEdit(p),
        },
        {
          key: 'archive',
          label: 'Ngừng bán',
          icon: <StopOutlined />,
          danger: true,
          hidden: p.status !== PLAN_STATUS.ACTIVE,
          loading: archive.isPending && archive.variables === p.id,
          confirm: {
            title: 'Ngừng bán gói này? Thuê bao đã gán giữ nguyên hiệu lực.',
            okText: 'Ngừng bán',
            cancelText: 'Đóng',
          },
          onClick: () => handleArchive(p),
        },
      ],
      { width: 260, maxInline: 2 },
    ),
  ];

  return (
    <div>
      <ManagePageHeader title="Gói dịch vụ" />

      <FilterBar
        fields={STATUS_FILTER}
        values={{ status: filter }}
        onChange={(patch) => setFilter(patch.status ?? 'all')}
        actions={createButton}
      />

      <DataTable<Plan>
        label="Gói dịch vụ"
        columns={columns}
        items={items}
        onRowClick={openEdit}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data
            ? { title: 'Không tải được danh sách gói', onRetry: () => void refetch() }
            : null
        }
        filtered={filter !== 'all'}
        empty={{ title: 'Chưa có gói nào', action: createButton }}
        // Giữ đúng hành vi cũ: nhánh đã-lọc trước đây cũng chỉ đổi câu chữ và vẫn mở lối tạo gói.
        noResults={{ title: 'Không có gói ở trạng thái này', action: createButton }}
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
