'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import {
  CATALOG_MARKET_STATUS_VALUES,
  CATALOG_TYPE,
  STATUS_COLOR,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  catalogModelMissingSpecs,
  normalizeCatalogSearch,
  type CatalogMarketStatus,
  type VehicleType,
} from '@xeprime/types';
import { App, Button, Checkbox, Input, Segmented, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';

import { useAdminCatalog } from '../use-admin-catalog';
import {
  useAdminCatalogModels,
  useCatalogModelBrandSummary,
  useDeleteCatalogModel,
  type CatalogModelAdmin,
} from '../use-admin-catalog-models';
import { CatalogBrandList, type CatalogBrandEntry } from './CatalogBrandList';
import { CatalogModelFormModal } from './CatalogModelFormModal';
import styles from './CatalogModelsPanel.module.css';

const MIN_TABLE_WIDTH = 980;

interface ModelFilters {
  vt: VehicleType;
  brand: string;
  q: string;
  missing: boolean;
}

function parseFilters(params: URLSearchParams): ModelFilters {
  const vt = params.get('vt');
  return {
    vt: (VEHICLE_TYPE_VALUES as readonly string[]).includes(vt ?? '') ? (vt as VehicleType) : VEHICLE_TYPE.CAR,
    brand: params.get('brand') ?? '',
    q: params.get('q') ?? '',
    missing: params.get('missing') === 'true',
  };
}

/**
 * Quản trị MẪU XE — chiều danh mục duy nhất không sống ở bảng `catalog_items`.
 *
 * Bố cục hai cột: HÃNG bên trái (kèm số mẫu và số mẫu thiếu thông số), mẫu của hãng đang chọn
 * bên phải, chia hai nhóm "Đang phân phối" / "Mẫu xe đời trước" đúng như ô chọn ở form đăng xe.
 * Bảng phẳng cũ trộn mọi hãng và sắp theo tên, nên "2008 · Peugeot" đứng cạnh "3 Series · BMW" —
 * không ai đọc được hãng nào có mẫu nào.
 *
 * Loại xe, hãng, ô tìm và bộ lọc "thiếu thông số" nằm trên URL: người rà danh mục gửi được đúng
 * màn đang xem cho người khác, và F5 không mất chỗ.
 */
export function CatalogModelsPanel() {
  const t = useTranslations('AdminCatalog.models');
  const tCommon = useTranslations('Common');
  const tStatus = useTranslations('AdminCatalog.status');
  const tActions = useTranslations('AdminCatalog.actions');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { filters, setFilters } = useUrlFilters(parseFilters);
  const vehicleType = filters.vt;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogModelAdmin | null>(null);

  const brandsQuery = useAdminCatalog(CATALOG_TYPE.VEHICLE_BRAND);
  const summaryQuery = useCatalogModelBrandSummary(vehicleType);

  /*
   * Danh sách hãng của loại xe đang xem, ghép với bộ đếm. Lấy từ bản QUẢN TRỊ của danh mục (có cả
   * hãng đã tắt): mẫu của một hãng đang tắt vẫn cần quản lý được, chỉ hiện mờ.
   */
  const brands = useMemo<CatalogBrandEntry[]>(() => {
    const counts = new Map((summaryQuery.data ?? []).map((s) => [s.brandKey, s]));
    return (brandsQuery.data ?? [])
      .filter(
        (b) => b.vehicleTypes.length === 0 || (b.vehicleTypes as string[]).includes(vehicleType),
      )
      .map((b) => ({
        key: b.key,
        label: b.label,
        iconUrl: b.iconUrl,
        active: b.active,
        total: counts.get(b.key)?.total ?? 0,
        missingSpecs: counts.get(b.key)?.missingSpecs ?? 0,
      }));
  }, [brandsQuery.data, summaryQuery.data, vehicleType]);

  // Hãng trên URL không thuộc loại xe này (đổi loại xe, link cũ) ⇒ rơi về hãng đầu tiên có mẫu.
  const selectedBrand =
    brands.find((b) => b.key === filters.brand) ??
    brands.find((b) => b.total > 0) ??
    brands[0] ??
    null;

  const modelsQuery = useAdminCatalogModels(vehicleType, selectedBrand?.key);
  const remove = useDeleteCatalogModel();
  // Chỉ dùng dữ liệu khi nó thuộc đúng hãng đang chọn — `placeholderData` không dùng ở đây, nhưng
  // lọc thêm một lần thì một phản hồi về muộn của hãng trước không thể hiện dưới tên hãng sau.
  const models = useMemo(
    () => (modelsQuery.data ?? []).filter((m) => m.brandKey === selectedBrand?.key),
    [modelsQuery.data, selectedBrand?.key],
  );

  const visibleModels = useMemo(() => {
    const needle = normalizeCatalogSearch(filters.q);
    return models.filter(
      (m) =>
        (!needle || normalizeCatalogSearch(m.label).includes(needle)) &&
        (!filters.missing || catalogModelMissingSpecs(m).length > 0),
    );
  }, [models, filters.q, filters.missing]);

  const groups = useMemo(
    () =>
      CATALOG_MARKET_STATUS_VALUES.map((status) => ({
        status,
        items: visibleModels.filter((m) => m.marketStatus === status),
      })).filter((g) => g.items.length > 0),
    [visibleModels],
  );

  const activeCount = models.filter((m) => m.active).length;
  const missingCount = models.filter((m) => catalogModelMissingSpecs(m).length > 0).length;

  function openEdit(model: CatalogModelAdmin) {
    setEditing(model);
    setFormOpen(true);
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  const addButton = (
    <Button type="primary" icon={<PlusOutlined />} disabled={!selectedBrand} onClick={openCreate}>
      {t('add')}
    </Button>
  );

  /** Một thông số dạng mảng: các giá trị nối bằng chấm giữa, rỗng thì "Chưa khai" màu nhạt. */
  function specCell(values: readonly string[]) {
    return values.length > 0 ? (
      <span className={styles.spec}>{values.join(' · ')}</span>
    ) : (
      <span className={styles.notSet}>{t('notSet')}</span>
    );
  }

  function yearsText(m: CatalogModelAdmin): string | null {
    if (m.yearFrom && m.yearTo) return t('yearsRange', { from: m.yearFrom, to: m.yearTo });
    if (m.yearFrom) return t('yearsSince', { from: m.yearFrom });
    if (m.yearTo) return t('yearsUntil', { to: m.yearTo });
    return null;
  }

  const isMotorbike = vehicleType === VEHICLE_TYPE.MOTORBIKE;

  const columns: DataTableColumn<CatalogModelAdmin>[] = [
    {
      title: t('columns.label'),
      key: 'label',
      width: 220,
      render: (_, m) => {
        const missing = catalogModelMissingSpecs(m);
        const years = yearsText(m);
        return (
          <div className={styles.nameCell}>
            <span className={styles.label}>{m.label}</span>
            {years ? <span className={styles.sub}>{years}</span> : null}
            {missing.length > 0 ? (
              <span className={styles.missing}>
                {t('missing', { fields: missing.map((f) => t(`spec.${f}`)).join(', ') })}
              </span>
            ) : null}
          </div>
        );
      },
    },
    isMotorbike
      ? {
          title: t('columns.category'),
          key: 'category',
          width: 130,
          render: (_, m) =>
            specCell(
              m.motorbikeCategory ? [domainLabel('motorbikeCategory', m.motorbikeCategory)] : [],
            ),
        }
      : {
          title: t('columns.seats'),
          key: 'seats',
          width: 110,
          render: (_, m) =>
            specCell(m.seatCounts.map((count) => tCommon('units.seat', { count }))),
        },
    {
      title: t('columns.fuelTypes'),
      key: 'fuelTypes',
      width: 170,
      render: (_, m) => specCell(m.fuelTypes.map((f) => domainLabel('fuelType', f))),
    },
    {
      title: t('columns.transmissions'),
      key: 'transmissions',
      width: 190,
      render: (_, m) => specCell(m.transmissions.map((v) => domainLabel('transmissionType', v))),
    },
    {
      title: t('columns.usage'),
      key: 'usage',
      align: 'right',
      width: 100,
      render: (_, m) => (m.usageCount > 0 ? m.usageCount : '—'),
    },
    {
      /*
       * Nguồn tra cứu hiện thẳng trong bảng: nó là thứ phân biệt một mẫu ĐÃ ĐỐI CHIẾU với một
       * mẫu ai đó gõ từ trí nhớ, và người rà danh mục cần thấy ngay dòng nào còn thiếu.
       */
      title: t('columns.source'),
      key: 'source',
      width: 150,
      render: (_, m) =>
        m.sourceUrl ? (
          <a
            href={m.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={styles.sub}
            onClick={(e) => e.stopPropagation()}
          >
            {m.verifiedAt ? t('verifiedAt', { date: fmt.date(m.verifiedAt) }) : t('columns.source')}
          </a>
        ) : (
          <span className={styles.notSet}>{t('notVerified')}</span>
        ),
    },
    {
      title: t('columns.status'),
      key: 'active',
      width: 100,
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
              onError: (err) => message.error(errorMessage(err)),
            }),
        },
      ],
      { width: 130 },
    ),
  ];

  const brandsError =
    brandsQuery.isError || summaryQuery.isError
      ? {
          onRetry: () => {
            void brandsQuery.refetch();
            void summaryQuery.refetch();
          },
        }
      : null;

  let content;
  if (!selectedBrand) {
    content =
      brandsQuery.isLoading || summaryQuery.isLoading ? null : (
        <EmptyState variant="empty" title={t('selectBrand')} />
      );
  } else if (modelsQuery.isError && !modelsQuery.data) {
    content = (
      <EmptyState
        variant="error"
        title={t('loadError')}
        onRetry={() => void modelsQuery.refetch()}
      />
    );
  } else if (modelsQuery.isLoading) {
    content = <LoadingState variant="table" />;
  } else if (models.length === 0) {
    content = (
      <EmptyState variant="empty" title={t('empty')} description={t('emptyHint')} action={addButton} />
    );
  } else if (groups.length === 0) {
    content = <EmptyState variant="no-results" title={t('noResults')} />;
  } else {
    content = groups.map((group) => (
      <section key={group.status} className={styles.group}>
        <h3 className={styles.groupTitle}>
          {domainLabel('catalogMarketStatus', group.status as CatalogMarketStatus)}
          <span className={styles.groupCount}>{t('groupCount', { count: group.items.length })}</span>
        </h3>
        <DataTable<CatalogModelAdmin>
          label={`${selectedBrand.label} · ${domainLabel('catalogMarketStatus', group.status)}`}
          columns={columns}
          items={group.items}
          rowKey={(m) => m.id}
          onRowClick={openEdit}
          minWidth={MIN_TABLE_WIDTH}
          loading={modelsQuery.isFetching}
          empty={{ title: t('empty') }}
        />
      </section>
    ));
  }

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <Segmented<VehicleType>
          value={vehicleType}
          onChange={(next) =>
            // Hãng của loại xe cũ gần như chắc chắn không hợp lệ ở loại mới — bỏ chọn luôn.
            setFilters({ vt: next, brand: '', q: '' })
          }
          options={VEHICLE_TYPE_VALUES.map((value) => ({
            value,
            label: domainLabel('vehicleType', value),
          }))}
        />
      </div>

      <div className={styles.layout}>
        <CatalogBrandList
          brands={brands}
          selectedKey={selectedBrand?.key ?? null}
          onSelect={(brand) => setFilters({ brand, q: '' })}
          loading={brandsQuery.isLoading || summaryQuery.isLoading}
          error={brandsError}
        />

        <div className={styles.main}>
          {selectedBrand ? (
            <header className={styles.brandHeader}>
              <div className={styles.brandHeading}>
                <h2 className={styles.brandName}>{selectedBrand.label}</h2>
                <span className={styles.sub}>
                  {t('summary', { total: models.length, active: activeCount })}
                  {missingCount > 0 ? (
                    <>
                      {' · '}
                      <span className={styles.missing}>
                        {t('summaryMissing', { count: missingCount })}
                      </span>
                    </>
                  ) : null}
                </span>
              </div>
              {addButton}
            </header>
          ) : null}

          {selectedBrand && models.length > 0 ? (
            <div className={styles.filters}>
              <Input
                allowClear
                className={styles.search}
                prefix={<SearchOutlined aria-hidden />}
                placeholder={t('modelSearch')}
                aria-label={t('modelSearchAria')}
                value={filters.q}
                onChange={(e) => setFilters({ q: e.target.value })}
              />
              <Checkbox
                checked={filters.missing}
                onChange={(e) => setFilters({ missing: e.target.checked })}
              >
                {t('missingOnly')}
              </Checkbox>
            </div>
          ) : null}

          {content}
        </div>
      </div>

      {/* `key` ép form dựng lại khi đổi mẫu đang sửa — nếu không, giá trị mặc định của mẫu trước
          còn nằm nguyên trong ô nhập. */}
      {selectedBrand ? (
        <CatalogModelFormModal
          key={`${vehicleType}:${selectedBrand.key}:${editing?.id ?? 'new'}`}
          open={formOpen}
          vehicleType={vehicleType}
          brandKey={editing?.brandKey ?? selectedBrand.key}
          brandLabel={selectedBrand.label}
          model={editing}
          onClose={() => setFormOpen(false)}
        />
      ) : null}
    </div>
  );
}
