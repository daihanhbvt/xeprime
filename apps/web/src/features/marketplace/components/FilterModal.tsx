'use client';

import {
  CalendarOutlined,
  CloseOutlined,
  EnvironmentOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Checkbox, Radio, Slider, Switch } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CATALOG_TYPE,
  FUEL_TYPE_LABEL,
  LISTING_MIN_RATING_VALUES,
  MOTORBIKE_CATEGORY_VALUES,
  SEAT_BUCKET_LABEL,
  SEAT_BUCKET_VALUES,
  SERVICE_TYPE,
  TRANSMISSION_TYPE_EXT_LABEL,
  VEHICLE_TYPE,
  vehicleFuelTypesFor,
  type ServiceType,
  type TransmissionTypeExt,
  type VehicleType,
} from '@xeprime/types';
import { MoneyInput } from '@/components/form/MoneyInput';
import { RentalDateTimeRangeField } from '@/components/form/RentalDateTimeRangeField';
import { catalogItemAppliesTo } from '@/features/catalog/types';
import { useCatalog } from '@/features/catalog/use-catalog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import {
  isPriceBandSelected,
  priceBandsFor,
  priceSliderFor,
  quickTransmissionsFor,
} from '../constants';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import { LocationPicker } from '../search/LocationPicker';
import { resolveServiceType } from '../search/search-draft';
import { useSearchExperience } from '../search/search-context';
import { serviceItems, vehicleItems } from '../search/search-items';
import { usePriceBandLabel } from '../search/use-price-band-label';
import type { MarketplaceFilters } from '../types';
import { BrandMark } from './BrandMark';
import styles from './FilterModal.module.css';

interface FilterModalProps {
  open: boolean;
  onClose: () => void;
}

interface ModalDraft {
  vehicleType: VehicleType;
  serviceType: ServiceType;
  brand: string[];
  bodyType: string[];
  motorbikeCategory: string[];
  seats: string[];
  fuelType: string[];
  features: string[];
  transmission: string[];
  priceMin?: number;
  priceMax?: number;
  delivery?: boolean;
  noCollateral?: boolean;
  vatInvoice?: boolean;
  discount?: boolean;
  instantBook?: boolean;
  minRating?: number;
}

type ListField =
  | 'brand'
  | 'bodyType'
  | 'motorbikeCategory'
  | 'seats'
  | 'fuelType'
  | 'features'
  | 'transmission';

type FlagField = 'delivery' | 'noCollateral' | 'vatInvoice' | 'discount' | 'instantBook';

/** Số mục hiện trước "Xem thêm" — Figma vẽ 3 hàng × 2 cột. */
const COLLAPSED_COUNT = 6;

function initDraft(filters: MarketplaceFilters): ModalDraft {
  return {
    vehicleType: (filters.vehicleType as VehicleType | undefined) ?? VEHICLE_TYPE.CAR,
    serviceType: (filters.serviceType as ServiceType | undefined) ?? SERVICE_TYPE.SELF_DRIVE,
    brand: filters.brand ?? [],
    bodyType: filters.bodyType ?? [],
    motorbikeCategory: filters.motorbikeCategory ?? [],
    seats: filters.seats ?? [],
    fuelType: filters.fuelType ?? [],
    features: filters.features ?? [],
    transmission: filters.transmission ?? [],
    priceMin: filters.priceMin,
    priceMax: filters.priceMax,
    delivery: filters.delivery,
    noCollateral: filters.noCollateral,
    vatInvoice: filters.vatInvoice,
    discount: filters.discount,
    instantBook: filters.instantBook,
    minRating: filters.minRating,
  };
}

/**
 * Hộp "Bộ lọc" của trang kết quả — Figma `19719:47126` (ô tô) · `19719:49416` (xe máy).
 *
 * Bố cục theo thiết kế: phần đầu (dịch vụ, loại xe, địa điểm, thời gian) đứng yên, hai cột tiêu
 * chí cuộn bên dưới, dải "Đang chọn" và hai nút cố định ở đáy. Lựa chọn là NHÁP cục bộ — chỉ
 * "Áp dụng" mới ghi vào URL (ADR 0004); riêng địa điểm/thời gian ghi thẳng vào ngữ cảnh tìm
 * kiếm như ở thẻ tìm kiếm.
 *
 * Thiết kế vẽ thêm vài nhóm mà chợ chưa có dữ liệu để lọc (loại chủ sở hữu, ưu đãi dài hạn, mức
 * cọc tối đa, giới hạn km) — chúng KHÔNG được dựng thành ô bấm mà không lọc gì. Mọi bộ lọc đã có
 * từ trước vẫn giữ nguyên nghĩa, chỉ đổi chỗ đứng.
 */
