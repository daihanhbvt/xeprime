'use client';

import { Button, Select, Slider, Switch } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CATALOG_TYPE,
  DEFAULT_LISTING_SORT,
  LISTING_AMENITY_DESC,
  LISTING_AMENITY_LABEL,
  LISTING_AMENITY_VALUES,
  LISTING_SORT_LABEL,
  LISTING_SORT_VALUES,
  SEAT_BUCKET_LABEL,
  SEAT_BUCKET_VALUES,
  VEHICLE_TYPE,
  vehicleFuelTypesFor,
  type ListingAmenity,
} from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { CatalogCardPicker } from '@/features/catalog/components/CatalogCardPicker';
import { useCatalog, useCatalogLabels } from '@/features/catalog/use-catalog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { cx } from '@/lib/cx';
import { formatMoneyVnd } from '@/lib/money';
import { useListingFacets } from '../hooks/use-listing-facets';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import type { ListingSort, MarketplaceFilters } from '../types';
import { BrandMark } from './BrandMark';
import styles from './FilterPanel.module.css';

const PRICE_STEP = 50_000;
/** Trần fallback khi chưa có dữ liệu giá (facets đang tải / chưa có xe). */
const PRICE_FALLBACK_MAX = 3_000_000;

/** Phần filter mà panel sở hữu — draft cục bộ, chỉ ghi ra URL khi bấm "Áp dụng". */
interface FilterDraft {
  sort: ListingSort;
  priceMin?: number;
  priceMax?: number;
  bodyType: string[];
  brand: string[];
  seats: string[];
  fuelType: string[];
  features: string[];
  hourly: boolean;
  delivery: boolean;
  noCollateral: boolean;
  discount: boolean;
}

function draftFromFilters(filters: MarketplaceFilters): FilterDraft {
  return {
    sort: filters.sort ?? DEFAULT_LISTING_SORT,
    priceMin: filters.priceMin,
    priceMax: filters.priceMax,
    bodyType: filters.bodyType ?? [],
    brand: filters.brand ?? [],
    seats: filters.seats ?? [],
    fuelType: filters.fuelType ?? [],
    features: filters.features ?? [],
    hourly: filters.hourly ?? false,
    delivery: filters.delivery ?? false,
    noCollateral: filters.noCollateral ?? false,
    discount: filters.discount ?? false,
  };
}

const EMPTY_DRAFT = draftFromFilters({});

/** Draft → patch ghi ra URL. `applyFilterPatch` tự xoá param với mảng rỗng/false/undefined. */
function draftToPatch(draft: FilterDraft): Partial<MarketplaceFilters> {
  return {
    sort: draft.sort === DEFAULT_LISTING_SORT ? undefined : draft.sort,
    priceMin: draft.priceMin,
    priceMax: draft.priceMax,
    bodyType: draft.bodyType,
    brand: draft.brand,
    seats: draft.seats,
    fuelType: draft.fuelType,
    features: draft.features,
    hourly: draft.hourly,
    delivery: draft.delivery,
    noCollateral: draft.noCollateral,
    discount: draft.discount,
  };
}

