'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import {
  CATALOG_TYPE,
  STATUS_COLOR,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  type VehicleType,
} from '@xeprime/types';
import { App, Button, Segmented, Select, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { getErrorMessage } from '@/services/api-client';

import { useCatalogItems } from '../use-catalog';
import {
  useAdminCatalogModels,
  useDeleteCatalogModel,
  type CatalogModelAdmin,
} from '../use-admin-catalog-models';
import { CatalogModelFormModal } from './CatalogModelFormModal';
import styles from './CatalogModelsPanel.module.css';

const MIN_TABLE_WIDTH = 900;

/**
 * Quản trị MẪU XE — chiều danh mục duy nhất không sống ở bảng `catalog_items`.
 *
 * Hai bộ lọc ở đầu bảng không phải tiện nghi: một mẫu xe LUÔN thuộc một loại phương tiện và một
 * hãng, nên "danh sách mẫu xe" mà không nói của loại nào, hãng nào là một câu hỏi chưa đủ nghĩa.
 * Chúng cũng chính là hai giá trị mà nút "Thêm mẫu xe" dùng — vì thế nút bị khoá cho tới khi
 * chọn hãng, thay vì mở một form rồi bắt chọn lại.
 */
export function CatalogModelsPanel() {
  const t = useTranslations('AdminCatalog.models');
  const tCol = useTranslations('AdminCatalog.columns');
  const tStatus = useTranslations('AdminCatalog.status');
  const tActions = useTranslations('AdminCatalog.actions');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const { message } = App.useApp();

  const [vehicleType, setVehicleType] = useState<VehicleType>(VEHICLE_TYPE.CAR);
  const [brandKey, setBrandKey] = useState<string>('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogModelAdmin | null>(null);

  const { items: brands } = useCatalogItems(CATALOG_TYPE.VEHICLE_BRAND);
  const brandOptions = useMemo(
    () =>
      brands
        .filter((b) => b.vehicleTypes.length === 0 || (b.vehicleTypes as string[]).includes(vehicleType))
        .map((b) => ({ value: b.key, label: b.label })),
    [brands, vehicleType],
  );
  const brandLabel = brandOptions.find((b) => b.value === brandKey)?.label ?? brandKey;

  const { data, isError, isFetching, refetch } = useAdminCatalogModels(
    vehicleType,
    brandKey || undefined,
  );
  const remove = useDeleteCatalogModel();
  const models = data ?? [];

  function openEdit(model: CatalogModelAdmin) {
    setEditing(model);
    setFormOpen(true);
  }

  const addButton = (
    <Button
      type="primary"
      icon={<PlusOutlined />}
      // Không có hãng thì không có mẫu để thêm vào — khoá nút nói điều đó rõ hơn một form rỗng.
      disabled={!brandKey}
      onClick={() => {
        setEditing(null);
        setFormOpen(true);
      }}
    >
      {t('add')}
    </Button>
  );

  const columns: DataTableColumn<CatalogModelAdmin>[] = [
    {
      title: tCol('label'),
      key: 'label',
      width: 240,
      render: (_, m) => (
        <div>
          <div className={styles.label}>{m.label}</div>
          <code className={styles.key}>{m.key}</code>
        </div>
      ),
    },
    {
      title: tCol('brand'),
      key: 'brand',
      width: 140,
      render: (_, m) => brands.find((b) => b.key === m.brandKey)?.label ?? m.brandKey,
    },
    {
      title: tCol('marketStatus'),
      key: 'marketStatus',
      width: 160,
      render: (_, m) => (
        <div>
          <div>{domainLabel('catalogMarketStatus', m.marketStatus)}</div>
          {m.motorbikeCategory ? (
            <div className={styles.sub}>{domainLabel('motorbikeCategory', m.motorbikeCategory)}</div>
          ) : null}
        </div>
      ),
    },
    {
      title: tCol('usage'),
      key: 'usage',
      align: 'right',
      width: 110,
      render: (_, m) => (m.usageCount > 0 ? tCol('usageValue', { count: m.usageCount }) : '—'),
    },
    {
      /*
       * Nguồn tra cứu hiện thẳng trong bảng, không giấu trong form sửa: nó là thứ phân biệt một
       * mẫu ĐÃ ĐỐI CHIẾU với một mẫu ai đó gõ từ trí nhớ, và người rà danh mục cần thấy ngay
       * dòng nào còn thiếu.
       */
      title: tCol('source'),
      key: 'source',
      width: 180,
      render: (_, m) =>
        m.sourceUrl && m.verifiedAt ? (
          <a href={m.sourceUrl} target="_blank" rel="noreferrer noopener" className={styles.sub}>
            {t('verifiedAt', { date: fmt.date(m.verifiedAt) })}
          </a>
        ) : (
          <span className={styles.missing}>{t('notVerified')}</span>
        ),
    },
    {
      title: tCol('status'),
      key: 'active',
      width: 110,
      render: (_, m) =>
        m.active ? (
          <Tag color={STATUS_COLOR.SUCCESS}>{tStatus('active')}</Tag>
        ) : (
          <Tag color={STATUS_COLOR.NEUTRAL}>{tStatus('inactive')}</Tag>
        ),
    },
    actionColumn<CatalogModelAdmin>(
      (m) => [
        {
          key: 'edit',
          label: tActions('edit'),
          icon: <EditOutlined />,
          onClick: () => openEdit(m),
        },
        {
          key: 'delete',
          label: tActions('delete'),
          icon: <DeleteOutlined />,
          danger: true,
          // Mẫu đã có xe gắn thì không xoá được — backend cũng chặn, đây chỉ là nói trước.
          disabled: m.usageCount > 0,
          loading: remove.isPending && remove.variables === m.id,
          confirm: {
            title: t('confirmDelete'),
            okText: tActions('confirmOk'),
            cancelText: tActions('confirmCancel'),
          },
          onClick: () =>
            remove.mutate(m.id, {
              onSuccess: () => message.success(t('deleted')),
              onError: (err) => message.error(getErrorMessage(err)),
            }),
        },
      ],
      { width: 150 },
    ),
  ];

  return (
    <div>
      <div className={styles.toolbar}>
        <Segmented<VehicleType>
          value={vehicleType}
          onChange={(next) => {
            setVehicleType(next);
            // Hãng thuộc loại xe cũ gần như chắc chắn không hợp lệ ở loại mới — bỏ chọn thay vì
            // để bảng lọc theo một hãng không còn trong danh sách.
            setBrandKey('');
          }}
          options={VEHICLE_TYPE_VALUES.map((value) => ({
            value,
            label: domainLabel('vehicleType', value),
          }))}
        />
        <Select
          className={styles.brandSelect}
          value={brandKey || undefined}
          onChange={(value) => setBrandKey(value ?? '')}
          options={brandOptions}
          placeholder={t('allBrands')}
          aria-label={t('brand')}
          allowClear
          showSearch
          optionFilterProp="label"
        />
        {addButton}
      </div>

      <DataTable<CatalogModelAdmin>
        label={t('title')}
        columns={columns}
        items={models}
        onRowClick={openEdit}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={isError && !data ? { title: t('loadError'), onRetry: () => void refetch() } : null}
        empty={{ title: t('empty'), action: addButton }}
      />

      {/* `key` ép form dựng lại khi đổi mẫu đang sửa — nếu không, giá trị mặc định của mẫu trước
          còn nằm nguyên trong ô nhập. */}
      <CatalogModelFormModal
        key={`${vehicleType}:${brandKey}:${editing?.id ?? 'new'}`}
        open={formOpen}
        vehicleType={vehicleType}
        brandKey={editing?.brandKey ?? brandKey}
        brandLabel={brandLabel}
        model={editing}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}
