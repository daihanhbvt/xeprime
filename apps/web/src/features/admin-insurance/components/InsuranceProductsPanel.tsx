'use client';

import { EditOutlined } from '@ant-design/icons';
import { Alert, Tag } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { STATUS_COLOR } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { ROUTES } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useLocalizedText } from '@/i18n/localized';
import { useInsuranceProducts } from '../hooks';
import type { InsuranceProduct } from '../types';
import { InsuranceProductFormDialog } from './InsuranceProductFormDialog';
import styles from './InsuranceProductsPanel.module.css';

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
            {domainLabel('insuranceProductKind', p.kind)} · {p.partnerProductCode}
          </span>
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
              <span>{perVehicle(p.maxPayoutCar, p.maxPayoutMotorbike, '—')}</span>
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
      <Alert
        type="info"
        showIcon
        title={t('feePolicyNote')}
        action={<Link href={ROUTES.ADMIN.FEE_POLICIES}>{t('openFeePolicies')}</Link>}
      />
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
      <InsuranceProductFormDialog
        key={editing?.id ?? 'closed'}
        product={editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
