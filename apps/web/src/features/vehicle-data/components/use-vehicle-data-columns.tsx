'use client';

import { CheckCircleOutlined, RightOutlined } from '@ant-design/icons';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  VEHICLE_DATA_ORIGIN,
  VEHICLE_TYPE,
  type VehicleDataGap,
  type VehicleDataOrigin,
} from '@xeprime/types';
import { Tag } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import type { DataTableColumn } from '@/components/data-display/DataTable';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';

import { MARKET_DIFF_ALERT_PERCENT, marketDiffPercent } from '../format';
import type { VehicleDataListItem } from '../types';
import { useYearsLabel } from '../use-years-label';
import { VehicleDataStatusTag } from './VehicleDataStatusTag';
import styles from './VehicleData.module.css';

/** Bề rộng tối thiểu của bảng xe chuẩn — dưới mức này bảng cuộn ngang thay vì bóp cột. */
export const VEHICLE_DATA_TABLE_MIN_WIDTH = 1000;

/**
 * Cột + thẻ mobile của danh sách xe chuẩn (ADR 0090). Một nơi duy nhất, để mọi chỗ hiện danh sách
 * xe chuẩn đọc cùng một cách — hiện là danh sách xe của một dòng ở tab Mẫu xe (ADR 0096): dòng xe
 * đã nằm ở hàng cha nên ô xe chỉ còn phiên bản và đời.
 */
export function useVehicleDataColumns(): {
  columns: DataTableColumn<VehicleDataListItem>[];
  renderCard: (row: VehicleDataListItem) => ReactNode;
} {
  const t = useTranslations('AdminVehicleData');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const yearsLabel = useYearsLabel();

  const spec = (r: VehicleDataListItem) =>
    [
      r.vehicleType === VEHICLE_TYPE.CAR && r.seatCount
        ? t('cells.seats', { count: r.seatCount })
        : null,
      r.fuelType ? domainLabel('fuelType', r.fuelType) : null,
      r.transmission ? domainLabel('transmissionType', r.transmission) : null,
      r.bodyType ? domainLabel('bodyType', r.bodyType) : null,
    ]
      .filter(Boolean)
      .join(LIST_SEPARATOR) || t('cells.none');

  const vehicleCell = (r: VehicleDataListItem) => (
    <span className={styles.stack}>
      <span className={styles.strong}>{r.variantLabel || t('cells.anyVariant')}</span>
      <span className={styles.muted}>{yearsLabel(r.yearFrom, r.yearTo)}</span>
    </span>
  );

  const rentCell = (r: VehicleDataListItem) => {
    const diff = marketDiffPercent(r.weekdayPrice, r.marketWeekday?.median ?? null);
    return (
      <span className={styles.stack}>
        <span className={styles.amount}>
          {r.weekdayPrice ? fmt.money(r.weekdayPrice) : t('cells.none')}
        </span>
        {r.marketWeekday?.median ? (
          <span className={styles.muted}>
            {t('cells.market', {
              price: fmt.money(r.marketWeekday.median),
              count: r.marketWeekday.sampleSize,
            })}
          </span>
        ) : null}
        {diff != null && Math.abs(diff) >= MARKET_DIFF_ALERT_PERCENT ? (
          <span className={diff > 0 ? styles.above : styles.below}>
            {diff > 0
              ? t('cells.marketAbove', { percent: diff })
              : t('cells.marketBelow', { percent: -diff })}
          </span>
        ) : null}
      </span>
    );
  };

  const gapsCell = (r: VehicleDataListItem) =>
    r.gaps.length === 0 ? (
      <span className={styles.ok}>
        <CheckCircleOutlined aria-hidden /> {t('cells.complete')}
      </span>
    ) : (
      <span className={styles.inline}>
        {r.gaps.map((g) => (
          <Tag key={g} className={styles.tag}>
            {t(`gap.${g as VehicleDataGap}`)}
          </Tag>
        ))}
      </span>
    );

  const statusCell = (r: VehicleDataListItem) => (
    <span className={styles.stack}>
      <VehicleDataStatusTag status={r.status} />
      <span className={styles.muted}>
        {r.origin === VEHICLE_DATA_ORIGIN.OWNER && r.proposedByTenantName
          ? t('cells.byOwner', { tenant: r.proposedByTenantName })
          : t(`origin.${r.origin as VehicleDataOrigin}`)}
      </span>
    </span>
  );

  const columns: DataTableColumn<VehicleDataListItem>[] = [
    { title: t('columns.vehicle'), key: 'vehicle', width: 200, render: (_, r) => vehicleCell(r) },
    {
      title: t('columns.spec'),
      key: 'spec',
      width: 200,
      render: (_, r) => <span className={styles.muted}>{spec(r)}</span>,
    },
    {
      title: t('columns.listPrice'),
      key: 'listPrice',
      width: 130,
      align: 'right',
      render: (_, r) => (
        <span className={styles.amount}>
          {r.listPrice ? fmt.money(r.listPrice) : t('cells.none')}
        </span>
      ),
    },
    { title: t('columns.rent'), key: 'rent', width: 190, render: (_, r) => rentCell(r) },
    {
      title: t('columns.usage'),
      key: 'usage',
      width: 90,
      align: 'right',
      render: (_, r) => r.usageCount,
    },
    { title: t('columns.status'), key: 'status', width: 160, render: (_, r) => statusCell(r) },
    { title: t('columns.gaps'), key: 'gaps', width: 170, render: (_, r) => gapsCell(r) },
    {
      title: <span className={styles.srOnly}>{t('columns.open')}</span>,
      key: 'open',
      width: 36,
      align: 'right',
      render: () => <RightOutlined className={styles.muted} aria-hidden />,
    },
  ];

  const renderCard = (r: VehicleDataListItem) => (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        {vehicleCell(r)}
        <VehicleDataStatusTag status={r.status} />
      </div>
      <span className={styles.muted}>{spec(r)}</span>
      {rentCell(r)}
      {gapsCell(r)}
    </div>
  );

  return { columns, renderCard };
}
