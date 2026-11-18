'use client';

import { EditOutlined } from '@ant-design/icons';
import { Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { INSURANCE_PREMIUM_BASIS, INSURANCE_PRODUCT_KIND, STATUS_COLOR } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useLocalizedText } from '@/i18n/localized';
import { useInsuranceProducts } from '../hooks';
import type { InsuranceProduct } from '../types';
import { InsuranceProductFormDialog } from './InsuranceProductFormDialog';
import { PremiumSyncCard } from './PremiumSyncCard';
import { PremiumCalculatorCard } from './PremiumCalculatorCard';
import { premiumConfigOf } from '../premium-plan';
import styles from './InsuranceProductsPanel.module.css';
import { LIST_SEPARATOR } from '@xeprime/domain';

const MIN_TABLE_WIDTH = 900;

/**
 * Danh mục sản phẩm bảo hiểm (ADR 0064). Danh mục nhỏ (một hãng × hai loại) nên không phân trang —
 * `UNIQUE (provider, kind)` ở DB giữ nó nhỏ. Biểu phí ngày KHÔNG ở đây: nó ở Chính sách phí.
 */
export function InsuranceProductsPanel() {
  const t = useTranslations('AdminInsurance.products');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const localized = useLocalizedText();
  const { data, isError, isFetching, refetch } = useInsuranceProducts();
  const [editing, setEditing] = useState<InsuranceProduct | null>(null);
  // Sản phẩm vật chất xe theo bậc (ADR 0088) — nguồn của thẻ tính thử.
  const tierProduct = data?.find(
    (p) =>
      p.kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP &&
      p.premiumBasis === INSURANCE_PREMIUM_BASIS.VALUE_TIER,
  );
  const tierConfig = tierProduct ? premiumConfigOf(tierProduct) : null;

  const perVehicle = (
    car: string | null | undefined,
    motorbike: string | null | undefined,
    fallback: string,
  ) =>
    car == null && motorbike == null
      ? fallback
      : t('perVehicle', {
          car: car == null ? fallback : fmt.money(car),
          motorbike: motorbike == null ? fallback : fmt.money(motorbike),
        });

  const columns: DataTableColumn<InsuranceProduct>[] = [
    {
      title: t('columns.product'),
      key: 'product',
      render: (_, p) => (
        <div className={styles.stack}>
          <span className={styles.strong}>{localized(p.nameVi, p.nameEn)}</span>
          <span className={styles.muted}>
            {domainLabel('insuranceProductKind', p.kind)}
            {LIST_SEPARATOR}
            {p.partnerProductCode}
          </span>
          {/* Sản phẩm tính theo ngày: phí mỗi ngày theo loại xe (ADR 0098). */}
          {p.premiumBasis === INSURANCE_PREMIUM_BASIS.DAILY ? (
            <span className={styles.muted}>
              {t('dailyRate', {
                value: perVehicle(p.dailyAmountCar, p.dailyAmountMotorbike, t('notSold')),
              })}
            </span>
          ) : null}
          {p.kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP ? (
            <span className={styles.muted}>
              {t('money', {
                serviceFee: p.serviceFeeEnabled ? `${fmt.rate(p.serviceFeePercent)}%` : t('off'),
                commission: `${fmt.rate(p.agencyCommissionPercent)}%`,
              })}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      title: t('columns.deductible'),
      key: 'deductible',
      render: (_, p) => perVehicle(p.deductibleCar, p.deductibleMotorbike, t('noDeductible')),
    },
    {
      title: t('columns.maxPayout'),
      key: 'maxPayout',
      render: (_, p) => {
        const note = localized(p.maxPayoutNoteVi, p.maxPayoutNoteEn);
        return (
          <div className={styles.stack}>
            {p.maxPayoutCar != null || p.maxPayoutMotorbike != null ? (
              <span>{perVehicle(p.maxPayoutCar, p.maxPayoutMotorbike, '-')}</span>
            ) : null}
            {note ? <span className={styles.muted}>{note}</span> : null}
          </div>
        );
      },
    },
    {
      title: t('columns.status'),
      key: 'status',
      width: 110,
      render: (_, p) => (
        <Tag color={p.isActive ? STATUS_COLOR.SUCCESS : STATUS_COLOR.NEUTRAL}>
          {p.isActive ? t('active') : t('inactive')}
        </Tag>
      ),
    },
    {
      title: t('columns.updatedAt'),
      key: 'updatedAt',
      width: 150,
      render: (_, p) => <span className={styles.muted}>{fmt.dateTime(p.updatedAt)}</span>,
    },
    actionColumn<InsuranceProduct>(
      (p) => [
        { key: 'edit', label: t('edit'), icon: <EditOutlined />, onClick: () => setEditing(p) },
      ],
      { width: 100 },
    ),
  ];

  return (
    <div className={styles.panel}>
      <DataTable<InsuranceProduct>
        label={t('tableLabel')}
        columns={columns}
        items={data ?? []}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={isError && !data ? { title: t('loadError'), onRetry: () => void refetch() } : null}
        empty={{ title: t('empty.title'), description: t('empty.description') }}
      />
      {/* Biểu phí đang áp dụng + đồng bộ từ hãng (ADR 0106). */}
      {tierProduct && tierConfig ? <PremiumSyncCard product={tierProduct} /> : null}
      {tierConfig ? <PremiumCalculatorCard config={tierConfig} /> : null}
      <InsuranceProductFormDialog
        key={editing?.id ?? 'closed'}
        product={editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
