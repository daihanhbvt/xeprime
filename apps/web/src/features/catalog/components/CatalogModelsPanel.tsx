'use client';

import { LIST_SEPARATOR } from '@xeprime/domain';
import { CATALOG_TYPE, VEHICLE_TYPE, VEHICLE_TYPE_VALUES, type VehicleType } from '@xeprime/types';
import { Segmented } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { EmptyState } from '@/components/feedback/EmptyState';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useDomainLabel } from '@/i18n/use-domain-label';

import { useAdminCatalog } from '../use-admin-catalog';
import { useAdminCatalogModels, useCatalogModelBrandSummary } from '../use-admin-catalog-models';
import { CatalogBrandList, type CatalogBrandEntry } from './CatalogBrandList';
import { CatalogModelTree } from './CatalogModelTree';
import styles from './CatalogModelsPanel.module.css';

interface PanelFilters {
  vt: VehicleType;
  brand: string;
}

function parseFilters(params: URLSearchParams): PanelFilters {
  const vt = params.get('vt');
  return {
    vt: (VEHICLE_TYPE_VALUES as readonly string[]).includes(vt ?? '')
      ? (vt as VehicleType)
      : VEHICLE_TYPE.CAR,
    brand: params.get('brand') ?? '',
  };
}

/**
 * Tham số của danh sách một hãng — đổi hãng / loại xe thì xoá, không mang bộ lọc hay panel đang mở
 * của hãng trước sang. `view` là tham số của bản hai chế độ xem cũ: xoá luôn khỏi link cũ.
 */
const SCOPED_PARAMS_RESET = {
  q: undefined,
  status: undefined,
  gap: undefined,
  origin: undefined,
  sort: undefined,
  open: undefined,
  missing: undefined,
  view: undefined,
} as unknown as Partial<PanelFilters>;

/**
 * Tab MẪU XE của Danh mục — nơi DUY NHẤT quản lý mẫu xe (ADR 0096, gộp màn "Dữ liệu xe" của ADR 0090).
 *
 * Bố cục hai cột: HÃNG bên trái (số dòng xe, số xe, số xe chờ duyệt, số dòng thiếu thông số), bên
 * phải MỘT danh sách của hãng đang chọn (`CatalogModelTree`): mỗi dòng xe một hàng, xổ ra các xe
 * chuẩn (phiên bản · đời, giá bán, giá thuê tham khảo, dữ liệu chờ duyệt từ chủ xe).
 *
 * Loại xe, hãng và bộ lọc đều nằm trên URL: gửi link là người nhận mở đúng màn đang xem, F5 không
 * mất chỗ.
 */
export function CatalogModelsPanel() {
  const t = useTranslations('AdminCatalog.models');
  const domainLabel = useDomainLabel();
  const { filters, setFilters } = useUrlFilters(parseFilters);
  const vehicleType = filters.vt;

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
      .map((b) => {
        const count = counts.get(b.key);
        return {
          key: b.key,
          label: b.label,
          iconUrl: b.iconUrl,
          active: b.active,
          total: count?.total ?? 0,
          missingSpecs: count?.missingSpecs ?? 0,
          vehicles: count?.vehicleDataTotal ?? 0,
          pending: count?.vehicleDataPending ?? 0,
        };
      });
  }, [brandsQuery.data, summaryQuery.data, vehicleType]);

  // Hãng trên URL không thuộc loại xe này (đổi loại xe, link cũ) ⇒ rơi về hãng đầu tiên có dữ liệu.
  const selectedBrand =
    brands.find((b) => b.key === filters.brand) ??
    brands.find((b) => b.total > 0 || b.vehicles > 0) ??
    brands[0] ??
    null;

  const modelsQuery = useAdminCatalogModels(vehicleType, selectedBrand?.key);
  // Chỉ dùng dữ liệu khi nó thuộc đúng hãng đang chọn: một phản hồi về muộn của hãng trước không
  // được hiện dưới tên hãng sau.
  const models = useMemo(
    () => (modelsQuery.data ?? []).filter((m) => m.brandKey === selectedBrand?.key),
    [modelsQuery.data, selectedBrand?.key],
  );

  const brandsError =
    brandsQuery.isError || summaryQuery.isError
      ? {
          onRetry: () => {
            void brandsQuery.refetch();
            void summaryQuery.refetch();
          },
        }
      : null;

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <Segmented<VehicleType>
          value={vehicleType}
          onChange={(next) =>
            // Hãng của loại xe cũ gần như chắc chắn không hợp lệ ở loại mới — bỏ chọn luôn.
            setFilters({ ...SCOPED_PARAMS_RESET, vt: next, brand: '' })
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
          onSelect={(brand) => setFilters({ ...SCOPED_PARAMS_RESET, brand })}
          loading={brandsQuery.isLoading || summaryQuery.isLoading}
          error={brandsError}
        />

        <div className={styles.main}>
          {selectedBrand ? (
            <>
              <header className={styles.brandHeader}>
                <div className={styles.brandHeading}>
                  <h2 className={styles.brandName}>{selectedBrand.label}</h2>
                  <span className={styles.sub}>
                    {t('tree.lineCount', { count: models.length })}
                    {LIST_SEPARATOR}
                    {t('brandVehicleCount', { count: selectedBrand.vehicles })}
                  </span>
                </div>
              </header>

              {/* `key`: đổi hãng là danh sách khác hẳn — dòng đang mở, trang trong dòng làm lại từ đầu. */}
              <CatalogModelTree
                key={`${vehicleType}:${selectedBrand.key}`}
                vehicleType={vehicleType}
                brand={selectedBrand}
                models={models}
                loading={modelsQuery.isLoading}
                error={modelsQuery.isError}
                onRetry={() => void modelsQuery.refetch()}
              />
            </>
          ) : brandsQuery.isLoading || summaryQuery.isLoading ? null : (
            <EmptyState variant="empty" title={t('selectBrand')} />
          )}
        </div>
      </div>
    </div>
  );
}
