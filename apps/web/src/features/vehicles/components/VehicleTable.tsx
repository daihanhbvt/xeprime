'use client';

import { CarOutlined, DeleteOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';
import { Avatar, Button, Popconfirm, Space, Table, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS_META,
  type PaginationMeta,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatMoneyVnd } from '@/lib/money';
import { serviceTypeLabel, vehicleTypeLabel } from '../constants';
import type { VehicleListItem } from '../types';
import styles from './VehicleTable.module.css';

interface VehicleTableProps {
  items: VehicleListItem[];
  meta: PaginationMeta;
  loading: boolean;
  deletingId: string | null;
  canEdit: boolean;
  canDelete: boolean;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

const EMPTY = '—';

export function VehicleTable({
  items,
  meta,
  loading,
  deletingId,
  canEdit,
  canDelete,
  onView,
  onEdit,
  onDelete,
  onPageChange,
}: VehicleTableProps) {
  const columns: ColumnsType<VehicleListItem> = [
    {
      title: 'Xe',
      key: 'vehicle',
      render: (_, row) => (
        <div className={styles.cell}>
          <Avatar
            shape="square"
            size={44}
            src={row.mainImageUrl ?? undefined}
            icon={<CarOutlined />}
          />
          <div>
            <div className={styles.name}>{row.name}</div>
            <div className={styles.meta}>
              {row.code}
              {row.plateNumber ? ` · ${row.plateNumber}` : ''}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Loại',
      key: 'type',
      render: (_, row) => `${vehicleTypeLabel(row.vehicleType)} · ${serviceTypeLabel(row.serviceType)}`,
    },
    {
      title: 'Đời / Số chỗ',
      key: 'specs',
      render: (_, row) =>
        `${row.manufactureYear ?? EMPTY} · ${row.seatCount ? `${row.seatCount} chỗ` : EMPTY}`,
    },
    {
      title: 'Giá ngày thường',
      key: 'weekdayPrice',
      align: 'right',
      render: (_, row) => <span className={styles.price}>{formatMoneyVnd(row.weekdayPrice)}</span>,
    },
    {
      title: 'Vận hành',
      key: 'operationStatus',
      render: (_, row) => (
        <StatusTag
          value={row.operationStatus as VehicleOperationStatus}
          meta={VEHICLE_OPERATION_STATUS_META}
        />
      ),
    },
    {
      title: 'Public',
      key: 'publicStatus',
      render: (_, row) => (
        <StatusTag
          value={row.publicStatus as VehiclePublicStatus}
          meta={VEHICLE_PUBLIC_STATUS_META}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      fixed: 'right',
      width: 130,
      render: (_, row) => (
        <Space size="small">
          <Tooltip title="Xem">
            <Button type="text" icon={<EyeOutlined />} onClick={() => onView(row.id)} />
          </Tooltip>
          {canEdit ? (
            <Tooltip title="Sửa">
              <Button type="text" icon={<EditOutlined />} onClick={() => onEdit(row.id)} />
            </Tooltip>
          ) : null}
          {canDelete ? (
            <Popconfirm
              title="Xoá xe này?"
              description="Xe sẽ bị ẩn khỏi danh sách. Không xoá được nếu còn lịch."
              okText="Xoá"
              okButtonProps={{ danger: true }}
              cancelText="Huỷ"
              onConfirm={() => onDelete(row.id)}
            >
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                loading={deletingId === row.id}
              />
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <Table<VehicleListItem>
      rowKey="id"
      columns={columns}
      dataSource={items}
      loading={loading}
      scroll={{ x: 'max-content' }}
      onRow={(row) => ({ onClick: () => onView(row.id), className: styles.rowClickable })}
      pagination={{
        current: meta.page,
        pageSize: meta.limit,
        total: meta.total,
        showSizeChanger: true,
        showTotal: (total) => `${total} xe`,
        onChange: onPageChange,
      }}
    />
  );
}
