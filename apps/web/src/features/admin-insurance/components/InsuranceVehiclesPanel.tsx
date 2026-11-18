'use client';

import { CarOutlined, SyncOutlined } from '@ant-design/icons';
import { Alert, Button, Skeleton, Tag } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  INSURANCE_MODE,
  INSURANCE_PREMIUM_BASIS,
  INSURANCE_PRODUCT_KIND,
  INSURANCE_VEHICLE_ELIGIBILITY_FILTER_VALUES,
  STATUS_COLOR,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { ROUTES } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { INSURANCE_VEHICLE_DEFAULT_LIMIT } from '../api';
import {
  useInsuranceProducts,
  useInsuranceVehicleFilters,
  useInsuranceVehicles,
  useVehiclePremiumCheck,
} from '../hooks';
import { premiumConfigForYear, premiumConfigOf, premiumPlan } from '../premium-plan';
import type { InsuranceVehicleFilters, InsuranceVehicleRow } from '../types';
import { PremiumPlanTable } from './PremiumPlanTable';
import styles from './InsuranceVehiclesPanel.module.css';

const MIN_TABLE_WIDTH = 1080;

/**
 * Ô TÔ và bảo hiểm (ADR 0097) — mỗi xe: giá trị xe, chế độ chủ xe chọn (Bắt buộc/Tuỳ chọn), đủ điều
 * kiện hay còn thiếu gì, và phí từng bậc thời lượng theo bảng bậc hiện hành. Lọc/tìm/phân trang ở
 * server, bộ lọc trên URL. "Đối chiếu MIC" hỏi hãng phí từng bậc cho đúng chiếc xe đó.
 */
