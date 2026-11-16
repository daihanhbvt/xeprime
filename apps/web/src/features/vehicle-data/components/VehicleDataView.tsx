'use client';

import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  EyeInvisibleOutlined,
  HistoryOutlined,
  MoreOutlined,
  PlusOutlined,
  RightOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  CATALOG_TYPE,
  VEHICLE_DATA_GAP_ANY,
  VEHICLE_DATA_GAP_VALUES,
  VEHICLE_DATA_ORIGIN,
  VEHICLE_DATA_ORIGIN_VALUES,
  VEHICLE_DATA_STATUS,
  VEHICLE_DATA_STATUS_VALUES,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  type VehicleDataGap,
  type VehicleDataOrigin,
} from '@xeprime/types';
import { Button, Dropdown, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { SummaryStrip, type SummaryStripItem } from '@/components/data-display/SummaryStrip';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { useCatalogItems } from '@/features/catalog/use-catalog';
import { useOpenRecordPager } from '@/hooks/use-open-record-pager';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';

import { VEHICLE_DATA_DEFAULT_LIMIT, vehicleDataHref } from '../api';
import { MARKET_DIFF_ALERT_PERCENT, marketDiffPercent } from '../format';
import { VEHICLE_DATA_SORT_VALUES, useVehicleDataFilters, useVehicleDataList } from '../hooks';
import type { VehicleDataFilters, VehicleDataListItem } from '../types';
import { useYearsLabel } from '../use-years-label';
import { NEW_RECORD, VehicleDataDrawer } from './VehicleDataDrawer';
import { VehicleDataImportDialog } from './VehicleDataImportDialog';
import { VehicleDataImportHistory } from './VehicleDataImportHistory';
import { VehicleDataStatusTag } from './VehicleDataStatusTag';
import styles from './VehicleData.module.css';

const MIN_TABLE_WIDTH = 1180;

/** Ô số liệu ⇒ bộ lọc tương ứng; ô đang sáng suy ngược từ bộ lọc. */
const SUMMARY_FILTER: Record<string, Partial<VehicleDataFilters>> = {
  total: { status: undefined, gap: undefined },
  active: { status: VEHICLE_DATA_STATUS.ACTIVE, gap: undefined },
  pending: { status: VEHICLE_DATA_STATUS.PENDING, gap: undefined },
  incomplete: { status: VEHICLE_DATA_STATUS.ACTIVE, gap: VEHICLE_DATA_GAP_ANY },
  hidden: { status: VEHICLE_DATA_STATUS.HIDDEN, gap: undefined },
};

function activeSummaryKey(filters: VehicleDataFilters): string | null {
  if (filters.status === VEHICLE_DATA_STATUS.ACTIVE && filters.gap === VEHICLE_DATA_GAP_ANY) {
    return 'incomplete';
  }
  if (filters.gap) return null;
  if (!filters.status) return 'total';
  return filters.status;
}

/**
 * Màn "DỮ LIỆU XE" của quản trị (ADR 0090) — MỘT danh sách: mỗi dòng là một xe chuẩn (hãng · dòng ·
 * phiên bản · đời) với thông số, giá bán, giá thuê tham khảo. Dữ liệu tự ghi nhận từ xe của chủ xe
 * nằm cùng danh sách ở trạng thái "Chờ duyệt". Lọc/sắp/phân trang ở SERVER, bộ lọc trên URL (ADR
 * 0004); bấm một dòng mở panel làm việc (`?open=`, `new` = thêm xe).
 */
export function VehicleDataView() {
  const t = useTranslations('AdminVehicleData');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { filters, setFilters } = useVehicleDataFilters();
  const { data, isError, isFetching, refetch } = useVehicleDataList(filters);
  const [importOpen, setImportOpen] = useState(false);
  const [importId, setImportId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const items = data?.data ?? [];
  const meta = data?.meta ?? {
    page: 1,
    limit: VEHICLE_DATA_DEFAULT_LIMIT,
    total: 0,
    hasNext: false,
  };
  const summary = data?.summary;
  const pager = useOpenRecordPager(
    items.map((r) => r.id),
    filters.open === NEW_RECORD ? null : filters.open,
  );

  const { items: brands } = useCatalogItems(CATALOG_TYPE.VEHICLE_BRAND);
  const brandOptions = useMemo(
    () =>
      brands
        .filter(
          (b) =>
            !filters.vehicleType ||
            b.vehicleTypes.length === 0 ||
            (b.vehicleTypes as string[]).includes(filters.vehicleType),
        )
        .map((b) => ({ value: b.key, label: b.label })),
    [brands, filters.vehicleType],
  );

  const filterFields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.search'),
      placeholder: t('filters.searchPlaceholder'),
    },
    {
      kind: 'select',
      key: 'vehicleType',
      label: t('filters.vehicleType'),
      allowClear: true,
      options: VEHICLE_TYPE_VALUES.map((value) => ({
        value,
        label: domainLabel('vehicleType', value),
      })),
    },
    {
      kind: 'select',
      key: 'brandKey',
      label: t('filters.brand'),
      allowClear: true,
      searchable: true,
      options: brandOptions,
    },
    {
      kind: 'select',
      key: 'status',
      label: t('filters.status'),
      allowClear: true,
      options: VEHICLE_DATA_STATUS_VALUES.map((value) => ({ value, label: t(`status.${value}`) })),
    },
    {
      kind: 'select',
      key: 'gap',
      label: t('filters.gap'),
      allowClear: true,
      options: [...VEHICLE_DATA_GAP_VALUES, VEHICLE_DATA_GAP_ANY].map((value) => ({
        value,
        label: t(`gap.${value as VehicleDataGap | typeof VEHICLE_DATA_GAP_ANY}`),
      })),
    },
    {
      kind: 'select',
      key: 'origin',
      label: t('filters.origin'),
      allowClear: true,
      options: VEHICLE_DATA_ORIGIN_VALUES.map((value) => ({ value, label: t(`origin.${value}`) })),
    },
    {
      kind: 'select',
      key: 'sort',
      label: t('filters.sort'),
      defaultValue: 'updated_desc',
      options: VEHICLE_DATA_SORT_VALUES.map((value) => ({
        value,
        label: t(`filters.sortOptions.${value}`),
      })),
    },
  ];
  const filtered = Boolean(
    filters.q ||
    filters.vehicleType ||
    filters.brandKey ||
    filters.status ||
    filters.gap ||
    filters.origin,
  );

  const summaryItems: SummaryStripItem[] = [
    {
      key: 'total',
      icon: DatabaseOutlined,
      tone: 'neutral',
      value: summary?.total ?? 0,
      label: t('summary.total'),
    },
    {
      key: 'active',
      icon: CheckCircleOutlined,
      tone: 'success',
      value: summary?.active ?? 0,
      label: t('summary.active'),
    },
    {
      key: 'pending',
      icon: ClockCircleOutlined,
      tone: 'warning',
      value: summary?.pending ?? 0,
      label: t('summary.pending'),
    },
    {
      key: 'incomplete',
      icon: ExclamationCircleOutlined,
      tone: 'danger',
      value: summary?.incomplete ?? 0,
      label: t('summary.incomplete'),
    },
    {
      key: 'hidden',
      icon: EyeInvisibleOutlined,
      tone: 'neutral',
      value: summary?.hidden ?? 0,
      label: t('summary.hidden'),
    },
  ];

  const yearsLabel = useYearsLabel();
  const years = (r: Pick<VehicleDataListItem, 'yearFrom' | 'yearTo'>) =>
    yearsLabel(r.yearFrom, r.yearTo);
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
      .join(' · ') || t('cells.none');

  const vehicleCell = (r: VehicleDataListItem) => (
    <span className={styles.stack}>
      <span className={styles.strong}>
        {r.brandLabel} {r.modelLabel}
      </span>
      <span className={styles.muted}>
        {r.variantLabel || t('cells.anyVariant')} · {years(r)}
      </span>
      {r.modelPending ? (
        <span>
          <Tag className={styles.tag}>{t('cells.newModel')}</Tag>
        </span>
      ) : null}
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

  const columns: DataTableColumn<VehicleDataListItem>[] = [
    { title: t('columns.vehicle'), key: 'vehicle', width: 260, render: (_, r) => vehicleCell(r) },
    {
      title: t('columns.spec'),
      key: 'spec',
      width: 220,
      render: (_, r) => <span className={styles.muted}>{spec(r)}</span>,
    },
    {
      title: t('columns.listPrice'),
      key: 'listPrice',
      width: 140,
      align: 'right',
      render: (_, r) => (
        <span className={styles.amount}>
          {r.listPrice ? fmt.money(r.listPrice) : t('cells.none')}
        </span>
      ),
    },
    { title: t('columns.rent'), key: 'rent', width: 200, render: (_, r) => rentCell(r) },
    {
      title: t('columns.usage'),
      key: 'usage',
      width: 110,
      align: 'right',
      render: (_, r) => r.usageCount,
    },
    {
      title: t('columns.status'),
      key: 'status',
      width: 170,
      render: (_, r) => (
        <span className={styles.stack}>
          <VehicleDataStatusTag status={r.status} />
          <span className={styles.muted}>
            {r.origin === VEHICLE_DATA_ORIGIN.OWNER && r.proposedByTenantName
              ? t('cells.byOwner', { tenant: r.proposedByTenantName })
              : t(`origin.${r.origin as VehicleDataOrigin}`)}
          </span>
        </span>
      ),
    },
    { title: t('columns.gaps'), key: 'gaps', width: 180, render: (_, r) => gapsCell(r) },
    {
      title: t('columns.updated'),
      key: 'updated',
      width: 130,
      render: (_, r) => <span className={styles.muted}>{fmt.date(r.updatedAt)}</span>,
    },
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

  const open = (id: string) => {
    pager.remember();
    setFilters({ open: id }, { resetPage: false });
  };

  return (
    <div className={styles.panel}>
      <ManagePageHeader
        title={t('page.title')}
        subtitle={t('page.subtitle')}
        extra={
          <div className={styles.headerActions}>
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'template',
                    icon: <DownloadOutlined aria-hidden />,
                    label: <a href={vehicleDataHref.template()}>{t('page.template')}</a>,
                  },
                  {
                    key: 'history',
                    icon: <HistoryOutlined aria-hidden />,
                    label: t('page.history'),
                    onClick: () => setHistoryOpen(true),
                  },
                ],
              }}
            >
              <Button icon={<MoreOutlined aria-hidden />} aria-label={t('page.more')} />
            </Dropdown>
            <Button icon={<DownloadOutlined aria-hidden />} href={vehicleDataHref.export(filters)}>
              {t('page.export')}
            </Button>
            <Button
              icon={<UploadOutlined aria-hidden />}
              onClick={() => {
                setImportId(null);
                setImportOpen(true);
              }}
            >
              {t('page.import')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined aria-hidden />}
              onClick={() => open(NEW_RECORD)}
            >
              {t('page.add')}
            </Button>
          </div>
        }
      />

      <SummaryStrip
        items={summaryItems}
        loading={!summary}
        ariaLabel={t('summary.ariaLabel')}
        active={activeSummaryKey(filters)}
        onSelect={(key) => setFilters(SUMMARY_FILTER[key] ?? {})}
      />

      <FilterBar
        fields={filterFields}
        values={{
          q: filters.q,
          vehicleType: filters.vehicleType,
          brandKey: filters.brandKey,
          status: filters.status,
          gap: filters.gap,
          origin: filters.origin,
          sort: filters.sort ?? 'updated_desc',
        }}
        // FilterBar gửi đúng TRƯỜNG vừa đổi — ghi thẳng bản vá. Đổi loại xe thì bỏ hãng đã chọn (hãng
        // có thể không bán loại xe kia).
        onChange={(patch) => {
          const next = patch as Partial<VehicleDataFilters>;
          setFilters('vehicleType' in next ? { ...next, brandKey: undefined } : next);
        }}
        onClear={() =>
          setFilters({
            q: undefined,
            vehicleType: undefined,
            brandKey: undefined,
            status: undefined,
            gap: undefined,
            origin: undefined,
            sort: undefined,
          })
        }
      />

      <DataTable<VehicleDataListItem>
        label={t('tableLabel')}
        columns={columns}
        items={items}
        rowKey={(r) => r.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={isError && !data ? { title: t('loadError'), onRetry: () => void refetch() } : null}
        filtered={filtered}
        empty={{ title: t('empty.title'), description: t('empty.description') }}
        noResults={{ title: t('noResults') }}
        onRowClick={(r) => open(r.id)}
        selectedRowKey={filters.open ?? null}
        renderCard={renderCard}
        pagination={{
          meta,
          onChange: (page, limit) => setFilters({ page, limit }),
          totalLabel: (total) => t('total', { count: total }),
        }}
      />

      <VehicleDataDrawer
        openId={filters.open ?? null}
        previousId={pager.previousId}
        nextId={pager.nextId}
        onNavigate={(id) => setFilters({ open: id }, { resetPage: false })}
        onClose={() => setFilters({ open: undefined }, { resetPage: false })}
      />

      <VehicleDataImportDialog
        key={importId ?? 'upload'}
        open={importOpen}
        importId={importId}
        onClose={() => {
          setImportOpen(false);
          setImportId(null);
        }}
      />

      <VehicleDataImportHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onOpenImport={(id) => {
          setHistoryOpen(false);
          setImportId(id);
          setImportOpen(true);
        }}
      />
    </div>
  );
}
