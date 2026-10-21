'use client';

import {
  AppstoreOutlined,
  CarOutlined,
  CheckOutlined,
  ControlOutlined,
  DollarOutlined,
  DownOutlined,
  FilterOutlined,
  LikeOutlined,
  StarOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Button, Checkbox, InputNumber, Popover, Radio } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useState, type ReactNode } from 'react';
import {
  CATALOG_TYPE,
  MOTORBIKE_CATEGORY_VALUES,
  SEAT_BUCKET_LABEL,
  SEAT_BUCKET_VALUES,
  SERVICE_TYPE,
  SERVICE_TYPE_LABEL,
  TRANSMISSION_TYPE_EXT_VALUES,
  VEHICLE_TYPE,
  type SeatBucket,
  type ServiceType,
} from '@xeprime/types';
import { useCatalog, useCatalogLabels } from '@/features/catalog/use-catalog';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
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
  const { brandLabel } = useCatalogLabels();

  const isMotorbike = filters.vehicleType === VEHICLE_TYPE.MOTORBIKE;
  const bodyTypeItems = catalog[CATALOG_TYPE.BODY_TYPE] ?? [];
  const brandItems = catalog[CATALOG_TYPE.VEHICLE_BRAND] ?? [];

  const displayedBrandItems = useMemo(() => {
    if (isMotorbike) {
      const MOTORBIKE_BRAND_KEYS = new Set([
        'honda', 'yamaha', 'piaggio', 'vespa', 'vinfast', 'suzuki', 'sym',
        'ducati', 'kawasaki', 'bmw', 'ktm', 'triumph', 'harley-davidson',
        'gogoro', 'yadea', 'datbike', 'kymco',
      ]);
      const filtered = brandItems.filter((b) => MOTORBIKE_BRAND_KEYS.has(b.key.toLowerCase()));
      return filtered.length > 0 ? filtered : brandItems;
    }
    const NON_CAR_BRAND_KEYS = new Set(['yamaha', 'piaggio', 'vespa', 'sym', 'datbike', 'kymco', 'yadea']);
    const filtered = brandItems.filter((b) => !NON_CAR_BRAND_KEYS.has(b.key.toLowerCase()));
    return filtered.length > 0 ? filtered : brandItems;
  }, [brandItems, isMotorbike]);

  // Local state for popovers to control open/close
  const [openKey, setOpenKey] = useState<string | null>(null);

  const toggleArrayFilter = (field: 'brand' | 'bodyType' | 'motorbikeCategory' | 'seats' | 'features' | 'transmission', val: string) => {
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
        <button
          type="button"
          className={cx(styles.pill, filters.serviceType && styles.pillActive)}
        >
          <span className={styles.pillIcon}>
            <ControlOutlined />
          </span>
          <span>
            {filters.serviceType
              ? domainLabel('serviceType', filters.serviceType)
              : t('demand')}
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
                  <Checkbox
                    checked={checked}
                    onChange={() => toggleArrayFilter('brand', b.key)}
                  />
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
          <span>
            {(filters.brand?.length ?? 0) > 0
              ? `${filters.brand!.length} ${tFilters('brand')}`
              : tFilters('brand')}
          </span>
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
            ((filters.bodyType?.length ?? 0) > 0 ||
              (filters.motorbikeCategory?.length ?? 0) > 0) &&
              styles.pillActive,
          )}
        >
          <span className={styles.pillIcon}>
            <CarOutlined />
          </span>
          <span>
            {isMotorbike
              ? (filters.motorbikeCategory?.length ?? 0) > 0
                ? `${filters.motorbikeCategory!.length} ${tFilters('bodyType')}`
                : tFilters('bodyType')
              : (filters.bodyType?.length ?? 0) > 0
                ? `${filters.bodyType!.length} ${tFilters('bodyType')}`
                : tFilters('bodyType')}
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
            {isMotorbike ? (
              <>
                <button
                  type="button"
                  className={cx(
                    styles.menuItem,
                    filters.priceMin == null && filters.priceMax === 150_000 && styles.menuItemActive,
                  )}
                  onClick={() => {
                    setFilters({ priceMin: undefined, priceMax: 150_000 });
                    setOpenKey(null);
                  }}
                >
                  <span>Dưới 150k</span>
                  {filters.priceMin == null && filters.priceMax === 150_000 ? (
                    <CheckOutlined className={styles.checkIcon} />
                  ) : null}
                </button>
                <button
                  type="button"
                  className={cx(
                    styles.menuItem,
                    filters.priceMin === 150_000 && filters.priceMax === 250_000 && styles.menuItemActive,
                  )}
                  onClick={() => {
                    setFilters({ priceMin: 150_000, priceMax: 250_000 });
                    setOpenKey(null);
                  }}
                >
                  <span>150k – 250k</span>
                  {filters.priceMin === 150_000 && filters.priceMax === 250_000 ? (
                    <CheckOutlined className={styles.checkIcon} />
                  ) : null}
                </button>
                <button
                  type="button"
                  className={cx(
                    styles.menuItem,
                    filters.priceMin === 250_000 && filters.priceMax === 400_000 && styles.menuItemActive,
                  )}
                  onClick={() => {
                    setFilters({ priceMin: 250_000, priceMax: 400_000 });
                    setOpenKey(null);
                  }}
                >
                  <span>250k – 400k</span>
                  {filters.priceMin === 250_000 && filters.priceMax === 400_000 ? (
                    <CheckOutlined className={styles.checkIcon} />
                  ) : null}
                </button>
                <button
                  type="button"
                  className={cx(
                    styles.menuItem,
                    filters.priceMin === 400_000 && filters.priceMax == null && styles.menuItemActive,
                  )}
                  onClick={() => {
                    setFilters({ priceMin: 400_000, priceMax: undefined });
                    setOpenKey(null);
                  }}
                >
                  <span>Trên 400k</span>
                  {filters.priceMin === 400_000 && filters.priceMax == null ? (
                    <CheckOutlined className={styles.checkIcon} />
                  ) : null}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={cx(
                    styles.menuItem,
                    filters.priceMin == null && filters.priceMax === 800_000 && styles.menuItemActive,
                  )}
                  onClick={() => {
                    setFilters({ priceMin: undefined, priceMax: 800_000 });
                    setOpenKey(null);
                  }}
                >
                  <span>Dưới 800k</span>
                  {filters.priceMin == null && filters.priceMax === 800_000 ? (
                    <CheckOutlined className={styles.checkIcon} />
                  ) : null}
                </button>
                <button
                  type="button"
                  className={cx(
                    styles.menuItem,
                    filters.priceMin === 800_000 && filters.priceMax === 1_500_000 && styles.menuItemActive,
                  )}
                  onClick={() => {
                    setFilters({ priceMin: 800_000, priceMax: 1_500_000 });
                    setOpenKey(null);
                  }}
                >
                  <span>800k – 1.5 triệu</span>
                  {filters.priceMin === 800_000 && filters.priceMax === 1_500_000 ? (
                    <CheckOutlined className={styles.checkIcon} />
                  ) : null}
                </button>
                <button
                  type="button"
                  className={cx(
                    styles.menuItem,
                    filters.priceMin === 1_500_000 && filters.priceMax === 2_500_000 && styles.menuItemActive,
                  )}
                  onClick={() => {
                    setFilters({ priceMin: 1_500_000, priceMax: 2_500_000 });
                    setOpenKey(null);
                  }}
                >
                  <span>1.5 triệu – 2.5 triệu</span>
                  {filters.priceMin === 1_500_000 && filters.priceMax === 2_500_000 ? (
                    <CheckOutlined className={styles.checkIcon} />
                  ) : null}
                </button>
                <button
                  type="button"
                  className={cx(
                    styles.menuItem,
                    filters.priceMin === 2_500_000 && filters.priceMax == null && styles.menuItemActive,
                  )}
                  onClick={() => {
                    setFilters({ priceMin: 2_500_000, priceMax: undefined });
                    setOpenKey(null);
                  }}
                >
                  <span>Trên 2.5 triệu</span>
                  {filters.priceMin === 2_500_000 && filters.priceMax == null ? (
                    <CheckOutlined className={styles.checkIcon} />
                  ) : null}
                </button>
              </>
            )}
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
            {!isMotorbike ? (
              <>
                <button
                  type="button"
                  className={cx(
                    styles.menuItem,
                    !(filters.transmission?.length) && styles.menuItemActive,
                  )}
                  onClick={() => {
                    setFilters({ transmission: undefined });
                    setOpenKey(null);
                  }}
                >
                  <span>{tFilters('any')}</span>
                  {!(filters.transmission?.length) ? (
                    <CheckOutlined className={styles.checkIcon} />
                  ) : null}
                </button>
                <button
                  type="button"
                  className={cx(
                    styles.menuItem,
                    filters.transmission?.includes('automatic') && styles.menuItemActive,
                  )}
                  onClick={() => {
                    setFilters({ transmission: ['automatic'] });
                    setOpenKey(null);
                  }}
                >
                  <span>Số tự động</span>
                  {filters.transmission?.includes('automatic') ? (
                    <CheckOutlined className={styles.checkIcon} />
                  ) : null}
                </button>
                <button
                  type="button"
                  className={cx(
                    styles.menuItem,
                    filters.transmission?.includes('manual') && styles.menuItemActive,
                  )}
                  onClick={() => {
                    setFilters({ transmission: ['manual'] });
                    setOpenKey(null);
                  }}
                >
                  <span>Số sàn</span>
                  {filters.transmission?.includes('manual') ? (
                    <CheckOutlined className={styles.checkIcon} />
                  ) : null}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={cx(
                    styles.menuItem,
                    !(filters.transmission?.length) && styles.menuItemActive,
                  )}
                  onClick={() => {
                    setFilters({ transmission: undefined });
                    setOpenKey(null);
                  }}
                >
                  <span>{tFilters('any')}</span>
                  {!(filters.transmission?.length) ? (
                    <CheckOutlined className={styles.checkIcon} />
                  ) : null}
                </button>
                <button
                  type="button"
                  className={cx(
                    styles.menuItem,
                    filters.transmission?.includes('automatic_cvt') && styles.menuItemActive,
                  )}
                  onClick={() => {
                    setFilters({ transmission: ['automatic_cvt'] });
                    setOpenKey(null);
                  }}
                >
                  <span>Tự động (tay ga)</span>
                  {filters.transmission?.includes('automatic_cvt') ? (
                    <CheckOutlined className={styles.checkIcon} />
                  ) : null}
                </button>
                <button
                  type="button"
                  className={cx(
                    styles.menuItem,
                    filters.transmission?.includes('semi_automatic') && styles.menuItemActive,
                  )}
                  onClick={() => {
                    setFilters({ transmission: ['semi_automatic'] });
                    setOpenKey(null);
                  }}
                >
                  <span>Bán tự động</span>
                  {filters.transmission?.includes('semi_automatic') ? (
                    <CheckOutlined className={styles.checkIcon} />
                  ) : null}
                </button>
                <button
                  type="button"
                  className={cx(
                    styles.menuItem,
                    filters.transmission?.includes('manual_clutch') && styles.menuItemActive,
                  )}
                  onClick={() => {
                    setFilters({ transmission: ['manual_clutch'] });
                    setOpenKey(null);
                  }}
                >
                  <span>Côn tay</span>
                  {filters.transmission?.includes('manual_clutch') ? (
                    <CheckOutlined className={styles.checkIcon} />
                  ) : null}
                </button>
              </>
            )}
          </div>
        }
      >
        <button
          type="button"
          className={cx(
            styles.pill,
            (filters.transmission?.length ?? 0) > 0 && styles.pillActive,
          )}
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
                    <Checkbox
                      checked={checked}
                      onChange={() => toggleArrayFilter('seats', sb)}
                    />
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
            className={cx(
              styles.pill,
              (filters.seats?.length ?? 0) > 0 && styles.pillActive,
            )}
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
              <span>Xuất hoá đơn VAT</span>
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

      {/* 8. Đánh giá (Rating) */}
      <Popover
        trigger="click"
        open={openKey === 'rating'}
        onOpenChange={(v) => setOpenKey(v ? 'rating' : null)}
        getPopupContainer={popupContainer}
        placement="bottomLeft"
        content={
          <div className={styles.popoverBody}>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                setFilters({ sort: 'recommended' });
                setOpenKey(null);
              }}
            >
              <span>★ 4.5 trở lên (Được đánh giá cao)</span>
            </button>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                setFilters({ sort: 'recommended' });
                setOpenKey(null);
              }}
            >
              <span>★ 4.0 trở lên</span>
            </button>
          </div>
        }
      >
        <button type="button" className={styles.pill}>
          <span className={styles.pillIcon}>
            <LikeOutlined />
          </span>
          <span>{tFilters('rating')}</span>
          <DownOutlined className={styles.pillArrow} />
        </button>
      </Popover>

      {/* 9. Nút Bộ lọc (Action Button) */}
      <button
        type="button"
        className={styles.filterBtn}
        onClick={onOpenFilterModal}
      >
        <FilterOutlined />
        <span>{tFilters('title')}</span>
        {appliedCount > 0 ? (
          <span className={styles.filterBadge}>{appliedCount}</span>
        ) : null}
      </button>
    </div>
  );
}
