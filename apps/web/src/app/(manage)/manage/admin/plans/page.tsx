'use client';

import { EditOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import { App, Button, Empty, Popconfirm, Result, Segmented, Space, Spin, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { PLAN_STATUS, PLAN_STATUS_META, type PlanStatus } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { formatMoneyVnd } from '@/lib/money';
import { getErrorMessage } from '@/services/api-client';
import { PlanFormModal } from '@/features/admin-plans/components/PlanFormModal';
import { useArchivePlan } from '@/features/admin-plans/hooks/use-plan-mutations';
import { usePlans } from '@/features/admin-plans/hooks/use-plans';
import type { Plan } from '@/features/admin-plans/types';
import styles from './plans-page.module.css';

const FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: PLAN_STATUS.ACTIVE, label: 'Đang bán' },
  { value: PLAN_STATUS.ARCHIVED, label: 'Ngừng bán' },
];

export default function AdminPlansPage() {
  const { message } = App.useApp();
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

  const columns: ColumnsType<Plan> = [
    {
      title: 'Gói',
      key: 'name',
      render: (_, p) => (
        <div>
          <div className={styles.name}>{p.name}</div>
          <div className={styles.meta}>
            {p.code}
            {p.description ? ` · ${p.description}` : ''}
          </div>
        </div>
      ),
    },
    { title: 'Giá / chu kỳ', key: 'price', align: 'right', render: (_, p) => formatMoneyVnd(p.price) },
    { title: 'Chu kỳ', key: 'duration', align: 'right', render: (_, p) => `${p.durationDays} ngày` },
    {
      title: 'Giới hạn xe',
      key: 'maxVehicles',
      align: 'right',
      render: (_, p) => (p.maxVehicles == null ? 'Không giới hạn' : `${p.maxVehicles} xe`),
    },
    { title: 'Đã gán', key: 'subs', align: 'right', render: (_, p) => p.subscriptionCount },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_, p) => <StatusTag value={p.status as PlanStatus} meta={PLAN_STATUS_META} />,
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, p) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(p)}>
            Sửa
          </Button>
          {p.status === PLAN_STATUS.ACTIVE ? (
            <Popconfirm
              title="Ngừng bán gói này? Thuê bao đã gán giữ nguyên hiệu lực."
              okText="Ngừng bán"
              okButtonProps={{ danger: true }}
              cancelText="Đóng"
              onConfirm={() => handleArchive(p)}
            >
              <Button type="link" danger icon={<StopOutlined />} loading={archive.isPending && archive.variables === p.id}>
                Ngừng bán
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <ManagePageHeader
        title="Gói dịch vụ"
        extra={
          <Space wrap>
            <Segmented value={filter} options={FILTER_OPTIONS} onChange={(v) => setFilter(String(v))} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Tạo gói
            </Button>
          </Space>
        }
      />

      {isError && !data ? (
        <Result
          status="error"
          title="Không tải được danh sách gói"
          extra={
            <Button type="primary" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : !isFetching && items.length === 0 ? (
        <Empty className={styles.state} description={filter === 'all' ? 'Chưa có gói nào' : 'Không có gói ở trạng thái này'}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Tạo gói
          </Button>
        </Empty>
      ) : isFetching && !data ? (
        <Spin size="large" className={styles.state} />
      ) : (
        <Table<Plan>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={isFetching}
          scroll={{ x: 'max-content' }}
          pagination={false}
        />
      )}

      <PlanFormModal
        key={editing?.id ?? 'new'}
        open={formOpen}
        plan={editing}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}
