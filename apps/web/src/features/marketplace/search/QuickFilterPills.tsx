'use client';

import {
  AppstoreOutlined,
  CarOutlined,
  CheckOutlined,
  ControlOutlined,
  DollarOutlined,
  DownOutlined,
  FilterOutlined,
  StarOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Button, Checkbox, Popover } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  CATALOG_TYPE,
  MOTORBIKE_CATEGORY_VALUES,
  SEAT_BUCKET_LABEL,
  SEAT_BUCKET_VALUES,
  SERVICE_TYPE,
  TRANSMISSION_TYPE_EXT_LABEL,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { catalogItemAppliesTo } from '@/features/catalog/types';
import { useCatalog } from '@/features/catalog/use-catalog';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { isPriceBandSelected, priceBandsFor, quickTransmissionsFor } from '../constants';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import { usePriceBandLabel } from './use-price-band-label';
import styles from './QuickFilterPills.module.css';

interface QuickFilterPillsProps {
  onOpenFilterModal: () => void;
  appliedCount?: number;
  className?: string;
  popupContainer?: () => HTMLElement;
}

export function QuickFilterPills({
  onOpenFilterModal,
  appliedCount = 0,
  className,
  popupContainer,
}: QuickFilterPillsProps) {
  const t = useTranslations('Marketplace.results');
  const tFilters = useTranslations('Marketplace.filterPanel');
  const domainLabel = useDomainLabel();
  const { filters, setFilters } = useMarketplaceFilters();
  const { catalog } = useCatalog();

  const isMotorbike = filters.vehicleType === VEHICLE_TYPE.MOTORBIKE;
  const bodyTypeItems = catalog[CATALOG_TYPE.BODY_TYPE];
  const brandItems = catalog[CATALOG_TYPE.VEHICLE_BRAND];

  /*
   * Hãng theo loại xe đọc từ CHÍNH danh mục (`catalog_items.vehicle_types`, admin khai) — không
   * giữ một danh sách hãng tay song song. Hãng ĐANG CHỌN luôn còn trong danh sách dù không áp
   * dụng cho loại xe hiện tại, để khách bỏ chọn được thay vì mang một bộ lọc vô hình.
   */
  const displayedBrandItems = useMemo(() => {
    const selected = new Set(filters.brand ?? []);
    return brandItems.filter(
      (b) => selected.has(b.key) || catalogItemAppliesTo(b, filters.vehicleType),
    );
  }, [brandItems, filters.brand, filters.vehicleType]);
  const priceBands = priceBandsFor(filters.vehicleType);
  const transmissions = quickTransmissionsFor(filters.vehicleType);
  const priceBandLabel = usePriceBandLabel();
  const withCount = (label: string, count: number | undefined) =>
    count ? tFilters('labelWithCount', { label, count }) : label;

  // Local state for popovers to control open/close
  const [openKey, setOpenKey] = useState<string | null>(null);

  const toggleArrayFilter = (
    field: 'brand' | 'bodyType' | 'motorbikeCategory' | 'seats' | 'features' | 'transmission',
    val: string,
  ) => {
    const list = (filters[field] as string[]) ?? [];
    const next = list.includes(val) ? list.filter((x) => x !== val) : [...list, val];
    setFilters({ [field]: next.length > 0 ? next : undefined });
  };

  return (
    <div className={cx(styles.container, className)}>
      {/* 1. Nhu cầu (Service Type) */}
      <Popover
        trigger="click"
        open={openKey === 'demand'}
        onOpenChange={(v) => setOpenKey(v ? 'demand' : null)}
        getPopupContainer={popupContainer}
        placement="bottomLeft"
        content={
          <div className={styles.popoverBody}>
            <button
              type="button"
              className={cx(styles.menuItem, !filters.serviceType && styles.menuItemActive)}
              onClick={() => {
                setFilters({ serviceType: undefined, routeType: undefined });
                setOpenKey(null);
              }}
            >
              <span>{t('allServices')}</span>
              {!filters.serviceType ? <CheckOutlined className={styles.checkIcon} /> : null}
            </button>
            <button
              type="button"
              className={cx(
                styles.menuItem,
                filters.serviceType === SERVICE_TYPE.SELF_DRIVE && styles.menuItemActive,
              )}
              onClick={() => {
                setFilters({ serviceType: SERVICE_TYPE.SELF_DRIVE, routeType: undefined });
                setOpenKey(null);
              }}
            >
              <span>{domainLabel('serviceType', SERVICE_TYPE.SELF_DRIVE)}</span>
              {filters.serviceType === SERVICE_TYPE.SELF_DRIVE ? (
                <CheckOutlined className={styles.checkIcon} />
              ) : null}
            </button>
            <button
              type="button"
              className={cx(
                styles.menuItem,
                filters.serviceType === SERVICE_TYPE.WITH_DRIVER && styles.menuItemActive,
              )}
              onClick={() => {
                setFilters({ serviceType: SERVICE_TYPE.WITH_DRIVER });
                setOpenKey(null);
              }}
            >
              <span>{domainLabel('serviceType', SERVICE_TYPE.WITH_DRIVER)}</span>
              {filters.serviceType === SERVICE_TYPE.WITH_DRIVER ? (
                <CheckOutlined className={styles.checkIcon} />
              ) : null}
            </button>
            <button
              type="button"
              className={cx(
                styles.menuItem,
                filters.serviceType === SERVICE_TYPE.LONG_TERM && styles.menuItemActive,
              )}
              onClick={() => {
                setFilters({ serviceType: SERVICE_TYPE.LONG_TERM, routeType: undefined });
                setOpenKey(null);
              }}
            >
              <span>{domainLabel('serviceType', SERVICE_TYPE.LONG_TERM)}</span>
              {filters.serviceType === SERVICE_TYPE.LONG_TERM ? (
                <CheckOutlined className={styles.checkIcon} />
              ) : null}
            </button>
          </div>
        }
      >
        <button type="button" className={cx(styles.pill, filters.serviceType && styles.pillActive)}>
          <span className={styles.pillIcon}>
            <ControlOutlined />
          </span>
          <span>
            {filters.serviceType ? domainLabel('serviceType', filters.serviceType) : t('demand')}
          </span>
          <DownOutlined className={styles.pillArrow} />
        </button>
      </Popover>

      {/* 2. Hãng xe (Brand) */}
      <Popover
        trigger="click"
        open={openKey === 'brand'}
        onOpenChange={(v) => setOpenKey(v ? 'brand' : null)}
        getPopupContainer={popupContainer}
        placement="bottomLeft"
        content={
          <div className={styles.popoverBody}>
            {displayedBrandItems.slice(0, 8).map((b) => {
              const checked = (filters.brand ?? []).includes(b.key);
              return (
                <label key={b.key} className={styles.checkboxItem}>
                  <Checkbox checked={checked} onChange={() => toggleArrayFilter('brand', b.key)} />
                  <span>{b.label}</span>
                </label>
              );
            })}
            <div className={styles.applyRow}>
              <Button size="small" type="primary" onClick={() => setOpenKey(null)}>
                {tFilters('apply')}
              </Button>
            </div>
          </div>
        }
      >
        <button
          type="button"
          className={cx(styles.pill, (filters.brand?.length ?? 0) > 0 && styles.pillActive)}
        >
          <span className={styles.pillIcon}>
            <AppstoreOutlined />
          </span>
          <span>{withCount(tFilters('brand'), filters.brand?.length)}</span>
          <DownOutlined className={styles.pillArrow} />
        </button>
      </Popover>

      {/* 3. Kiểu dáng (BodyType for Car, MotorbikeCategory for Motorbike) */}
      <Popover
        trigger="click"
        open={openKey === 'bodyType'}
        onOpenChange={(v) => setOpenKey(v ? 'bodyType' : null)}
        getPopupContainer={popupContainer}
        placement="bottomLeft"
        content={
          <div className={styles.popoverBody}>
            {!isMotorbike
              ? bodyTypeItems.slice(0, 8).map((bt) => {
                  const checked = (filters.bodyType ?? []).includes(bt.key);
                  return (
                    <label key={bt.key} className={styles.checkboxItem}>
                      <Checkbox
                        checked={checked}
                        onChange={() => toggleArrayFilter('bodyType', bt.key)}
                      />
                      <span>{bt.label}</span>
                    </label>
                  );
                })
              : MOTORBIKE_CATEGORY_VALUES.map((mc) => {
                  const checked = (filters.motorbikeCategory ?? []).includes(mc);
                  return (
                    <label key={mc} className={styles.checkboxItem}>
                      <Checkbox
                        checked={checked}
                        onChange={() => toggleArrayFilter('motorbikeCategory', mc)}
                      />
                      <span>{domainLabel('motorbikeCategory', mc)}</span>
                    </label>
                  );
                })}
            <div className={styles.applyRow}>
              <Button size="small" type="primary" onClick={() => setOpenKey(null)}>
                {tFilters('apply')}
              </Button>
            </div>
          </div>
        }
      >
        <button
          type="button"
          className={cx(
            styles.pill,
            ((filters.bodyType?.length ?? 0) > 0 || (filters.motorbikeCategory?.length ?? 0) > 0) &&
              styles.pillActive,
          )}
        >
          <span className={styles.pillIcon}>
            <CarOutlined />
          </span>
          <span>
            {withCount(
              tFilters('bodyType'),
              isMotorbike ? filters.motorbikeCategory?.length : filters.bodyType?.length,
            )}
          </span>
          <DownOutlined className={styles.pillArrow} />
        </button>
      </Popover>

      {/* 4. Khoảng giá (Price) */}
      <Popover
        trigger="click"
        open={openKey === 'price'}
        onOpenChange={(v) => setOpenKey(v ? 'price' : null)}
        getPopupContainer={popupContainer}
        placement="bottomLeft"
        content={
          <div className={styles.popoverBody}>
            <button
              type="button"
              className={cx(
                styles.menuItem,
                filters.priceMin == null && filters.priceMax == null && styles.menuItemActive,
              )}
              onClick={() => {
                setFilters({ priceMin: undefined, priceMax: undefined });
                setOpenKey(null);
              }}
            >
              <span>{tFilters('any')}</span>
              {filters.priceMin == null && filters.priceMax == null ? (
                <CheckOutlined className={styles.checkIcon} />
              ) : null}
            </button>
            {priceBands.map((band) => {
              const active = isPriceBandSelected(band, filters.priceMin, filters.priceMax);
              return (
                <button
                  key={`${band.min ?? ''}-${band.max ?? ''}`}
                  type="button"
                  className={cx(styles.menuItem, active && styles.menuItemActive)}
                  onClick={() => {
                    setFilters({ priceMin: band.min, priceMax: band.max });
                    setOpenKey(null);
                  }}
                >
                  <span>{priceBandLabel(band)}</span>
                  {active ? <CheckOutlined className={styles.checkIcon} /> : null}
                </button>
              );
            })}
          </div>
        }
      >
        <button
          type="button"
          className={cx(
            styles.pill,
            (filters.priceMin != null || filters.priceMax != null) && styles.pillActive,
          )}
        >
          <span className={styles.pillIcon}>
            <DollarOutlined />
          </span>
          <span>{tFilters('priceRange')}</span>
          <DownOutlined className={styles.pillArrow} />
        </button>
      </Popover>

      {/* 5. Hộp số (Transmission) */}
      <Popover
        trigger="click"
        open={openKey === 'transmission'}
        onOpenChange={(v) => setOpenKey(v ? 'transmission' : null)}
        getPopupContainer={popupContainer}
        placement="bottomLeft"
        content={
          <div className={styles.popoverBody}>
            <button
              type="button"
              className={cx(
                styles.menuItem,
                !filters.transmission?.length && styles.menuItemActive,
              )}
              onClick={() => {
                setFilters({ transmission: undefined });
                setOpenKey(null);
              }}
            >
              <span>{tFilters('any')}</span>
              {!filters.transmission?.length ? (
                <CheckOutlined className={styles.checkIcon} />
              ) : null}
            </button>
            {transmissions.map((code) => {
              const active = filters.transmission?.includes(code) ?? false;
              return (
                <button
                  key={code}
                  type="button"
                  className={cx(styles.menuItem, active && styles.menuItemActive)}
                  onClick={() => {
                    setFilters({ transmission: [code] });
                    setOpenKey(null);
                  }}
                >
                  <span>
                    {domainLabel('transmissionType', code, TRANSMISSION_TYPE_EXT_LABEL[code])}
                  </span>
                  {active ? <CheckOutlined className={styles.checkIcon} /> : null}
                </button>
              );
            })}
          </div>
        }
      >
        <button
          type="button"
          className={cx(styles.pill, (filters.transmission?.length ?? 0) > 0 && styles.pillActive)}
        >
          <span className={styles.pillIcon}>
            <ControlOutlined />
          </span>
          <span>{tFilters('transmission')}</span>
          <DownOutlined className={styles.pillArrow} />
        </button>
      </Popover>

      {/* 6. Số chỗ ngồi (Seats) - ONLY FOR CAR */}
      {!isMotorbike ? (
        <Popover
          trigger="click"
          open={openKey === 'seats'}
          onOpenChange={(v) => setOpenKey(v ? 'seats' : null)}
          getPopupContainer={popupContainer}
          placement="bottomLeft"
          content={
            <div className={styles.popoverBody}>
              {SEAT_BUCKET_VALUES.map((sb) => {
                const checked = (filters.seats ?? []).includes(sb);
                return (
                  <label key={sb} className={styles.checkboxItem}>
                    <Checkbox checked={checked} onChange={() => toggleArrayFilter('seats', sb)} />
                    <span>{domainLabel('seatBucket', sb, SEAT_BUCKET_LABEL[sb])}</span>
                  </label>
                );
              })}
              <div className={styles.applyRow}>
                <Button size="small" type="primary" onClick={() => setOpenKey(null)}>
                  {tFilters('apply')}
                </Button>
              </div>
            </div>
          }
        >
          <button
            type="button"
            className={cx(styles.pill, (filters.seats?.length ?? 0) > 0 && styles.pillActive)}
          >
            <span className={styles.pillIcon}>
              <TeamOutlined />
            </span>
            <span>{tFilters('seats')}</span>
            <DownOutlined className={styles.pillArrow} />
          </button>
        </Popover>
      ) : null}

      {/* 7. Tiện ích (Amenities & Features) */}
      <Popover
        trigger="click"
        open={openKey === 'amenities'}
        onOpenChange={(v) => setOpenKey(v ? 'amenities' : null)}
        getPopupContainer={popupContainer}
        placement="bottomLeft"
        content={
          <div className={styles.popoverBody}>
            <label className={styles.checkboxItem}>
              <Checkbox
                checked={Boolean(filters.delivery)}
                onChange={(e) => setFilters({ delivery: e.target.checked || undefined })}
              />
              <span>{tFilters('amenityDesc.delivery')}</span>
            </label>
            <label className={styles.checkboxItem}>
              <Checkbox
                checked={Boolean(filters.noCollateral)}
                onChange={(e) => setFilters({ noCollateral: e.target.checked || undefined })}
              />
              <span>{tFilters('amenityDesc.noCollateral')}</span>
            </label>
            <label className={styles.checkboxItem}>
              <Checkbox
                checked={Boolean(filters.vatInvoice)}
                onChange={(e) => setFilters({ vatInvoice: e.target.checked || undefined })}
              />
              <span>{tFilters('vatInvoice')}</span>
            </label>
            <label className={styles.checkboxItem}>
              <Checkbox
                checked={Boolean(filters.discount)}
                onChange={(e) => setFilters({ discount: e.target.checked || undefined })}
              />
              <span>{tFilters('amenityDesc.discount')}</span>
            </label>
            <div className={styles.applyRow}>
              <Button size="small" type="primary" onClick={() => setOpenKey(null)}>
                {tFilters('apply')}
              </Button>
            </div>
          </div>
        }
      >
        <button
          type="button"
          className={cx(
            styles.pill,
            (filters.delivery || filters.noCollateral || filters.vatInvoice || filters.discount) &&
              styles.pillActive,
          )}
        >
          <span className={styles.pillIcon}>
            <StarOutlined />
          </span>
          <span>{tFilters('amenities')}</span>
          <DownOutlined className={styles.pillArrow} />
        </button>
      </Popover>

      {/* 9. Nút Bộ lọc (Action Button) */}
      <button type="button" className={styles.filterBtn} onClick={onOpenFilterModal}>
        <FilterOutlined />
        <span>{tFilters('title')}</span>
        {appliedCount > 0 ? <span className={styles.filterBadge}>{appliedCount}</span> : null}
      </button>
    </div>
  );
}