export function FilterModal({ open, onClose }: FilterModalProps) {
  const t = useTranslations('Marketplace.filterPanel');
  const tService = useTranslations('HomeSearch.service');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const priceBandLabel = usePriceBandLabel();
  const { filters, setFilters } = useMarketplaceFilters();
  const { draft: searchDraft, setRentalRange, setRentalMode } = useSearchExperience();
  const { catalog } = useCatalog();

  const [draft, setDraft] = useState<ModalDraft>(() => initDraft(filters));
  const [showAllBrands, setShowAllBrands] = useState(false);
  const [showAllBodyTypes, setShowAllBodyTypes] = useState(false);
  const [showAllFeatures, setShowAllFeatures] = useState(false);

  /*
   * Nạp lại nháp đúng lúc panel MỞ — điều chỉnh state ngay trong render, không phải effect.
   *
   * Không theo dõi `filters`: ô địa điểm/thời gian trong chính panel này ghi thẳng vào URL, nên
   * reset theo `filters` sẽ xoá sạch các hãng/hộp số khách vừa tick mà chưa bấm "Áp dụng".
   */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(initDraft(filters));
      setShowAllBrands(false);
      setShowAllBodyTypes(false);
      setShowAllFeatures(false);
    }
  }

  // Esc đóng hộp như mọi hộp thoại khác của chợ.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const isMotorbike = draft.vehicleType === VEHICLE_TYPE.MOTORBIKE;
  /*
   * Hãng và tiện ích theo loại xe đọc từ `catalog_items.vehicle_types`. Mục ĐANG CHỌN luôn còn
   * hiện để khách bỏ chọn được, kể cả khi vừa đổi sang loại xe mà nó không áp dụng.
   */
  const brandItems = catalog[CATALOG_TYPE.VEHICLE_BRAND].filter(
    (b) => draft.brand.includes(b.key) || catalogItemAppliesTo(b, draft.vehicleType),
  );
  const bodyTypeItems = catalog[CATALOG_TYPE.BODY_TYPE];
  const featureItems = catalog[CATALOG_TYPE.VEHICLE_FEATURE].filter(
    (f) => draft.features.includes(f.key) || catalogItemAppliesTo(f, draft.vehicleType),
  );
  /* Hai chiều đọc CÙNG một bảng (`vehicleServiceTypesFor`) với thẻ tìm kiếm: xe máy không có "có tài xế". */
  const services = useMemo(
    () => serviceItems(draft.vehicleType, true, tService),
    [draft.vehicleType, tService],
  );
  const vehicles = useMemo(
    () => vehicleItems(domainLabel, draft.serviceType),
    [domainLabel, draft.serviceType],
  );
  const priceBands = priceBandsFor(draft.vehicleType);
  const priceSlider = priceSliderFor(draft.vehicleType);
  const transmissions = quickTransmissionsFor(draft.vehicleType);
  const fuelTypes = vehicleFuelTypesFor(draft.vehicleType);
  const transmissionLabel = (code: string) =>
    domainLabel(
      'transmissionType',
      code,
      TRANSMISSION_TYPE_EXT_LABEL[code as TransmissionTypeExt] ?? code,
    );
  const ratingLabel = (rating: number) => t('modal.ratingFrom', { rating });

  if (!open) return null;

  const displayedBrands = showAllBrands ? brandItems : brandItems.slice(0, COLLAPSED_COUNT);
  const displayedBodyTypes = showAllBodyTypes
    ? bodyTypeItems
    : bodyTypeItems.slice(0, COLLAPSED_COUNT);
  const displayedFeatures = showAllFeatures
    ? featureItems
    : featureItems.slice(0, COLLAPSED_COUNT);

  const toggleItem = (field: ListField, value: string) => {
    setDraft((prev) => {
      const list = prev[field];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...prev, [field]: next };
    });
  };
  const setFlag = (field: FlagField, checked: boolean) =>
    setDraft((prev) => ({ ...prev, [field]: checked || undefined }));
  const setPrice = (priceMin: number | undefined, priceMax: number | undefined) =>
    setDraft((prev) => ({ ...prev, priceMin, priceMax }));

  const handleApply = () => {
    // Nhiên liệu / hộp số không thuộc loại xe vừa chọn (diesel khi đã sang xe máy) bị bỏ, không
    // trở thành một bộ lọc vô hình làm rỗng kết quả.
    const fuelType = draft.fuelType.filter((code) =>
      (fuelTypes as readonly string[]).includes(code),
    );
    const transmission = draft.transmission.filter((code) =>
      (transmissions as readonly string[]).includes(code),
    );
    setFilters({
      vehicleType: draft.vehicleType,
      serviceType: draft.serviceType,
      brand: draft.brand.length > 0 ? draft.brand : undefined,
      bodyType: !isMotorbike && draft.bodyType.length > 0 ? draft.bodyType : undefined,
      motorbikeCategory:
        isMotorbike && draft.motorbikeCategory.length > 0 ? draft.motorbikeCategory : undefined,
      seats: !isMotorbike && draft.seats.length > 0 ? draft.seats : undefined,
      fuelType: fuelType.length > 0 ? fuelType : undefined,
      features: draft.features.length > 0 ? draft.features : undefined,
      transmission: transmission.length > 0 ? transmission : undefined,
      priceMin: draft.priceMin,
      priceMax: draft.priceMax,
      delivery: draft.delivery,
      noCollateral: draft.noCollateral,
      vatInvoice: draft.vatInvoice,
      discount: draft.discount,
      instantBook: draft.instantBook,
      minRating: draft.minRating,
    });
    onClose();
  };

  const handleClear = () => {
    setDraft({
      vehicleType: draft.vehicleType,
      serviceType: draft.serviceType,
      brand: [],
      bodyType: [],
      motorbikeCategory: [],
      seats: [],
      fuelType: [],
      features: [],
      transmission: [],
    });
  };

  /*
   * Dải "Đang chọn" — MỌI tiêu chí đang bật trong nháp, mỗi chip bấm để bỏ đúng tiêu chí đó. Chỉ
   * liệt kê chiều thuộc loại xe đang chọn (kiểu dáng ô tô ẩn khi đang ở xe máy và ngược lại) —
   * đúng những gì "Áp dụng" sẽ gửi đi.
   */
  const brandByKey = new Map(catalog[CATALOG_TYPE.VEHICLE_BRAND].map((b) => [b.key, b.label]));
  const bodyTypeByKey = new Map(bodyTypeItems.map((b) => [b.key, b.label]));
  const featureByKey = new Map(
    catalog[CATALOG_TYPE.VEHICLE_FEATURE].map((f) => [f.key, f.label]),
  );
  const chips: { key: string; label: string; onRemove: () => void }[] = [
    ...draft.brand.map((key) => ({
      key: `brand:${key}`,
      label: brandByKey.get(key) ?? key,
      onRemove: () => toggleItem('brand', key),
    })),
    ...(isMotorbike
      ? draft.motorbikeCategory.map((key) => ({
          key: `motorbikeCategory:${key}`,
          label: domainLabel('motorbikeCategory', key),
          onRemove: () => toggleItem('motorbikeCategory', key),
        }))
      : [
          ...draft.bodyType.map((key) => ({
            key: `bodyType:${key}`,
            label: bodyTypeByKey.get(key) ?? key,
            onRemove: () => toggleItem('bodyType', key),
          })),
          ...draft.seats.map((key) => ({
            key: `seats:${key}`,
            label: domainLabel(
              'seatBucket',
              key,
              SEAT_BUCKET_LABEL[key as keyof typeof SEAT_BUCKET_LABEL],
            ),
            onRemove: () => toggleItem('seats', key),
          })),
        ]),
    ...(draft.priceMin != null || draft.priceMax != null
      ? [
          {
            key: 'price',
            label: priceBandLabel({ min: draft.priceMin, max: draft.priceMax }),
            onRemove: () => setPrice(undefined, undefined),
          },
        ]
      : []),
    ...draft.transmission
      .filter((code) => (transmissions as readonly string[]).includes(code))
      .map((code) => ({
        key: `transmission:${code}`,
        label: transmissionLabel(code),
        onRemove: () => toggleItem('transmission', code),
      })),
    ...draft.fuelType
      .filter((code): code is (typeof fuelTypes)[number] =>
        (fuelTypes as readonly string[]).includes(code),
      )
      .map((code) => ({
        key: `fuelType:${code}`,
        label: domainLabel('fuelType', code, FUEL_TYPE_LABEL[code]),
        onRemove: () => toggleItem('fuelType', code),
      })),
    ...draft.features.map((key) => ({
      key: `features:${key}`,
      label: featureByKey.get(key) ?? key,
      onRemove: () => toggleItem('features', key),
    })),
    ...(['delivery', 'discount', 'instantBook', 'noCollateral', 'vatInvoice'] as const)
      .filter((field) => draft[field])
      .map((field) => ({
        key: field,
        label: t(`modal.chips.${field}`),
        onRemove: () => setFlag(field, false),
      })),
    ...(draft.minRating != null
      ? [
          {
            key: 'minRating',
            label: ratingLabel(draft.minRating),
            onRemove: () => setDraft((prev) => ({ ...prev, minRating: undefined })),
          },
        ]
      : []),
  ];

  const sliderValue: [number, number] = [
    Math.min(draft.priceMin ?? 0, priceSlider.max),
    Math.min(draft.priceMax ?? priceSlider.max, priceSlider.max),
  ];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Đầu hộp */}
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <h2 id="filter-modal-title" className={styles.title}>
              {t('title')}
            </h2>
            <p className={styles.subtitle}>{t('subtitle')}</p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={tCommon('actions.close')}
          >
            <CloseOutlined />
          </button>
        </div>

        <div className={styles.body}>
          {/* Phần đầu đứng yên: dịch vụ · loại xe · địa điểm · thời gian */}
          <div className={styles.context}>
            <div className={styles.segmented} role="radiogroup" aria-label={t('modal.service')}>
              {services.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.serviceType === item.value}
                  className={cx(
                    styles.segment,
                    styles.segmentFill,
                    draft.serviceType === item.value && styles.segmentActive,
                  )}
                  onClick={() => setDraft((p) => ({ ...p, serviceType: item.value }))}
                >
                  {item.icon ? (
                    <span className={styles.segmentIcon} aria-hidden>
                      {item.icon}
                    </span>
                  ) : null}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            <div className={styles.group}>
              <h3 className={styles.groupTitle}>{t('vehicleType')}</h3>
              <div
                className={cx(styles.segmented, styles.segmentedInline)}
                role="radiogroup"
                aria-label={t('vehicleType')}
              >
                {vehicles.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    role="radio"
                    aria-checked={draft.vehicleType === item.value}
                    className={cx(
                      styles.segment,
                      draft.vehicleType === item.value && styles.segmentActive,
                    )}
                    onClick={() =>
                      setDraft((p) => ({
                        ...p,
                        vehicleType: item.value,
                        // Xe máy không có "có tài xế" — rơi về tự lái, cùng luật với thẻ tìm kiếm.
                        serviceType: resolveServiceType(item.value, p.serviceType),
                      }))
                    }
                  >
                    <span className={styles.segmentIcon} aria-hidden>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <hr className={styles.dashedDivider} />

            <div className={styles.fieldsRow}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>
                  <EnvironmentOutlined className={styles.fieldIcon} aria-hidden />
                  {t('searchAddress')}
                </span>
                <div className={styles.fieldControl}>
                  <LocationPicker variant="chip" className={styles.locationTrigger} />
                </div>
              </div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>
                  <CalendarOutlined className={styles.fieldIcon} aria-hidden />
                  {t('rentalTime')}
                </span>
                <div className={styles.fieldControl}>
                  <RentalDateTimeRangeField
                    value={searchDraft.rental}
                    onChange={setRentalRange}
                    mode={searchDraft.rental.mode}
                    onModeChange={setRentalMode}
                    compactPoint
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Hai cột tiêu chí — phần cuộn */}
          <div className={styles.scroll}>
            <div className={styles.columns}>
              {/* CỘT TRÁI: hãng · kiểu xe · giá · nhận xe · ưu đãi · đặt ngay */}
              <div className={styles.column}>
                <FilterGroup title={t('brand')} hint={t('multiple')}>
                  {brandItems.length > 0 ? (
                    <div className={styles.options}>
                      {displayedBrands.map((b) => (
                        <label key={b.key} className={styles.option}>
                          <Checkbox
                            checked={draft.brand.includes(b.key)}
                            onChange={() => toggleItem('brand', b.key)}
                          />
                          <span className={styles.optionLabel}>
                            <BrandMark label={b.label} iconUrl={b.iconUrl} />
                            <span className={styles.optionText}>{b.label}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.note}>{t('modal.noBrands')}</p>
                  )}
                  {brandItems.length > COLLAPSED_COUNT ? (
                    <SeeMore expanded={showAllBrands} onToggle={setShowAllBrands} />
                  ) : null}
                </FilterGroup>

                <FilterGroup title={t('modal.bodyType')} hint={t('multiple')}>
                  <div className={styles.options}>
                    {!isMotorbike
                      ? displayedBodyTypes.map((bt) => (
                          <label key={bt.key} className={styles.option}>
                            <Checkbox
                              checked={draft.bodyType.includes(bt.key)}
                              onChange={() => toggleItem('bodyType', bt.key)}
                            />
                            <span className={styles.optionLabel}>
                              <span className={styles.optionText}>{bt.label}</span>
                              {bt.description ? (
                                <span className={styles.optionPill}>{bt.description}</span>
                              ) : null}
                            </span>
                          </label>
                        ))
                      : MOTORBIKE_CATEGORY_VALUES.map((mc) => (
                          <label key={mc} className={styles.option}>
                            <Checkbox
                              checked={draft.motorbikeCategory.includes(mc)}
                              onChange={() => toggleItem('motorbikeCategory', mc)}
                            />
                            <span className={styles.optionText}>
                              {domainLabel('motorbikeCategory', mc)}
                            </span>
                          </label>
                        ))}
                  </div>
                  {!isMotorbike && bodyTypeItems.length > COLLAPSED_COUNT ? (
                    <SeeMore expanded={showAllBodyTypes} onToggle={setShowAllBodyTypes} />
                  ) : null}
                </FilterGroup>

                <hr className={styles.divider} />

                <div className={styles.priceBlock}>
                  <FilterGroup title={t('modal.priceRange')} hint={t('single')}>
                    <div className={styles.options}>
                      <label className={styles.option}>
                        <Radio
                          checked={draft.priceMin == null && draft.priceMax == null}
                          onChange={() => setPrice(undefined, undefined)}
                        />
                        <span className={styles.optionText}>{t('modal.all')}</span>
                      </label>
                      {priceBands.map((band) => (
                        <label key={`${band.min ?? ''}-${band.max ?? ''}`} className={styles.option}>
                          <Radio
                            checked={isPriceBandSelected(band, draft.priceMin, draft.priceMax)}
                            onChange={() => setPrice(band.min, band.max)}
                          />
                          <span className={styles.optionText}>{priceBandLabel(band)}</span>
                        </label>
                      ))}
                    </div>
                  </FilterGroup>

                  <div className={styles.priceInputs}>
                    <MoneyInput
                      className={styles.priceInput}
                      prefix={<span className={styles.priceInputLabel}>{t('minPrice')}</span>}
                      addonAfter={null}
                      min={0}
                      step={priceSlider.step}
                      value={draft.priceMin ?? null}
                      placeholder="0"
                      aria-label={t('minPrice')}
                      onChange={(v) => setPrice(v ?? undefined, draft.priceMax)}
                    />
                    <MoneyInput
                      className={styles.priceInput}
                      prefix={<span className={styles.priceInputLabel}>{t('maxPrice')}</span>}
                      addonAfter={null}
                      min={0}
                      step={priceSlider.step}
                      value={draft.priceMax ?? null}
                      placeholder={t('unlimited')}
                      aria-label={t('maxPrice')}
                      onChange={(v) => setPrice(draft.priceMin, v ?? undefined)}
                    />
                  </div>
                  <Slider
                    range
                    className={styles.priceSlider}
                    min={0}
                    max={priceSlider.max}
                    step={priceSlider.step}
                    value={sliderValue}
                    tooltip={{ formatter: (v) => (v == null ? '' : fmt.money(String(v))) }}
                    onChange={([lo = 0, hi = priceSlider.max]) =>
                      setPrice(lo > 0 ? lo : undefined, hi >= priceSlider.max ? undefined : hi)
                    }
                  />
                  <div className={styles.priceScale}>
                    <span>{fmt.pricePerDay('0')}</span>
                    <span>{fmt.pricePerDay(String(priceSlider.max))}+</span>
                  </div>
                  <p className={styles.note}>{t('modal.priceNote')}</p>
                </div>

                <hr className={styles.divider} />

                <FilterGroup title={t('modal.pickupMethod')} hint={t('single')}>
                  <div className={styles.options}>
                    <label className={styles.option}>
                      <Radio
                        checked={!draft.delivery}
                        onChange={() => setFlag('delivery', false)}
                      />
                      <span className={styles.optionText}>{t('modal.all')}</span>
                    </label>
                    <label className={styles.option}>
                      <Radio
                        checked={Boolean(draft.delivery)}
                        onChange={() => setFlag('delivery', true)}
                      />
                      <span className={styles.optionText}>{t('modal.deliveryOption')}</span>
                    </label>
                  </div>
                </FilterGroup>

                <FilterGroup title={t('modal.offers')} hint={t('multiple')}>
                  <p className={styles.note}>{t('modal.offersHint')}</p>
                  <div className={styles.options}>
                    <label className={styles.option}>
                      <Checkbox
                        checked={Boolean(draft.discount)}
                        onChange={(e) => setFlag('discount', e.target.checked)}
                      />
                      <span className={styles.optionText}>{t('modal.hasOffer')}</span>
                    </label>
                  </div>
                </FilterGroup>

                <hr className={styles.divider} />

                <div className={styles.toggleBlock}>
                  <div className={styles.toggleRow}>
                    <div className={styles.toggleText}>
                      <span className={styles.groupTitle} id="filter-instant-book">
                        {t('modal.instantBook')}
                      </span>
                      <span className={styles.note}>{t('modal.instantBookHint')}</span>
                    </div>
                    <Switch
                      size="small"
                      checked={Boolean(draft.instantBook)}
                      onChange={(checked) => setFlag('instantBook', checked)}
                      aria-labelledby="filter-instant-book"
                    />
                  </div>
                  <div className={styles.policyNote}>
                    <InfoCircleOutlined className={styles.policyIcon} aria-hidden />
                    <span>{t('modal.policyNote')}</span>
                  </div>
                </div>
              </div>

              {/* CỘT PHẢI: hộp số · số chỗ · nhiên liệu · tiện ích · đánh giá · điều kiện thuê */}
              <div className={styles.column}>
                <FilterGroup title={t('transmission')} hint={t('single')}>
                  <div className={styles.options}>
                    <label className={styles.option}>
                      <Radio
                        checked={draft.transmission.length === 0}
                        onChange={() => setDraft((p) => ({ ...p, transmission: [] }))}
                      />
                      <span className={styles.optionText}>{t('modal.all')}</span>
                    </label>
                    {transmissions.map((code) => (
                      <label key={code} className={styles.option}>
                        <Radio
                          checked={draft.transmission.includes(code)}
                          onChange={() => setDraft((p) => ({ ...p, transmission: [code] }))}
                        />
                        <span className={styles.optionText}>{transmissionLabel(code)}</span>
                      </label>
                    ))}
                  </div>
                </FilterGroup>

                {/* Số chỗ chỉ có nghĩa với ô tô. */}
                {!isMotorbike ? (
                  <FilterGroup title={t('modal.seats')} hint={t('multiple')}>
                    <div className={styles.options}>
                      {SEAT_BUCKET_VALUES.map((sb) => (
                        <label key={sb} className={styles.option}>
                          <Checkbox
                            checked={draft.seats.includes(sb)}
                            onChange={() => toggleItem('seats', sb)}
                          />
                          <span className={styles.optionText}>
                            {domainLabel('seatBucket', sb, SEAT_BUCKET_LABEL[sb])}
                          </span>
                        </label>
                      ))}
                    </div>
                  </FilterGroup>
                ) : null}

                <FilterGroup title={t('modal.fuelType')} hint={t('multiple')}>
                  <div className={styles.options}>
                    {fuelTypes.map((code) => (
                      <label key={code} className={styles.option}>
                        <Checkbox
                          checked={draft.fuelType.includes(code)}
                          onChange={() => toggleItem('fuelType', code)}
                        />
                        <span className={styles.optionText}>
                          {domainLabel('fuelType', code, FUEL_TYPE_LABEL[code])}
                        </span>
                      </label>
                    ))}
                  </div>
                </FilterGroup>

                <hr className={styles.divider} />

                <FilterGroup title={t('amenities')} hint={t('multiple')}>
                  <div className={styles.options}>
                    {displayedFeatures.map((f) => (
                      <label key={f.key} className={styles.option}>
                        <Checkbox
                          checked={draft.features.includes(f.key)}
                          onChange={() => toggleItem('features', f.key)}
                        />
                        <span className={styles.optionText}>{f.label}</span>
                      </label>
                    ))}
                  </div>
                  {featureItems.length > COLLAPSED_COUNT ? (
                    <SeeMore expanded={showAllFeatures} onToggle={setShowAllFeatures} />
                  ) : null}
                </FilterGroup>

                <FilterGroup title={t('rating')} hint={t('single')}>
                  <div className={styles.options}>
                    <label className={styles.option}>
                      <Radio
                        checked={draft.minRating == null}
                        onChange={() => setDraft((p) => ({ ...p, minRating: undefined }))}
                      />
                      <span className={styles.optionText}>{t('modal.all')}</span>
                    </label>
                    {LISTING_MIN_RATING_VALUES.map((rating) => (
                      <label key={rating} className={styles.option}>
                        <Radio
                          checked={draft.minRating === rating}
                          onChange={() => setDraft((p) => ({ ...p, minRating: rating }))}
                        />
                        <span className={styles.optionText}>{ratingLabel(rating)}</span>
                      </label>
                    ))}
                  </div>
                </FilterGroup>

                <hr className={styles.divider} />

                <FilterGroup title={t('modal.rentalTerms')} hint={t('multiple')}>
                  <div className={cx(styles.options, styles.optionsSingle)}>
                    <label className={styles.option}>
                      <Checkbox
                        checked={Boolean(draft.noCollateral)}
                        onChange={(e) => setFlag('noCollateral', e.target.checked)}
                      />
                      <span className={styles.optionText}>{t('amenityDesc.noCollateral')}</span>
                    </label>
                    <label className={styles.option}>
                      <Checkbox
                        checked={Boolean(draft.vatInvoice)}
                        onChange={(e) => setFlag('vatInvoice', e.target.checked)}
                      />
                      <span className={styles.optionText}>{t('vatInvoice')}</span>
                    </label>
                  </div>
                  {draft.vatInvoice ? (
                    <p className={styles.note}>{t('amenityDesc.vatInvoice')}</p>
                  ) : null}
                </FilterGroup>
              </div>
            </div>
          </div>
        </div>

        {/* Dải "Đang chọn" — cố định trên chân hộp */}
        {chips.length > 0 ? (
          <div className={styles.selectedBar}>
            <span className={styles.selectedLabel}>{t('selected')}</span>
            <div className={styles.chips}>
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className={styles.chip}
                  onClick={chip.onRemove}
                  aria-label={t('modal.removeChip', { label: chip.label })}
                >
                  <span>{chip.label}</span>
                  <CloseOutlined className={styles.chipIcon} aria-hidden />
                </button>
              ))}
              <button
                type="button"
                className={styles.resetBtn}
                onClick={handleClear}
                title={tCommon('actions.clearSelection')}
                aria-label={tCommon('actions.clearSelection')}
              >
                <ReloadOutlined />
              </button>
            </div>
          </div>
        ) : null}

        <div className={styles.footer}>
          <button type="button" className={styles.clearBtn} onClick={handleClear}>
            {t('clear')}
          </button>
          <button type="button" className={styles.applyBtn} onClick={handleApply}>
            {t('apply')}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.group}>
      <div className={styles.groupHeader}>
        <h3 className={styles.groupTitle}>{title}</h3>
        <span className={styles.groupHint}>{hint}</span>
      </div>
      {children}
    </section>
  );
}

function SeeMore({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: (next: boolean) => void;
}) {
  const t = useTranslations('Marketplace.filterPanel');
  return (
    <button
      type="button"
      className={styles.seeMore}
      aria-expanded={expanded}
      onClick={() => onToggle(!expanded)}
    >
      {expanded ? t('seeLess') : t('seeMore')}
    </button>
  );
}