function toggle(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

/**
 * Panel "Bộ lọc" marketplace — faceted filter đầy đủ: sắp xếp, khoảng giá (slider), kiểu dáng,
 * hãng xe (logo), số chỗ, nhiên liệu, tính năng, tiện ích; mỗi option kèm SỐ XE ĐẾM THẬT từ
 * `/public/listings/facets` (mỗi chiều đếm với mọi filter trừ chính nó — chọn SUV vẫn thấy
 * Sedan còn bao nhiêu xe). Lựa chọn giữ ở draft cục bộ, chỉ đẩy ra URL (ADR 0004) khi bấm
 * "Áp dụng (N xe)"; N là total của draft, cập nhật live (debounce 300ms).
 *
 * Mobile = bottom-sheet Drawer, desktop = Modal — cùng một nội dung.
 */
export function FilterPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { filters, setFilters } = useMarketplaceFilters();

  const [draft, setDraft] = useState<FilterDraft>(() => draftFromFilters(filters));

  // Mỗi lần MỞ panel thì nạp lại draft từ URL (bỏ dở lần trước không để lại rác). Đọc filter
  // qua ref để effect reseed chỉ phụ thuộc `open` — filters đổi identity mỗi render.
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);
  useEffect(() => {
    if (open) setDraft(draftFromFilters(filtersRef.current));
  }, [open]);

  // Facets chạy theo draft (debounce) + ngữ cảnh tìm kiếm ngoài panel (tab loại xe, dịch vụ,
  // từ khoá, địa điểm, ngày giờ) — các chiều panel sở hữu lấy từ draft, KHÔNG lấy từ URL.
  const debouncedDraft = useDebouncedValue(draft, 300);
  const facetFilters = useMemo<MarketplaceFilters>(
    () => ({
      vehicleType: filters.vehicleType,
      serviceType: filters.serviceType,
      q: filters.q,
      province: filters.province,
      pickupAt: filters.pickupAt,
      returnAt: filters.returnAt,
      minSeats: filters.minSeats,
      sort: undefined,
      priceMin: debouncedDraft.priceMin,
      priceMax: debouncedDraft.priceMax,
      bodyType: debouncedDraft.bodyType,
      brand: debouncedDraft.brand,
      seats: debouncedDraft.seats,
      fuelType: debouncedDraft.fuelType,
      features: debouncedDraft.features,
      hourly: debouncedDraft.hourly,
      delivery: debouncedDraft.delivery,
      noCollateral: debouncedDraft.noCollateral,
      discount: debouncedDraft.discount,
    }),
    [filters, debouncedDraft],
  );
  const facetsQuery = useListingFacets(facetFilters, { enabled: open });
  const facets = facetsQuery.data;

  // Danh mục do platform admin cấu hình — CÙNG nguồn với form tạo xe, nên bộ lọc không bao giờ
  // liệt kê một kiểu dáng mà chủ xe không chọn được (và ngược lại).
  const { catalog } = useCatalog();
  const bodyTypeItems = catalog[CATALOG_TYPE.BODY_TYPE];
  const fuelItems = useMemo(() => {
    const items = catalog[CATALOG_TYPE.FUEL_TYPE];
    if (!filters.vehicleType) return items;
    const allowed = vehicleFuelTypesFor(filters.vehicleType);
    return items.filter((item) => allowed.some((value) => value === item.key));
  }, [catalog, filters.vehicleType]);
  const featureItems = catalog[CATALOG_TYPE.VEHICLE_FEATURE];
  const { brandLabel } = useCatalogLabels();

  const countOf = useMemo(() => {
    const maps = {
      bodyType: new Map(facets?.bodyType.map((b) => [b.key, b.count]) ?? []),
      seats: new Map(facets?.seats.map((b) => [b.key, b.count]) ?? []),
      fuelType: new Map(facets?.fuelType.map((b) => [b.key, b.count]) ?? []),
      features: new Map(facets?.features.map((b) => [b.key, b.count]) ?? []),
    };
    return (dim: keyof typeof maps, key: string): number | null =>
      facets ? (maps[dim].get(key) ?? 0) : null;
  }, [facets]);

  // Hãng xe: danh sách từ facets (chỉ hãng đang có xe) + hãng đã chọn nhưng hết xe (count 0)
  // để người dùng còn bỏ chọn được.
  const brandOptions = useMemo(() => {
    const fromFacets = facets?.brand ?? [];
    const known = new Set(fromFacets.map((b) => b.key.toLowerCase()));
    const stale = draft.brand
      .filter((b) => !known.has(b.toLowerCase()))
      .map((b) => ({ key: b, count: 0 }));
    return [...fromFacets, ...stale];
  }, [facets, draft.brand]);

  // Biên slider: từ facets (đã bỏ qua chính filter giá → không tự co khi kéo), làm tròn theo step.
  const priceBounds = useMemo(() => {
    const rawMin = Number(facets?.price.min ?? Number.NaN);
    const rawMax = Number(facets?.price.max ?? Number.NaN);
    const min = Number.isFinite(rawMin) ? Math.floor(rawMin / PRICE_STEP) * PRICE_STEP : 0;
    const max =
      Number.isFinite(rawMax) && rawMax > min
        ? Math.ceil(rawMax / PRICE_STEP) * PRICE_STEP
        : Math.max(min + PRICE_STEP, PRICE_FALLBACK_MAX);
    return { min, max };
  }, [facets]);
  const sliderValue: [number, number] = [
    draft.priceMin ?? priceBounds.min,
    draft.priceMax ?? priceBounds.max,
  ];
  const priceCaption =
    draft.priceMin == null && draft.priceMax == null
      ? 'Bất kỳ'
      : `${formatMoneyVnd(String(sliderValue[0]))} – ${formatMoneyVnd(String(sliderValue[1]))}`;

  const showBodyType = filters.vehicleType !== VEHICLE_TYPE.MOTORBIKE;
  const amenityCount: Record<ListingAmenity, number | null> = {
    hourly: facets ? facets.amenities.hourly : null,
    delivery: facets ? facets.amenities.delivery : null,
    noCollateral: facets ? facets.amenities.noCollateral : null,
    discount: facets ? facets.amenities.discount : null,
  };

  function apply() {
    setFilters(draftToPatch(draft));
    onClose();
  }

  const body = (
    <div className={styles.body}>
      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Sắp xếp</h4>
        <Select
          className={styles.sortSelect}
          size="large"
          value={draft.sort}
          options={LISTING_SORT_VALUES.map((v) => ({ value: v, label: LISTING_SORT_LABEL[v] }))}
          onChange={(sort: ListingSort) => setDraft((d) => ({ ...d, sort }))}
        />
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Mức giá / ngày</h4>
        <div className={styles.sliderWrap}>
          <Slider
            range
            min={priceBounds.min}
            max={priceBounds.max}
            step={PRICE_STEP}
            value={sliderValue}
            tooltip={{ formatter: (v) => formatMoneyVnd(String(v ?? 0)) }}
            onChange={(value) => {
              const [lo, hi] = value as [number, number];
              setDraft((d) => ({
                ...d,
                priceMin: lo <= priceBounds.min ? undefined : lo,
                priceMax: hi >= priceBounds.max ? undefined : hi,
              }));
            }}
          />
          <p className={styles.sliderCaption}>{priceCaption}</p>
        </div>
      </section>

      {showBodyType && bodyTypeItems.length > 0 ? (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Loại xe</h4>
          {/* Thẻ có ảnh — cùng component với ô "Kiểu dáng xe" ở form tạo xe, nên khách nhìn
              thấy đúng cái hình mà chủ xe đã chọn. */}
          <CatalogCardPicker
            ariaLabel="Loại xe"
            mode="multi"
            items={bodyTypeItems}
            value={draft.bodyType}
            onChange={(next) => setDraft((d) => ({ ...d, bodyType: next }))}
            countOf={(key) => countOf('bodyType', key) ?? undefined}
            countSuffix="xe"
          />
        </section>
      ) : null}

      {brandOptions.length > 0 ? (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Hãng xe</h4>
          <div className={styles.chipGrid}>
            {brandOptions.map((b) => (
              <FacetChip
                key={b.key}
                label={brandLabel(b.key) ?? b.key}
                count={facets ? b.count : null}
                active={draft.brand.includes(b.key)}
                icon={<BrandMark brand={b.key} />}
                onToggle={() => setDraft((d) => ({ ...d, brand: toggle(d.brand, b.key) }))}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Số chỗ</h4>
        <div className={styles.chipGrid}>
          {SEAT_BUCKET_VALUES.map((key) => (
            <FacetChip
              key={key}
              label={SEAT_BUCKET_LABEL[key]}
              count={countOf('seats', key)}
              active={draft.seats.includes(key)}
              onToggle={() => setDraft((d) => ({ ...d, seats: toggle(d.seats, key) }))}
            />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Nguồn năng lượng</h4>
        <div className={styles.chipGrid}>
          {fuelItems.map((item) => (
            <FacetChip
              key={item.key}
              label={item.label}
              count={countOf('fuelType', item.key)}
              active={draft.fuelType.includes(item.key)}
              onToggle={() => setDraft((d) => ({ ...d, fuelType: toggle(d.fuelType, item.key) }))}
            />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Tính năng</h4>
        <div className={styles.chipGrid}>
          {featureItems.map((item) => (
            <FacetChip
              key={item.key}
              label={item.label}
              count={countOf('features', item.key)}
              active={draft.features.includes(item.key)}
              onToggle={() => setDraft((d) => ({ ...d, features: toggle(d.features, item.key) }))}
            />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Tiện ích</h4>
        <div className={styles.amenityList}>
          {LISTING_AMENITY_VALUES.map((key) => (
            <label key={key} className={styles.amenityRow}>
              <span className={styles.amenityInfo}>
                <span className={styles.amenityLabel}>
                  {LISTING_AMENITY_LABEL[key]}
                  {amenityCount[key] != null ? (
                    <span className={styles.amenityCount}> ({amenityCount[key]})</span>
                  ) : null}
                </span>
                <span className={styles.amenityDesc}>{LISTING_AMENITY_DESC[key]}</span>
              </span>
              <Switch
                checked={draft[key]}
                onChange={(checked) => setDraft((d) => ({ ...d, [key]: checked }))}
              />
            </label>
          ))}
        </div>
      </section>
    </div>
  );

  const footer = (
    <div className={styles.footer}>
      <Button size="large" onClick={() => setDraft(EMPTY_DRAFT)}>
        Xoá bộ lọc
      </Button>
      <Button
        type="primary"
        size="large"
        className={styles.applyBtn}
        loading={facetsQuery.isFetching}
        onClick={apply}
      >
        Áp dụng{facets ? ` (${facets.total} xe)` : ''}
      </Button>
    </div>
  );

  return (
    /**
     * Bộ lọc là hộp thoại tác vụ có nút "Áp dụng" ở footer — mobile dùng bottom sheet theo
     * quy tắc 4 của Figma `130:1563` (hành động ngắn, quyết định nhanh), không phải toàn màn.
     *
     * Bản trước truyền `size="88dvh"` cho `Drawer`: `size` chỉ nhận `'default' | 'large'`
     * nên chiều cao đó chưa bao giờ có tác dụng (backlog D14.1). Trần chiều cao giờ do
     * `ResponsiveDialog` lo bằng token.
     */
    <ResponsiveDialog
      title="Bộ lọc"
      open={open}
      onClose={onClose}
      size="md"
      mobileMode="sheet"
      footer={footer}
      bodyClassName={styles.modalBody}
    >
      {body}
    </ResponsiveDialog>
  );
}

/**
 * Một option facet: nhãn + số xe khớp. `count === null` = facets đang tải lần đầu (ẩn số);
 * count 0 vẫn bấm được (mờ đi) — người dùng có thể chọn trước rồi nới các filter khác.
 */
function FacetChip({
  label,
  count,
  active,
  icon,
  onToggle,
}: {
  label: string;
  count: number | null;
  active: boolean;
  icon?: React.ReactNode;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      className={cx(
        styles.chip,
        active && styles.chipActive,
        count === 0 && !active && styles.chipDim,
      )}
      onClick={onToggle}
    >
      {icon}
      <span className={styles.chipLabel}>{label}</span>
      {count != null ? <span className={styles.chipCount}>{count}</span> : null}
    </button>
  );
}