export function InsuranceVehiclesPanel() {
  const t = useTranslations('AdminInsurance.vehicles');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { filters, setFilters } = useInsuranceVehicleFilters();
  const { data, isError, isFetching, refetch } = useInsuranceVehicles(filters);
  const [checking, setChecking] = useState<InsuranceVehicleRow | null>(null);

  const items = data?.items ?? [];
  const meta = data?.meta ?? {
    page: 1,
    limit: INSURANCE_VEHICLE_DEFAULT_LIMIT,
    total: 0,
    hasNext: false,
  };
  const filtered = Boolean(filters.q || filters.eligibility);

  const filterFields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.search'),
      placeholder: t('filters.searchPlaceholder'),
    },
    {
      kind: 'select',
      key: 'eligibility',
      label: t('filters.eligibility'),
      allowClear: true,
      options: INSURANCE_VEHICLE_ELIGIBILITY_FILTER_VALUES.map((value) => ({
        value,
        label: t(`eligibility.${value}`),
      })),
    },
  ];

  const canCheck = (row: InsuranceVehicleRow) =>
    Boolean(row.insuredValue && row.manufactureYear && row.seatCount);

  const columns: DataTableColumn<InsuranceVehicleRow>[] = [
    {
      title: t('columns.vehicle'),
      key: 'vehicle',
      render: (_, row) => (
        <div className={styles.stack}>
          <Link
            href={`${ROUTES.ADMIN.VEHICLES}?open=${encodeURIComponent(row.vehicleId)}`}
            className={styles.strong}
          >
            {row.vehicleName}
          </Link>
          <span className={styles.muted}>
            {[row.plateNumber, row.tenantName].filter(Boolean).join(LIST_SEPARATOR)}
          </span>
        </div>
      ),
    },
    {
      title: t('columns.insuredValue'),
      key: 'insuredValue',
      align: 'right',
      width: 150,
      render: (_, row) =>
        row.insuredValue ? (
          <span className={styles.amount}>{fmt.money(row.insuredValue)}</span>
        ) : (
          <span className={styles.muted}>-</span>
        ),
    },
    {
      title: t('columns.mode'),
      key: 'mode',
      width: 120,
      render: (_, row) => (
        <Tag
          color={
            row.insuranceMode === INSURANCE_MODE.REQUIRED ? STATUS_COLOR.INFO : STATUS_COLOR.NEUTRAL
          }
        >
          {domainLabel('insuranceMode', row.insuranceMode)}
        </Tag>
      ),
    },
    {
      title: t('columns.eligibility'),
      key: 'eligibility',
      render: (_, row) =>
        row.eligible ? (
          <Tag color={STATUS_COLOR.SUCCESS}>{t('eligibleTag')}</Tag>
        ) : (
          <ul className={styles.gaps}>
            {row.gaps.map((gap) => (
              <li key={gap}>{domainLabel('insuranceEligibilityGap', gap)}</li>
            ))}
          </ul>
        ),
    },
    {
      title: t('columns.premiums'),
      key: 'premiums',
      width: 210,
      render: (_, row) =>
        row.tiers.length === 0 ? (
          <span className={styles.muted}>-</span>
        ) : (
          <ul className={styles.tiers}>
            {row.tiers.map((tier) => (
              <li key={tier.maxDays}>
                <span className={styles.muted}>{t('tierDays', { days: tier.maxDays })}</span>
                <span className={styles.amount}>{fmt.money(tier.premium)}</span>
              </li>
            ))}
          </ul>
        ),
    },
    actionColumn<InsuranceVehicleRow>(
      (row) =>
        canCheck(row)
          ? [
              {
                key: 'check',
                label: t('check'),
                icon: <SyncOutlined />,
                onClick: () => setChecking(row),
              },
            ]
          : [],
      { width: 120 },
    ),
  ];

  return (
    <div className={styles.panel}>
      <FilterBar
        fields={filterFields}
        values={{ q: filters.q, eligibility: filters.eligibility }}
        onChange={(patch) => setFilters(patch as Partial<InsuranceVehicleFilters>)}
      />
      <DataTable<InsuranceVehicleRow>
        label={t('tableLabel')}
        columns={columns}
        items={items}
        rowKey={(row) => row.vehicleId}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={isError && !data ? { title: t('loadError'), onRetry: () => void refetch() } : null}
        filtered={filtered}
        empty={{ title: t('empty.title'), description: t('empty.description') }}
        noResults={{ title: t('noResults') }}
        renderCard={(row) => (
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.strong}>{row.vehicleName}</span>
              {row.eligible ? <Tag color={STATUS_COLOR.SUCCESS}>{t('eligibleTag')}</Tag> : null}
            </div>
            <span className={styles.muted}>
              {[row.plateNumber, row.tenantName].filter(Boolean).join(LIST_SEPARATOR)}
            </span>
            {row.insuredValue ? (
              <span>{t('card.value', { amount: fmt.money(row.insuredValue) })}</span>
            ) : null}
            {row.tiers[0] ? (
              <span>
                {t('card.firstTier', {
                  days: row.tiers[0].maxDays,
                  amount: fmt.money(row.tiers[0].premium),
                })}
              </span>
            ) : null}
            {canCheck(row) ? (
              <Button
                size="small"
                icon={<SyncOutlined aria-hidden />}
                onClick={() => setChecking(row)}
              >
                {t('check')}
              </Button>
            ) : null}
          </div>
        )}
        pagination={{
          meta,
          onChange: (page, limit) => setFilters({ page, limit }),
          totalLabel: (total) => t('total', { count: total }),
        }}
      />
      {checking ? (
        <PremiumCheckDialog
          key={checking.vehicleId}
          vehicle={checking}
          onClose={() => setChecking(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Đối chiếu biểu phí với hãng cho MỘT xe: hỏi MIC phí từng bậc (một lượt khi mở hộp, nút "Hỏi lại")
 * rồi đặt cạnh bảng phí hệ thống đang dùng.
 */
function PremiumCheckDialog({
  vehicle,
  onClose,
}: {
  vehicle: InsuranceVehicleRow;
  onClose: () => void;
}) {
  const t = useTranslations('AdminInsurance.vehicles.checkDialog');
  const errorMessage = useErrorMessage();
  const products = useInsuranceProducts();
  const check = useVehiclePremiumCheck(vehicle.vehicleId);
  const run = () => {
    if (check.isFetching) return;
    void check.refetch();
  };

  const product = products.data?.find(
    (p) =>
      p.kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP &&
      p.premiumBasis === INSURANCE_PREMIUM_BASIS.VALUE_TIER,
  );
  // % theo NĂM SẢN XUẤT của chính xe này (ADR 0106).
  const baseConfig = product ? premiumConfigOf(product) : null;
  const config = baseConfig ? premiumConfigForYear(baseConfig, vehicle.manufactureYear) : null;
  const rows = config && vehicle.insuredValue ? premiumPlan(vehicle.insuredValue, config) : null;

  return (
    <ResponsiveDialog
      title={t('title', { name: vehicle.vehicleName })}
      open
      onClose={onClose}
      size="xl"
      footer={
        <Button icon={<SyncOutlined aria-hidden />} loading={check.isFetching} onClick={run}>
          {t('again')}
        </Button>
      }
    >
      <div className={styles.dialog}>
        <p className={styles.muted}>
          <CarOutlined aria-hidden /> {t('intro')}
        </p>
        {check.isError ? <Alert type="error" showIcon title={errorMessage(check.error)} /> : null}
        {check.data ? (
          <Alert
            type={
              check.data.rows.some((r) => r.difference && r.difference !== '0') ||
              check.data.rows.some((r) => !r.partnerPremium)
                ? 'warning'
                : 'success'
            }
            showIcon
            title={t('checkedBy', { partner: check.data.partnerName })}
          />
        ) : null}
        {products.isLoading || (check.isFetching && !check.data) ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : rows && config ? (
          <PremiumPlanTable
            tiers={config.tiers}
            rows={rows}
            check={check.data ?? null}
            label={t('tableLabel')}
          />
        ) : (
          <p className={styles.muted}>{t('noTiers')}</p>
        )}
      </div>
    </ResponsiveDialog>
  );
}
