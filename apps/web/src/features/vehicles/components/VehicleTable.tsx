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
import Link from 'next/link';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { RowActions, type RowAction } from '@/components/data-display/RowActions';
import { StatusTag } from '@/components/data-display/StatusTag';
import { vehiclePath } from '@/constants/routes';
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

/**
 * Bề rộng từng cột — **mọi cột đều phải khai `width`**.
 *
 * `scroll={{ x }}` bật `table-layout: fixed`. Cột nào KHÔNG khai `width` là cột `auto` duy nhất
 * nên nuốt trọn phần dư của bảng: ở màn 1650px, cột "Xe" từng phình ra ~800px trong khi sáu cột
 * còn lại đứng yên ở đúng số px đã khai. Khi mọi cột có `width`, trình duyệt chia phần dư **theo
 * tỷ lệ** các bề rộng này, nên tỷ lệ cột giữ nguyên ở mọi độ rộng màn.
 *
 * Tỷ lệ lấy từ hình học thật của Figma `58:5` (`58:136`–`58:142`, khung bảng 1136px):
 * Xe 260 · Loại 140 · Đời 110 · Giá 160 · Vận hành 130 · Công khai 130 · Thao tác 158.
 *
 * Sàn 1060px (không phải 730px của `127:2003`) vì **nhãn trạng thái của ta là chữ đầy đủ**
 * (`Ngừng hoạt động`, `Đã duyệt public`) còn Figma mock viết tắt (`Ngừng HĐ`, `Đã duyệt`) —
 * khác biệt đã ghi ở 08 §Wave 2. Ép về 730 thì badge xuống dòng, trái `127:1783` "no truncate".
 * Mỗi số dưới đây là bề rộng nhỏ nhất đủ chứa nội dung THẬT, đã cộng 32px padding ô của AntD
 * (16px mỗi bên); giữ sàn thấp nhất có thể để laptop 1366px không phải cuộn ngang.
 */
const COLUMN_WIDTH = {
  vehicle: 210,
  type: 140,
  specs: 120,
  weekdayPrice: 160,
  operationStatus: 150,
  publicStatus: 150,
  actions: 130,
} as const;

const MIN_TABLE_WIDTH = Object.values(COLUMN_WIDTH).reduce((sum, width) => sum + width, 0);

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
  /**
   * MỘT định nghĩa hành động cho cả bảng desktop lẫn thẻ mobile.
   *
   * Khác biệt duy nhất giữa hai hình thái là `maxInline`: bảng hiện 3 nút, thẻ gom hết vào
   * menu ⋮ theo Figma `58:2459` (thẻ chỉ có một điều khiển "more"). Tách thành hai danh sách
   * sẽ là chỗ để quyền và câu chữ trôi khỏi nhau.
   */
  function rowActions(row: VehicleListItem): RowAction[] {
    return [
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
    ];
  }

  /** "Ô tô · Tự lái · 2023 · 4 chỗ" — dòng thông số của thẻ mobile (Figma `58:2448`). */
  function specsLine(row: VehicleListItem): string {
    return [
      vehicleTypeLabel(row.vehicleType),
      serviceTypeLabel(row.serviceType),
      row.manufactureYear ?? null,
      row.seatCount ? `${row.seatCount} chỗ` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  /**
   * Thẻ xe ở ≤640px — Pilot chính thức của `renderCard` (Figma `58:2439`).
   *
   * Cùng dữ liệu, cùng quyền, cùng handler với bảng desktop: thẻ chỉ là một cách TRÌNH BÀY
   * khác của cùng một hàng, không phải một danh sách thứ hai.
   *
   * Toàn thẻ bấm được nhờ link phủ (`::after` trong `.module.css`) thay vì gắn `onClick` lên
   * `<li>`: giữ đúng một phần tử tương tác thật, bàn phím tới được, và menu ⋮ nằm trên link
   * nên vẫn bấm riêng được.
   */
  function renderCard(row: VehicleListItem) {
    return (
      <article className={styles.card}>
        <EntityIdentity
          kind="vehicle"
          size="lg"
          imageUrl={row.mainImageUrl}
          initialSource={row.name}
          name={
            <Link href={vehiclePath.detail(row.id)} className={styles.cardLink}>
              {row.name}
            </Link>
          }
          subtitle={`${row.code}${row.plateNumber ? ` · ${row.plateNumber}` : ''}`}
        />

        <p className={styles.specs}>{specsLine(row)}</p>

        <div className={styles.cardBottom}>
          <span className={styles.price}>
            {formatMoneyVnd(row.weekdayPrice)}
            {row.discountPercent ? <Tag color="red">-{row.discountPercent}%</Tag> : null}
          </span>
          <div className={styles.cardActions}>
            <RowActions
              actions={rowActions(row)}
              maxInline={0}
              overflowLabel={`Thao tác cho ${row.name}`}
            />
          </div>
        </div>

        <div className={styles.statuses}>
          <StatusTag
            value={row.operationStatus as VehicleOperationStatus}
            meta={VEHICLE_OPERATION_STATUS_META}
          />
          <StatusTag
            value={row.publicStatus as VehiclePublicStatus}
            meta={VEHICLE_PUBLIC_STATUS_META}
          />
        </div>
      </article>
    );
  }

  const columns: DataTableColumn<VehicleListItem>[] = [
    {
      title: 'Xe',
      key: 'vehicle',
      width: COLUMN_WIDTH.vehicle,
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
      width: COLUMN_WIDTH.type,
      render: (_, row) =>
        `${vehicleTypeLabel(row.vehicleType)} · ${serviceTypeLabel(row.serviceType)}`,
    },
    {
      title: 'Đời / Số chỗ',
      key: 'specs',
      width: COLUMN_WIDTH.specs,
      render: (_, row) =>
        `${row.manufactureYear ?? EMPTY} · ${row.seatCount ? `${row.seatCount} chỗ` : EMPTY}`,
    },
    {
      title: 'Giá ngày thường',
      key: 'weekdayPrice',
      align: 'right',
      width: COLUMN_WIDTH.weekdayPrice,
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
      width: COLUMN_WIDTH.operationStatus,
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
      width: COLUMN_WIDTH.publicStatus,
      render: (_, row) => (
        <StatusTag
          value={row.publicStatus as VehiclePublicStatus}
          meta={VEHICLE_PUBLIC_STATUS_META}
        />
      ),
    },
    actionColumn<VehicleListItem>(rowActions, { width: COLUMN_WIDTH.actions }),
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
      renderCard={renderCard}
      pagination={{ meta, onChange: onPageChange, totalLabel: (total) => `${total} xe` }}
    />
  );
}
