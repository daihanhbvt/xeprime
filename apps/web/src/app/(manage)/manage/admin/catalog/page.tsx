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
  CATALOG_ITEM_TYPES,
  CATALOG_TYPE,
  CATALOG_TYPES_WITH_ICON,
  STATUS_COLOR,
  type CatalogItemType,
  type CatalogType,
} from '@xeprime/types';
import { useTranslations } from 'next-intl';
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
import { CatalogModelsPanel } from '@/features/catalog/components/CatalogModelsPanel';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { PreviewImage } from '@/components/data-display/PreviewImage';
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
  const t = useTranslations('AdminCatalog.page');
  const tCol = useTranslations('AdminCatalog.columns');
  const tStatus = useTranslations('AdminCatalog.status');
  const tActions = useTranslations('AdminCatalog.actions');
  const domainLabel = useDomainLabel();
  const { message } = App.useApp();

  /*
   * Chiều thứ năm — MẪU XE — có bảng riêng và bộ lọc riêng (loại phương tiện × hãng), nên nó là
   * một panel khác chứ không phải một tab nữa của cùng bảng. Nó vẫn nằm chung màn hình này vì
   * với người quản trị thì đó vẫn là "danh mục xe".
   */
  const [type, setType] = useState<CatalogType>(CATALOG_TYPE.BODY_TYPE);
  const isModelTab = type === CATALOG_TYPE.VEHICLE_MODEL;
  const { data, isError, refetch, isFetching } = useAdminCatalog(type as CatalogItemType);
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
      onSuccess: () => message.success(tActions('deleted')),
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
    // Tab mẫu xe không dùng bảng này (nút sắp xếp cũng không hiện ở đó), nên ở đây `type`
    // luôn là một chiều của `catalog_items`.
    reorder.mutate(
      { type: type as CatalogItemType, ids },
      { onError: (err) => message.error(getErrorMessage(err)) },
    );
  }

  const createButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
      {t('addItem')}
    </Button>
  );

  const columns: DataTableColumn<CatalogItemAdmin>[] = [
    ...(withIcon
      ? [
          {
            title: tCol('icon'),
            key: 'icon',
            width: 90,
            render: (_: unknown, item: CatalogItemAdmin) =>
              item.iconUrl ? (
                <PreviewImage src={item.iconUrl} alt="" className={styles.icon} />
              ) : (
                <span className={styles.noIcon}>{tCol('noIcon')}</span>
              ),
          } satisfies DataTableColumn<CatalogItemAdmin>,
        ]
      : []),
    {
      title: tCol('label'),
      key: 'label',
      width: 280,
      render: (_, item) => (
        <div>
          <div className={styles.label}>{item.label}</div>
          {item.description ? <div className={styles.desc}>{item.description}</div> : null}
        </div>
      ),
    },
    { title: tCol('key'), key: 'key', width: 160, render: (_, item) => <code>{item.key}</code> },
    {
      title: tCol('usage'),
      key: 'usage',
      align: 'right',
      width: 110,
      render: (_, item) =>
        item.usageCount > 0 ? tCol('usageValue', { count: item.usageCount }) : '—',
    },
    {
      title: tCol('vehicleTypes'),
      key: 'vehicleTypes',
      width: 150,
      // Mảng rỗng = áp dụng mọi loại xe. Hiện chữ đó thay vì một ô trống: "trống" ở đây rất dễ
      // đọc thành "chưa cấu hình", trong khi nó là trạng thái mặc định và đúng.
      render: (_, item) =>
        item.vehicleTypes.length === 0
          ? tCol('allVehicleTypes')
          : item.vehicleTypes.map((v) => domainLabel('vehicleType', v)).join(' · '),
    },
    {
      title: tCol('status'),
      key: 'active',
      width: 110,
      render: (_, item) =>
        item.active ? (
          <Tag color={STATUS_COLOR.SUCCESS}>{tStatus('active')}</Tag>
        ) : (
          <Tag color={STATUS_COLOR.NEUTRAL}>{tStatus('inactive')}</Tag>
        ),
    },
    actionColumn<CatalogItemAdmin>(
      (item) => {
        const index = items.findIndex((i) => i.id === item.id);
        return [
          {
            key: 'edit',
            label: tActions('edit'),
            icon: <EditOutlined />,
            onClick: () => openEdit(item),
          },
          {
            key: 'up',
            label: tActions('moveUp'),
            icon: <ArrowUpOutlined />,
            disabled: index <= 0 || reorder.isPending,
            onClick: () => move(index, -1),
          },
          {
            key: 'down',
            label: tActions('moveDown'),
            icon: <ArrowDownOutlined />,
            disabled: index >= items.length - 1 || reorder.isPending,
            onClick: () => move(index, 1),
          },
          {
            key: 'delete',
            label: tActions('delete'),
            icon: <DeleteOutlined />,
            danger: true,
            // Mục đã có xe dùng thì không xoá được — backend cũng chặn, đây chỉ là nói trước.
            disabled: item.usageCount > 0,
            loading: remove.isPending && remove.variables === item.id,
            confirm: {
              title: tActions('confirmDelete'),
              okText: tActions('confirmOk'),
              cancelText: tActions('confirmCancel'),
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
      <ManagePageHeader title={t('title')} />

      <div className={styles.toolbar}>
        <Segmented<CatalogType>
          value={type}
          onChange={setType}
          options={[...CATALOG_ITEM_TYPES, CATALOG_TYPE.VEHICLE_MODEL].map((value) => ({
            value,
            label: domainLabel('catalogType', value),
          }))}
        />
        {isModelTab ? null : createButton}
      </div>
      <p className={styles.hint}>{domainLabel('catalogTypeHint', type)}</p>

      {isModelTab ? <CatalogModelsPanel /> : (
      <DataTable<CatalogItemAdmin>
        label={domainLabel('catalogType', type)}
        columns={columns}
        items={items}
        onRowClick={openEdit}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data ? { title: t('loadError'), onRetry: () => void refetch() } : null
        }
        empty={{ title: t('empty'), action: createButton }}
      />
      )}

      <CatalogItemFormModal
        key={`${type}:${editing?.id ?? 'new'}`}
        open={formOpen && !isModelTab}
        type={type as CatalogItemType}
        item={editing}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}
