'use client';

import { DeleteOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';
import { Button, Tag } from 'antd';
import {
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS_META,
  type PaginationMeta,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
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
  error?: { onRetry: () => void } | null;
  filtered?: boolean;
  onClearFilters?: () => void;
  /** Nút "Thêm xe đầu tiên" — trang quyết theo quyền `VEHICLE_CREATE`. */
  emptyAction?: React.ReactNode;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

const EMPTY = '—';

/** Figma `127:1725` ghi 730px cho Fleet Vehicles (7 cột) — khớp đúng số cột của bảng này. */
const MIN_TABLE_WIDTH = 900;

export function VehicleTable({
  items,
  meta,
  loading,
  deletingId,
  canEdit,
  canDelete,
  error = null,
  filtered = false,
  onClearFilters,
  emptyAction,
  onView,
  onEdit,
  onDelete,
  onPageChange,
}: VehicleTableProps) {
  const columns: DataTableColumn<VehicleListItem>[] = [
    {
      title: 'Xe',
      key: 'vehicle',
      render: (_, row) => (
        <EntityIdentity
          kind="vehicle"
          size="md"
          imageUrl={row.mainImageUrl}
          initialSource={row.name}
          name={row.name}
          subtitle={`${row.code}${row.plateNumber ? ` · ${row.plateNumber}` : ''}`}
        />
      ),
    },
    {
      title: 'Loại',
      key: 'type',
      width: 170,
      render: (_, row) =>
        `${vehicleTypeLabel(row.vehicleType)} · ${serviceTypeLabel(row.serviceType)}`,
    },
    {
      title: 'Đời / Số chỗ',
      key: 'specs',
      width: 130,
      render: (_, row) =>
        `${row.manufactureYear ?? EMPTY} · ${row.seatCount ? `${row.seatCount} chỗ` : EMPTY}`,
    },
    {
      title: 'Giá ngày thường',
      key: 'weekdayPrice',
      align: 'right',
      width: 160,
      render: (_, row) => (
        <span className={styles.price}>
          {formatMoneyVnd(row.weekdayPrice)}
          {/* Nhãn khuyến mãi, KHÔNG phải trạng thái nghiệp vụ → giữ `Tag` trần, không `StatusTag`. */}
          {row.discountPercent ? <Tag color="red">-{row.discountPercent}%</Tag> : null}
        </span>
      ),
    },
    {
      title: 'Vận hành',
      key: 'operationStatus',
      width: 120,
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
      width: 140,
      render: (_, row) => (
        <StatusTag
          value={row.publicStatus as VehiclePublicStatus}
          meta={VEHICLE_PUBLIC_STATUS_META}
        />
      ),
    },
    actionColumn<VehicleListItem>(
      (row) => [
        { key: 'view', label: 'Xem', icon: <EyeOutlined />, onClick: () => onView(row.id) },
        {
          key: 'edit',
          label: 'Sửa',
          icon: <EditOutlined />,
          hidden: !canEdit,
          onClick: () => onEdit(row.id),
        },
        {
          key: 'delete',
          label: 'Xoá',
          icon: <DeleteOutlined />,
          danger: true,
          hidden: !canDelete,
          loading: deletingId === row.id,
          confirm: {
            title: 'Xoá xe này?',
            description: 'Xe sẽ bị ẩn khỏi danh sách. Không xoá được nếu còn lịch.',
            okText: 'Xoá',
            cancelText: 'Huỷ',
          },
          onClick: () => onDelete(row.id),
        },
      ],
      { width: 130 },
    ),
  ];

  return (
    <DataTable<VehicleListItem>
      label="Danh sách xe"
      columns={columns}
      items={items}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={
        error
          ? {
              title: 'Không tải được danh sách xe',
              description: 'Có lỗi khi lấy dữ liệu. Vui lòng thử lại.',
              onRetry: error.onRetry,
            }
          : null
      }
      filtered={filtered}
      empty={{ title: 'Gian hàng chưa có xe nào', action: emptyAction }}
      noResults={{
        title: 'Không tìm thấy xe khớp bộ lọc',
        action: onClearFilters ? <Button onClick={onClearFilters}>Xoá bộ lọc</Button> : undefined,
      }}
      onRowClick={(row) => onView(row.id)}
      pagination={{ meta, onChange: onPageChange, totalLabel: (total) => `${total} xe` }}
    />
  );
}
