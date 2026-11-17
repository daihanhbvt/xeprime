'use client';

import { VEHICLE_DATA_STATUS } from '@xeprime/types';
import { App, Select } from 'antd';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useMemo, useState } from 'react';

import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useErrorMessage } from '@/i18n/use-error-message';

import { vehicleDataTitle } from '../format';
import { useMergeVehicleData, useVehicleDataList } from '../hooks';
import type { VehicleDataDetail } from '../types';
import { useYearsLabel } from '../use-years-label';
import styles from './VehicleData.module.css';

const SEARCH_LIMIT = 20;

/**
 * Gộp dữ liệu chờ duyệt vào một xe chuẩn ĐÃ CÓ: tìm ở server (mọi xe đã duyệt cùng loại xe), các
 * xe "có thể trùng" của panel đứng đầu làm gợi ý. Gộp xong, xe của chủ xe trỏ sang xe đích.
 */
export function VehicleDataMergeDialog({
  open,
  source,
  onClose,
  onMerged,
}: {
  open: boolean;
  source: VehicleDataDetail;
  onClose: () => void;
  onMerged: (vehiclesAffected: number) => void;
}) {
  const t = useTranslations('AdminVehicleData');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const merge = useMergeVehicleData();
  const years = useYearsLabel();
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search.trim());
  const [targetId, setTargetId] = useState<string | null>(null);

  const list = useVehicleDataList({
    q: deferred || `${source.brandLabel} ${source.modelLabel}`,
    vehicleType: source.vehicleType,
    page: 1,
    limit: SEARCH_LIMIT,
  });

  const options = useMemo(() => {
    const found = (list.data?.data ?? [])
      .filter((r) => r.id !== source.id && r.status !== VEHICLE_DATA_STATUS.PENDING)
      .map((r) => ({
        value: r.id,
        label: `${vehicleDataTitle(r)} · ${years(r.yearFrom, r.yearTo)}`,
      }));
    const suggested = source.similar
      .filter((s) => s.status !== VEHICLE_DATA_STATUS.PENDING)
      .map((s) => ({
        value: s.id,
        label: `${vehicleDataTitle({ ...source, variantLabel: s.variantLabel })} · ${years(s.yearFrom, s.yearTo)}`,
      }))
      .filter((s) => !found.some((f) => f.value === s.value));
    return [
      ...(suggested.length ? [{ label: t('merge.suggested'), options: suggested }] : []),
      ...found,
    ];
  }, [list.data, source, t, years]);

  const submit = () => {
    if (!targetId || merge.isPending) return;
    merge.mutate(
      { id: source.id, targetId },
      {
        onSuccess: (result) => onMerged(result.vehiclesAffected),
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      size="md"
      title={t('merge.title')}
      okText={t('merge.ok')}
      okDisabled={!targetId}
      confirmLoading={merge.isPending}
      onOk={submit}
    >
      <div className={styles.stack}>
        <p className={styles.note}>{t('merge.description')}</p>
        <label className={styles.strong} htmlFor="vd-merge-target">
          {t('merge.label')}
        </label>
        <Select
          id="vd-merge-target"
          showSearch
          filterOption={false}
          value={targetId ?? undefined}
          onSearch={setSearch}
          onChange={(value: string) => setTargetId(value)}
          options={options}
          loading={list.isFetching}
          placeholder={t('merge.placeholder')}
          notFoundContent={list.isFetching ? null : t('merge.empty')}
        />
      </div>
    </ResponsiveDialog>
  );
}
