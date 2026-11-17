'use client';

import { PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import { DataTable } from '@/components/data-display/DataTable';
import { useVehicleDataList } from '@/features/vehicle-data/hooks';
import type { VehicleDataFilters } from '@/features/vehicle-data/types';
import {
  VEHICLE_DATA_TABLE_MIN_WIDTH,
  useVehicleDataColumns,
} from '@/features/vehicle-data/components/use-vehicle-data-columns';

import styles from './CatalogModelsPanel.module.css';

/** Một dòng xe hiếm khi quá vài chục xe chuẩn; quá thì phân trang ngay trong dòng (ở server). */
export const LINE_VEHICLES_PAGE_SIZE = 20;

/** Bộ lọc XE đang bật ở tab Mẫu xe — áp vào xe của mọi dòng đang mở. */
export type LineVehicleFilters = Pick<
  VehicleDataFilters,
  'q' | 'status' | 'gap' | 'origin' | 'sort'
>;

/**
 * Xe chuẩn (phiên bản · đời — ADR 0090) của MỘT dòng xe, hiện khi mở dòng đó ở tab Mẫu xe
 * (ADR 0096). Tải riêng theo `modelId`, phân trang ở server; bấm một xe mở panel làm việc của nó.
 * Báo danh sách id đang thấy lên trên để "Xe trước / Xe sau" của panel đi đúng thứ tự trên màn.
 */
export function CatalogLineVehicles({
  vehicleType,
  brandKey,
  modelId,
  lineLabel,
  filters,
  filtered,
  selectedId,
  onOpen,
  onAdd,
  onIds,
}: {
  vehicleType: string;
  brandKey: string;
  modelId: string;
  lineLabel: string;
  filters: LineVehicleFilters;
  filtered: boolean;
  selectedId: string | null;
  onOpen: (id: string) => void;
  /** Không có = dòng chưa nhận thêm xe từ đây (dòng mới chờ duyệt). */
  onAdd?: () => void;
  onIds: (modelId: string, ids: readonly string[]) => void;
}) {
  const t = useTranslations('AdminCatalog.models');
  const { columns, renderCard } = useVehicleDataColumns();
  const [page, setPage] = useState(1);
  // Bộ lọc đổi thì về trang 1 — trang 3 của kết quả cũ không có nghĩa với kết quả mới.
  const filterKey = JSON.stringify(filters);
  const [pageFilterKey, setPageFilterKey] = useState(filterKey);
  if (pageFilterKey !== filterKey) {
    setPageFilterKey(filterKey);
    setPage(1);
  }

  const { data, isError, isFetching, isLoading, refetch } = useVehicleDataList({
    ...filters,
    vehicleType,
    brandKey,
    modelId,
    page,
    limit: LINE_VEHICLES_PAGE_SIZE,
  });
  const items = useMemo(() => data?.data ?? [], [data]);

  useEffect(() => {
    onIds(
      modelId,
      items.map((r) => r.id),
    );
  }, [items, modelId, onIds]);
  // Dòng đóng lại thì xe của nó rời thứ tự trước/sau.
  useEffect(() => () => onIds(modelId, []), [modelId, onIds]);

  const addButton = onAdd ? (
    <Button size="small" icon={<PlusOutlined aria-hidden />} onClick={onAdd}>
      {t('tree.addVehicle')}
    </Button>
  ) : undefined;

  return (
    <div className={styles.lineVehicles}>
      <DataTable
        label={t('tree.lineVehiclesLabel', { line: lineLabel })}
        columns={columns}
        items={items}
        rowKey={(r) => r.id}
        minWidth={VEHICLE_DATA_TABLE_MIN_WIDTH}
        loading={isLoading || isFetching}
        error={
          isError && !data
            ? { title: t('tree.lineLoadError'), onRetry: () => void refetch() }
            : null
        }
        filtered={filtered}
        empty={{
          title: t('tree.lineEmpty'),
          description: t('tree.lineEmptyHint'),
          action: addButton,
        }}
        noResults={{ title: t('tree.lineNoMatch') }}
        onRowClick={(r) => onOpen(r.id)}
        selectedRowKey={selectedId}
        renderCard={renderCard}
        striped={false}
        pagination={
          data && data.meta.total > LINE_VEHICLES_PAGE_SIZE
            ? {
                meta: data.meta,
                onChange: (next) => setPage(next),
                totalLabel: (total) => t('tree.lineVehicles', { count: total }),
              }
            : undefined
        }
      />
    </div>
  );
}
