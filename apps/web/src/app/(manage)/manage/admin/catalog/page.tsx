'use client';

import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { App, Button, Segmented, Tag } from 'antd';
import { useState } from 'react';
import {
  CATALOG_TYPE,
  CATALOG_TYPES_WITH_ICON,
  CATALOG_TYPE_HINT,
  CATALOG_TYPE_LABEL,
  CATALOG_TYPE_VALUES,
  type CatalogType,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { getErrorMessage } from '@/services/api-client';
import { CatalogItemFormModal } from '@/features/catalog/components/CatalogItemFormModal';
import type { CatalogItemAdmin } from '@/features/catalog/types';
import {
  useAdminCatalog,
  useDeleteCatalogItem,
  useReorderCatalog,
} from '@/features/catalog/use-admin-catalog';
import styles from './catalog-page.module.css';

const MIN_TABLE_WIDTH = 900;

/**
 * Quản lý danh mục lọc — nơi DUY NHẤT tạo ra hãng xe / kiểu dáng / nhiên liệu / tiện ích.
 *
 * Bốn danh mục này trước đây là hằng số trong code: thêm một hãng phải sửa code và deploy, và
 * ba màn (chợ, gian hàng, quản trị) mỗi nơi giữ một bản. Giờ chúng đọc chung bảng `catalog_items`
 * — sửa ở đây là ô chọn trong form tạo xe và bộ lọc ngoài chợ đổi theo.
 */
export default function AdminCatalogPage() {
  const { message } = App.useApp();
  const [type, setType] = useState<CatalogType>(CATALOG_TYPE.BODY_TYPE);
  const { data, isError, refetch, isFetching } = useAdminCatalog(type);
  const remove = useDeleteCatalogItem();
  const reorder = useReorderCatalog();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItemAdmin | null>(null);

  const items = data ?? [];
  const withIcon = CATALOG_TYPES_WITH_ICON.includes(type);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(item: CatalogItemAdmin) {
    setEditing(item);
    setFormOpen(true);
  }

  function handleDelete(item: CatalogItemAdmin) {
    remove.mutate(item.id, {
      onSuccess: () => message.success('Đã xoá mục'),
      onError: (err) => message.error(getErrorMessage(err)),
    });
  }

  /**
   * Đổi chỗ với mục liền kề rồi gửi TRỌN thứ tự mới. Dùng nút lên/xuống thay cho kéo-thả: bàn
   * phím và màn hình nhỏ đều dùng được, và danh mục chỉ vài chục dòng nên không cần kéo.
   */
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const ids = items.map((i) => i.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate({ type, ids }, { onError: (err) => message.error(getErrorMessage(err)) });
  }

  const createButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
      Thêm mục
    </Button>
  );

  const columns: DataTableColumn<CatalogItemAdmin>[] = [
    ...(withIcon
      ? [
          {
            title: 'Ảnh',
            key: 'icon',
            width: 90,
            render: (_: unknown, item: CatalogItemAdmin) =>
              item.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL do admin nhập
                <img src={item.iconUrl} alt="" className={styles.icon} />
              ) : (
                <span className={styles.noIcon}>Chưa có</span>
              ),
          } satisfies DataTableColumn<CatalogItemAdmin>,
        ]
      : []),
    {
      title: 'Tên hiển thị',
      key: 'label',
      render: (_, item) => (
        <div>
          <div className={styles.label}>{item.label}</div>
          {item.description ? <div className={styles.desc}>{item.description}</div> : null}
        </div>
      ),
    },
    { title: 'Mã', key: 'key', width: 160, render: (_, item) => <code>{item.key}</code> },
    {
      title: 'Đang dùng',
      key: 'usage',
      align: 'right',
      width: 110,
      render: (_, item) => (item.usageCount > 0 ? `${item.usageCount} xe` : '—'),
    },
    {
      title: 'Trạng thái',
      key: 'active',
      width: 110,
      render: (_, item) => (item.active ? <Tag color="green">Đang bật</Tag> : <Tag>Đã tắt</Tag>),
    },
    actionColumn<CatalogItemAdmin>(
      (item) => {
        const index = items.findIndex((i) => i.id === item.id);
        return [
          {
            key: 'up',
            label: 'Đưa lên trên',
            icon: <ArrowUpOutlined />,
            disabled: index <= 0 || reorder.isPending,
            onClick: () => move(index, -1),
          },
          {
            key: 'down',
            label: 'Đưa xuống dưới',
            icon: <ArrowDownOutlined />,
            disabled: index >= items.length - 1 || reorder.isPending,
            onClick: () => move(index, 1),
          },
          {
            key: 'edit',
            label: 'Sửa',
            icon: <EditOutlined />,
            onClick: () => openEdit(item),
          },
          {
            key: 'delete',
            label: 'Xoá',
            icon: <DeleteOutlined />,
            danger: true,
            // Mục đã có xe dùng thì không xoá được — backend cũng chặn, đây chỉ là nói trước.
            disabled: item.usageCount > 0,
            loading: remove.isPending && remove.variables === item.id,
            confirm: {
              title: 'Xoá hẳn mục này khỏi danh mục?',
              okText: 'Xoá',
              cancelText: 'Đóng',
            },
            onClick: () => handleDelete(item),
          },
        ];
      },
      { width: 180 },
    ),
  ];

  return (
    <div>
      <ManagePageHeader title="Danh mục lọc" />

      <div className={styles.toolbar}>
        <Segmented<CatalogType>
          value={type}
          onChange={setType}
          options={CATALOG_TYPE_VALUES.map((value) => ({
            value,
            label: CATALOG_TYPE_LABEL[value],
          }))}
        />
        {createButton}
      </div>
      <p className={styles.hint}>{CATALOG_TYPE_HINT[type]}</p>

      <DataTable<CatalogItemAdmin>
        label={CATALOG_TYPE_LABEL[type]}
        columns={columns}
        items={items}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data
            ? { title: 'Không tải được danh mục', onRetry: () => void refetch() }
            : null
        }
        empty={{ title: 'Danh mục này chưa có mục nào', action: createButton }}
      />

      <CatalogItemFormModal
        key={`${type}:${editing?.id ?? 'new'}`}
        open={formOpen}
        type={type}
        item={editing}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}
