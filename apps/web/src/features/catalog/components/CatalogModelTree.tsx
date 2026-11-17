'use client';

import {
  CheckCircleOutlined,
  ClockCircleFilled,
  ClockCircleOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  EyeInvisibleOutlined,
  HistoryOutlined,
  MoreOutlined,
  PlusOutlined,
  UploadOutlined,
  WarningFilled,
} from '@ant-design/icons';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  CATALOG_MARKET_STATUS_VALUES,
  STATUS_COLOR,
  VEHICLE_DATA_GAP_ANY,
  VEHICLE_DATA_GAP_VALUES,
  VEHICLE_DATA_ORIGIN_VALUES,
  VEHICLE_DATA_STATUS,
  VEHICLE_DATA_STATUS_VALUES,
  VEHICLE_TYPE,
  catalogModelMissingSpecs,
  normalizeCatalogSearch,
  type CatalogMarketStatus,
  type CatalogModelSpec,
  type VehicleDataGap,
  type VehicleType,
} from '@xeprime/types';
import { App, Button, Dropdown, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { SummaryStrip, type SummaryStripItem } from '@/components/data-display/SummaryStrip';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { useOpenRecordPager } from '@/hooks/use-open-record-pager';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { vehicleDataHref } from '@/features/vehicle-data/api';
import {
  NEW_RECORD,
  VehicleDataDrawer,
} from '@/features/vehicle-data/components/VehicleDataDrawer';
import { VehicleDataImportDialog } from '@/features/vehicle-data/components/VehicleDataImportDialog';
import { VehicleDataImportHistory } from '@/features/vehicle-data/components/VehicleDataImportHistory';
import {
  VEHICLE_DATA_SORT_VALUES,
  parseVehicleDataFilters,
  useVehicleDataModelCounts,
} from '@/features/vehicle-data/hooks';
import type { VehicleDataFilters, VehicleDataModelCount } from '@/features/vehicle-data/types';

import { useDeleteCatalogModel, type CatalogModelAdmin } from '../use-admin-catalog-models';
import type { CatalogBrandEntry } from './CatalogBrandList';
import { CatalogLineVehicles, type LineVehicleFilters } from './CatalogLineVehicles';
import { CatalogModelFormModal } from './CatalogModelFormModal';
import styles from './CatalogModelsPanel.module.css';

const MIN_TABLE_WIDTH = 1080;
/** Trong một dòng, xếp theo phiên bản rồi đời là thứ tự dễ đọc nhất. */
const DEFAULT_SORT = 'name_asc';
/** Giá trị của bộ lọc "Thông số dòng" — `missing=true` trên URL. */
const LINE_SPECS_MISSING = 'true';

/** Nhóm của dòng xe mới do chủ xe gõ, chưa duyệt — đứng sau hai nhóm phân phối. */
const PENDING_GROUP = 'pending';
type LineGroup = CatalogMarketStatus | typeof PENDING_GROUP;

interface TreeFilters extends VehicleDataFilters {
  /** Chỉ dòng xe còn thiếu thông số cấp dòng (số chỗ / nhiên liệu / hộp số). */
  missing: boolean;
}

function parseTreeFilters(params: URLSearchParams): TreeFilters {
  return { ...parseVehicleDataFilters(params), missing: params.get('missing') === 'true' };
}

/** Một hàng của cây: một dòng xe, kèm số xe chuẩn của nó. */
interface LineRow {
  id: string;
  label: string;
  group: LineGroup;
  /** `null` = dòng mới chờ duyệt (chưa vào danh mục — duyệt đi theo xe chuẩn của nó). */
  model: CatalogModelAdmin | null;
  counts: VehicleDataModelCount | null;
  missing: CatalogModelSpec[];
}

/** Ô số liệu ⇒ bộ lọc tương ứng; ô đang sáng suy ngược từ bộ lọc. */
const SUMMARY_FILTER: Record<string, Partial<TreeFilters>> = {
  total: { status: undefined, gap: undefined, missing: false },
  active: { status: VEHICLE_DATA_STATUS.ACTIVE, gap: undefined, missing: false },
  pending: { status: VEHICLE_DATA_STATUS.PENDING, gap: undefined, missing: false },
  incomplete: { status: VEHICLE_DATA_STATUS.ACTIVE, gap: VEHICLE_DATA_GAP_ANY, missing: false },
  hidden: { status: VEHICLE_DATA_STATUS.HIDDEN, gap: undefined, missing: false },
  missingSpecs: { status: undefined, gap: undefined, missing: true },
};

function activeSummaryKey(filters: TreeFilters): string | null {
  if (filters.missing) return filters.status || filters.gap ? null : 'missingSpecs';
  if (filters.status === VEHICLE_DATA_STATUS.ACTIVE && filters.gap === VEHICLE_DATA_GAP_ANY) {
    return 'incomplete';
  }
  if (filters.gap) return null;
  if (!filters.status) return 'total';
  return filters.status;
}

/**
 * Nội dung tab MẪU XE của một hãng (ADR 0096): MỘT danh sách — mỗi DÒNG xe một hàng (thông số cấp
 * dòng, số xe, cảnh báo thiếu), bấm để xổ ra các XE chuẩn của dòng (phiên bản · đời, giá bán, giá
 * thuê tham khảo — ADR 0090). Dòng có xe chờ duyệt, thiếu thông số, hay khớp bộ lọc xe tự mở sẵn.
 *
 * Bộ lọc nằm trên URL: tìm (dòng + phiên bản), trạng thái / thiếu dữ liệu / nguồn của XE, thông số
 * của DÒNG, cách xếp xe trong dòng. Dòng nào hiện là do số đếm theo dòng ở server
 * (`/platform/vehicle-data/model-counts`) — không suy từ trang xe đang tải.
 */
export function CatalogModelTree({
  vehicleType,
  brand,
  models,
  loading,
  error,
  onRetry,
}: {
  vehicleType: VehicleType;
  brand: CatalogBrandEntry;
  /** Dòng xe ĐÃ DUYỆT của đúng hãng đang chọn. */
  models: readonly CatalogModelAdmin[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations('AdminCatalog.models');
  const tData = useTranslations('AdminVehicleData');
  const tCommon = useTranslations('Common');
  const tStatus = useTranslations('AdminCatalog.status');
  const tActions = useTranslations('AdminCatalog.actions');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const remove = useDeleteCatalogModel();
  const { filters, setFilters } = useUrlFilters(parseTreeFilters);

  const vehicleFilters = useMemo<LineVehicleFilters>(
    () => ({
      q: filters.q,
      status: filters.status,
      gap: filters.gap,
      origin: filters.origin,
      sort: filters.sort ?? DEFAULT_SORT,
    }),
    [filters.q, filters.status, filters.gap, filters.origin, filters.sort],
  );
  const vehicleFiltered = Boolean(filters.q || filters.status || filters.gap || filters.origin);

  const countsQuery = useVehicleDataModelCounts({
    vehicleType,
    brandKey: brand.key,
    q: filters.q,
    status: filters.status,
    gap: filters.gap,
    origin: filters.origin,
  });
  const counts = countsQuery.data;

  // ── Hàng của cây ───────────────────────────────────────────────────────────
  const rows = useMemo<LineRow[]>(() => {
    const byModel = new Map((counts ?? []).map((c) => [c.modelId, c]));
    const approved: LineRow[] = models.map((m) => ({
      id: m.id,
      label: m.label,
      group: m.marketStatus as CatalogMarketStatus,
      model: m,
      counts: byModel.get(m.id) ?? null,
      missing: catalogModelMissingSpecs(m),
    }));
    const known = new Set(models.map((m) => m.id));
    // Dòng mới do chủ xe gõ (chờ duyệt) chỉ biết được qua xe chuẩn của nó.
    const pendingLines: LineRow[] = (counts ?? [])
      .filter((c) => c.modelPending && !known.has(c.modelId))
      .map((c) => ({
        id: c.modelId,
        label: c.modelLabel,
        group: PENDING_GROUP,
        model: null,
        counts: c,
        missing: [],
      }));
    return [...approved, ...pendingLines];
  }, [models, counts]);

  const needle = normalizeCatalogSearch(filters.q ?? '');
  const visibleRows = useMemo(
    () =>
      rows.filter((r) => {
        if (filters.missing && r.missing.length === 0) return false;
        if (!vehicleFiltered) return true;
        if ((r.counts?.matched ?? 0) > 0) return true;
        // Chỉ đang tìm theo tên: dòng khớp tên mà chưa có xe nào vẫn phải tìm thấy được.
        const onlySearch = !filters.status && !filters.gap && !filters.origin;
        return onlySearch && Boolean(needle) && normalizeCatalogSearch(r.label).includes(needle);
      }),
    [rows, filters.missing, filters.status, filters.gap, filters.origin, vehicleFiltered, needle],
  );

  const groups = useMemo(
    () =>
      [...CATALOG_MARKET_STATUS_VALUES, PENDING_GROUP]
        .map((group) => ({
          group: group as LineGroup,
          items: visibleRows.filter((r) => r.group === group),
        }))
        .filter((g) => g.items.length > 0),
    [visibleRows],
  );

  // ── Mở / đóng dòng ─────────────────────────────────────────────────────────
  const [expandOverride, setExpandOverride] = useState<Record<string, boolean>>({});
  const opensByDefault = useCallback(
    (r: LineRow) =>
      (vehicleFiltered && (r.counts?.matched ?? 0) > 0) ||
      (r.counts?.pending ?? 0) > 0 ||
      r.missing.length > 0,
    [vehicleFiltered],
  );
  const expandedKeys = visibleRows
    .filter((r) => expandOverride[r.id] ?? opensByDefault(r))
    .map((r) => r.id);
  const setExpanded = useCallback(
    (id: string, expanded: boolean) => setExpandOverride((prev) => ({ ...prev, [id]: expanded })),
    [],
  );

  // Thứ tự xe đang thấy (theo dòng đang mở) — "Xe trước / Xe sau" của panel đi theo nó.
  const [lineIds, setLineIds] = useState<Record<string, readonly string[]>>({});
  const reportIds = useCallback((modelId: string, ids: readonly string[]) => {
    setLineIds((prev) => {
      const old = prev[modelId] ?? [];
      if (old.length === ids.length && old.every((id, i) => id === ids[i])) return prev;
      return { ...prev, [modelId]: ids };
    });
  }, []);
  const vehicleOrder = groups.flatMap((g) =>
    g.items.filter((r) => expandedKeys.includes(r.id)).flatMap((r) => lineIds[r.id] ?? []),
  );
  const openId = filters.open ?? null;
  const pager = useOpenRecordPager(vehicleOrder, openId === NEW_RECORD ? null : openId);

  // ── Hành động ──────────────────────────────────────────────────────────────
  const [lineFormOpen, setLineFormOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<CatalogModelAdmin | null>(null);
  const [newVehicleModelId, setNewVehicleModelId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importId, setImportId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const openVehicle = (id: string) => {
    pager.remember();
    setFilters({ open: id }, { resetPage: false });
  };
  const addVehicle = (modelId: string) => {
    setNewVehicleModelId(modelId);
    setFilters({ open: NEW_RECORD }, { resetPage: false });
  };
  const editLine = (model: CatalogModelAdmin) => {
    setEditingLine(model);
    setLineFormOpen(true);
  };
  const createLine = () => {
    setEditingLine(null);
    setLineFormOpen(true);
  };

  // ── Dải số liệu = tổng số đếm theo dòng ────────────────────────────────────
  const totals = useMemo(() => {
    const sum = { total: 0, active: 0, pending: 0, incomplete: 0, hidden: 0 };
    for (const c of counts ?? []) {
      sum.total += c.total;
      sum.active += c.active;
      sum.pending += c.pending;
      sum.incomplete += c.incomplete;
      sum.hidden += c.hidden;
    }
    return sum;
  }, [counts]);
  const missingLines = rows.filter((r) => r.missing.length > 0).length;

  const summaryItems: SummaryStripItem[] = [
    {
      key: 'total',
      icon: DatabaseOutlined,
      tone: 'neutral',
      value: totals.total,
      label: tData('summary.total'),
    },
    {
      key: 'active',
      icon: CheckCircleOutlined,
      tone: 'success',
      value: totals.active,
      label: tData('summary.active'),
    },
    {
      key: 'pending',
      icon: ClockCircleOutlined,
      tone: 'warning',
      value: totals.pending,
      label: tData('summary.pending'),
    },
    {
      key: 'incomplete',
      icon: ExclamationCircleOutlined,
      tone: 'danger',
      value: totals.incomplete,
      label: tData('summary.incomplete'),
    },
    {
      key: 'missingSpecs',
      icon: WarningFilled,
      tone: 'warning',
      value: missingLines,
      label: t('tree.summaryMissingLines'),
    },
    {
      key: 'hidden',
      icon: EyeInvisibleOutlined,
      tone: 'neutral',
      value: totals.hidden,
      label: tData('summary.hidden'),
    },
  ];

  const filterFields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: tData('filters.search'),
      placeholder: t('tree.searchPlaceholder'),
    },
    {
      kind: 'select',
      key: 'status',
      label: tData('filters.status'),
      allowClear: true,
      options: VEHICLE_DATA_STATUS_VALUES.map((value) => ({
        value,
        label: tData(`status.${value}`),
      })),
    },
    {
      kind: 'select',
      key: 'gap',
      label: tData('filters.gap'),
      allowClear: true,
      options: [...VEHICLE_DATA_GAP_VALUES, VEHICLE_DATA_GAP_ANY].map((value) => ({
        value,
        label: tData(`gap.${value as VehicleDataGap | typeof VEHICLE_DATA_GAP_ANY}`),
      })),
    },
    {
      kind: 'select',
      key: 'missing',
      label: t('tree.filterLineSpecs'),
      allowClear: true,
      options: [{ value: LINE_SPECS_MISSING, label: t('tree.filterLineSpecsMissing') }],
    },
    {
      kind: 'select',
      key: 'origin',
      label: tData('filters.origin'),
      allowClear: true,
      options: VEHICLE_DATA_ORIGIN_VALUES.map((value) => ({
        value,
        label: tData(`origin.${value}`),
      })),
    },
    {
      kind: 'select',
      key: 'sort',
      label: t('tree.sortInLine'),
      defaultValue: DEFAULT_SORT,
      options: VEHICLE_DATA_SORT_VALUES.map((value) => ({
        value,
        label: tData(`filters.sortOptions.${value}`),
      })),
    },
  ];

  // ── Cột của hàng dòng xe ───────────────────────────────────────────────────
  const isMotorbike = vehicleType === VEHICLE_TYPE.MOTORBIKE;

  function yearsText(m: CatalogModelAdmin): string | null {
    if (m.yearFrom && m.yearTo) return t('yearsRange', { from: m.yearFrom, to: m.yearTo });
    if (m.yearFrom) return t('yearsSince', { from: m.yearFrom });
    if (m.yearTo) return t('yearsUntil', { to: m.yearTo });
    return null;
  }

  /** Thông số cấp dòng gộp một ô: thứ còn trống hiện "Chưa khai" thay vì biến mất. */
  function specText(m: CatalogModelAdmin): string {
    const seats = isMotorbike
      ? m.motorbikeCategory
        ? domainLabel('motorbikeCategory', m.motorbikeCategory)
        : null
      : m.seatCounts.length > 0
        ? m.seatCounts.map((count) => tCommon('units.seat', { count })).join(', ')
        : null;
    return [
      seats ?? t('notSet'),
      m.fuelTypes.map((f) => domainLabel('fuelType', f)).join(', ') || t('notSet'),
      m.transmissions.map((v) => domainLabel('transmissionType', v)).join(', ') || t('notSet'),
    ].join(LIST_SEPARATOR);
  }

  const lineCell = (r: LineRow) => {
    const years = r.model ? yearsText(r.model) : null;
    return (
      <div className={styles.nameCell}>
        <span className={styles.label}>
          {r.label}
          {r.model === null ? (
            <Tag className={styles.inlineTag} color={STATUS_COLOR.WARNING}>
              {t('tree.pendingLineTag')}
            </Tag>
          ) : null}
        </span>
        {years ? <span className={styles.sub}>{years}</span> : null}
        {r.missing.length > 0 ? (
          <span className={styles.missing}>
            <WarningFilled aria-hidden />{' '}
            {t('missing', { fields: r.missing.map((f) => t(`spec.${f}`)).join(', ') })}
          </span>
        ) : null}
        {r.model === null ? <span className={styles.sub}>{t('tree.pendingLineHint')}</span> : null}
      </div>
    );
  };

  const vehiclesCell = (r: LineRow) => {
    const c = r.counts;
    return (
      <div className={styles.nameCell}>
        <span>{t('tree.lineVehicles', { count: c?.total ?? 0 })}</span>
        {c && c.pending > 0 ? (
          <span className={styles.pendingNote}>
            <ClockCircleFilled aria-hidden /> {t('tree.linePending', { count: c.pending })}
          </span>
        ) : null}
        {c && c.incomplete > 0 ? (
          <span className={styles.missing}>
            {t('tree.lineIncomplete', { count: c.incomplete })}
          </span>
        ) : null}
      </div>
    );
  };

  const columns: DataTableColumn<LineRow>[] = [
    { title: t('columns.label'), key: 'label', width: 240, render: (_, r) => lineCell(r) },
    {
      title: t('tree.columns.spec'),
      key: 'spec',
      width: 280,
      render: (_, r) =>
        r.model ? (
          <span className={styles.spec}>{specText(r.model)}</span>
        ) : (
          <span className={styles.notSet}>-</span>
        ),
    },
    {
      title: t('tree.columns.vehicles'),
      key: 'vehicles',
      width: 130,
      render: (_, r) => vehiclesCell(r),
    },
    {
      title: t('columns.usage'),
      key: 'usage',
      align: 'right',
      width: 100,
      render: (_, r) => (r.model && r.model.usageCount > 0 ? r.model.usageCount : '-'),
    },
    {
      // Nguồn tra cứu phân biệt một dòng ĐÃ ĐỐI CHIẾU với một dòng gõ từ trí nhớ.
      title: t('columns.source'),
      key: 'source',
      width: 140,
      render: (_, r) =>
        r.model?.sourceUrl ? (
          <a
            href={r.model.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={styles.sub}
          >
            {r.model.verifiedAt
              ? t('verifiedAt', { date: fmt.date(r.model.verifiedAt) })
              : t('columns.source')}
          </a>
        ) : (
          <span className={styles.notSet}>{t('notVerified')}</span>
        ),
    },
    {
      title: t('columns.status'),
      key: 'active',
      width: 100,
      render: (_, r) =>
        r.model === null ? null : r.model.active ? (
          <Tag color={STATUS_COLOR.SUCCESS}>{tStatus('active')}</Tag>
        ) : (
          <Tag color={STATUS_COLOR.NEUTRAL}>{tStatus('inactive')}</Tag>
        ),
    },
    actionColumn<LineRow>(
      (r) => {
        const model = r.model;
        if (!model) return [];
        const hasVehicles = (r.counts?.total ?? 0) > 0;
        return [
          {
            key: 'add',
            label: t('tree.addVehicle'),
            icon: <PlusOutlined />,
            onClick: () => addVehicle(model.id),
          },
          {
            key: 'edit',
            label: t('tree.editLine'),
            icon: <EditOutlined />,
            onClick: () => editLine(model),
          },
          {
            key: 'delete',
            label: tActions('delete'),
            icon: <DeleteOutlined />,
            danger: true,
            // Có xe đăng gắn dòng, hoặc còn xe chuẩn bên trong ⇒ không xoá (backend cũng chặn).
            disabled: model.usageCount > 0 || hasVehicles,
            loading: remove.isPending && remove.variables === model.id,
            confirm: {
              title: t('confirmDelete'),
              okText: tActions('confirmOk'),
              cancelText: tActions('confirmCancel'),
            },
            onClick: () =>
              remove.mutate(model.id, {
                onSuccess: () => message.success(t('deleted')),
                onError: (err) => message.error(errorMessage(err)),
              }),
          },
        ];
      },
      { width: 150 },
    ),
  ];

  const renderLineCard = (r: LineRow) => (
    <div className={styles.lineCard}>
      {lineCell(r)}
      {r.model ? <span className={styles.sub}>{specText(r.model)}</span> : null}
      {vehiclesCell(r)}
    </div>
  );

  const groupTitle = (group: LineGroup) =>
    group === PENDING_GROUP ? t('tree.pendingGroup') : domainLabel('catalogMarketStatus', group);

  // ── Thân ───────────────────────────────────────────────────────────────────
  const addLineButton = (
    <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={createLine}>
      {t('add')}
    </Button>
  );

  let content;
  if (error && models.length === 0) {
    content = <EmptyState variant="error" title={t('loadError')} onRetry={onRetry} />;
  } else if (loading || (vehicleFiltered && countsQuery.isLoading)) {
    content = <LoadingState variant="table" />;
  } else if (rows.length === 0) {
    content = (
      <EmptyState
        variant="empty"
        title={t('empty')}
        description={t('emptyHint')}
        action={addLineButton}
      />
    );
  } else if (groups.length === 0) {
    content = (
      <EmptyState
        variant="no-results"
        title={t('noResults')}
        action={
          <Button onClick={() => setFilters(CLEAR_FILTERS)}>{tCommon('actions.clear')}</Button>
        }
      />
    );
  } else {
    content = groups.map(({ group, items }) => (
      <section key={group} className={styles.group}>
        <h3 className={styles.groupTitle}>
          {groupTitle(group)}
          <span className={styles.groupCount}>{t('groupCount', { count: items.length })}</span>
        </h3>
        <DataTable<LineRow>
          label={`${brand.label}${LIST_SEPARATOR}${groupTitle(group)}`}
          columns={columns}
          items={items}
          rowKey={(r) => r.id}
          minWidth={MIN_TABLE_WIDTH}
          loading={countsQuery.isFetching && !countsQuery.isLoading}
          empty={{ title: t('empty') }}
          onRowClick={(r) => setExpanded(r.id, !expandedKeys.includes(r.id))}
          renderCard={renderLineCard}
          expandable={{
            label: t('tree.expandLabel'),
            expandedKeys,
            onExpandedChange: setExpanded,
            render: (r) => (
              <CatalogLineVehicles
                vehicleType={vehicleType}
                brandKey={brand.key}
                modelId={r.id}
                lineLabel={r.label}
                filters={vehicleFilters}
                filtered={vehicleFiltered}
                selectedId={openId}
                onOpen={openVehicle}
                onAdd={r.model ? () => addVehicle(r.id) : undefined}
                onIds={reportIds}
              />
            ),
          }}
        />
      </section>
    ));
  }

  return (
    <div className={styles.tree}>
      <div className={styles.treeActions}>
        <Dropdown
          menu={{
            items: [
              {
                key: 'template',
                icon: <DownloadOutlined aria-hidden />,
                label: <a href={vehicleDataHref.template()}>{tData('page.template')}</a>,
              },
              {
                key: 'history',
                icon: <HistoryOutlined aria-hidden />,
                label: tData('page.history'),
                onClick: () => setHistoryOpen(true),
              },
            ],
          }}
        >
          <Button icon={<MoreOutlined aria-hidden />} aria-label={tData('page.more')} />
        </Dropdown>
        {/* Xuất theo bộ lọc xe ĐANG XEM, trong loại xe + hãng của cột trái. */}
        <Button
          icon={<DownloadOutlined aria-hidden />}
          href={vehicleDataHref.export({ ...vehicleFilters, vehicleType, brandKey: brand.key })}
        >
          {tData('page.export')}
        </Button>
        <Button
          icon={<UploadOutlined aria-hidden />}
          onClick={() => {
            setImportId(null);
            setImportOpen(true);
          }}
        >
          {tData('page.import')}
        </Button>
        {addLineButton}
      </div>

      <SummaryStrip
        items={summaryItems}
        loading={!counts}
        ariaLabel={tData('summary.ariaLabel')}
        active={activeSummaryKey(filters)}
        onSelect={(key) => setFilters(SUMMARY_FILTER[key] ?? {})}
      />

      <FilterBar
        fields={filterFields}
        values={{
          q: filters.q,
          status: filters.status,
          gap: filters.gap,
          missing: filters.missing ? LINE_SPECS_MISSING : undefined,
          origin: filters.origin,
          sort: filters.sort ?? DEFAULT_SORT,
        }}
        // FilterBar gửi đúng TRƯỜNG vừa đổi — ghi thẳng bản vá.
        onChange={(patch) => setFilters(toTreePatch(patch))}
        onClear={() => setFilters(CLEAR_FILTERS)}
      />

      {content}

      {/* `key` ép form dựng lại khi đổi dòng đang sửa — không thì giá trị của dòng trước còn nguyên. */}
      <CatalogModelFormModal
        key={`${vehicleType}:${brand.key}:${editingLine?.id ?? 'new'}`}
        open={lineFormOpen}
        vehicleType={vehicleType}
        brandKey={editingLine?.brandKey ?? brand.key}
        brandLabel={brand.label}
        model={editingLine}
        onClose={() => setLineFormOpen(false)}
      />

      <VehicleDataDrawer
        openId={openId}
        previousId={pager.previousId}
        nextId={pager.nextId}
        newScope={{ vehicleType, brandKey: brand.key, modelId: newVehicleModelId }}
        onNavigate={(id) => setFilters({ open: id }, { resetPage: false })}
        onClose={() => {
          setNewVehicleModelId(null);
          setFilters({ open: undefined }, { resetPage: false });
        }}
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

const CLEAR_FILTERS: Partial<TreeFilters> = {
  q: undefined,
  status: undefined,
  gap: undefined,
  origin: undefined,
  sort: undefined,
  missing: false,
};

/** Bản vá của FilterBar ⇒ bộ lọc cây: ô "Thông số dòng" là chuỗi trên dây, cờ trong bộ lọc. */
function toTreePatch(patch: Record<string, unknown>): Partial<TreeFilters> {
  if (!('missing' in patch)) return patch as Partial<TreeFilters>;
  const { missing, ...rest } = patch;
  return { ...(rest as Partial<TreeFilters>), missing: missing === LINE_SPECS_MISSING };
}
