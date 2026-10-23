'use client';

import { CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import { Checkbox, InputNumber, Radio } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  CATALOG_TYPE,
  FUEL_TYPE_LABEL,
  MOTORBIKE_CATEGORY_VALUES,
  SEAT_BUCKET_LABEL,
  SEAT_BUCKET_VALUES,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
  TRANSMISSION_TYPE_EXT_LABEL,
  VEHICLE_TYPE,
  VEHICLE_TYPE_LABEL,
  VEHICLE_TYPE_VALUES,
  vehicleFuelTypesFor,
  vehicleServiceTypesFor,
  type ServiceType,
  type TransmissionTypeExt,
} from '@xeprime/types';
import { RentalDateTimeRangeField } from '@/components/form/RentalDateTimeRangeField';
import { VEHICLE_TYPE_ICON } from '@/components/data-display/VehicleTypeIcon';
import { catalogItemAppliesTo } from '@/features/catalog/types';
import { useCatalog } from '@/features/catalog/use-catalog';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { isPriceBandSelected, priceBandsFor, quickTransmissionsFor } from '../constants';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import { LocationPicker } from '../search/LocationPicker';
import { resolveServiceType } from '../search/search-draft';
import { useSearchExperience } from '../search/search-context';
import { usePriceBandLabel } from '../search/use-price-band-label';
import type { MarketplaceFilters } from '../types';
import styles from './FilterModal.module.css';

interface FilterModalProps {
  open: boolean;
  onClose: () => void;
}

interface ModalDraft {
  vehicleType?: string;
  serviceType?: string;
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
}

function initDraft(filters: MarketplaceFilters): ModalDraft {
  return {
    vehicleType: filters.vehicleType ?? VEHICLE_TYPE.CAR,
    serviceType: filters.serviceType ?? SERVICE_TYPE.SELF_DRIVE,
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
  };
}

export function FilterModal({ open, onClose }: FilterModalProps) {
  const t = useTranslations('Marketplace.filterPanel');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
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

  if (!open) return null;

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
  const serviceTypes = SERVICE_TYPE_VALUES.filter((value) =>
    vehicleServiceTypesFor(draft.vehicleType ?? VEHICLE_TYPE.CAR).includes(value),
  );
  const vehicleTypes = VEHICLE_TYPE_VALUES.filter((value) =>
    vehicleServiceTypesFor(value).includes(
      (draft.serviceType ?? SERVICE_TYPE.SELF_DRIVE) as ServiceType,
    ),
  );
  const priceBands = priceBandsFor(draft.vehicleType);
  const transmissions = quickTransmissionsFor(draft.vehicleType);
  const fuelTypes = vehicleFuelTypesFor(draft.vehicleType ?? VEHICLE_TYPE.CAR);
  const transmissionLabel = (code: string) =>
    domainLabel(
      'transmissionType',
      code,
      TRANSMISSION_TYPE_EXT_LABEL[code as TransmissionTypeExt] ?? code,
    );

  const displayedBrands = showAllBrands ? brandItems : brandItems.slice(0, 6);
  const displayedBodyTypes = showAllBodyTypes ? bodyTypeItems : bodyTypeItems.slice(0, 6);
  const displayedFeatures = showAllFeatures ? featureItems : featureItems.slice(0, 6);

  const toggleItem = (
    field:
      | 'brand'
      | 'bodyType'
      | 'motorbikeCategory'
      | 'seats'
      | 'fuelType'
      | 'features'
      | 'transmission',
    value: string,
  ) => {
    setDraft((prev) => {
      const list = prev[field];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...prev, [field]: next };
    });
  };

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
      priceMin: undefined,
      priceMax: undefined,
      delivery: undefined,
      noCollateral: undefined,
      vatInvoice: undefined,
      discount: undefined,
    });
  };

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="filter-modal-title"
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
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

        {/* Content */}
        <div className={styles.content}>
          {/* 1. Dải tab Dịch vụ */}
          <div className={styles.serviceSegmented}>
            {serviceTypes.map((value) => (
              <button
                key={value}
                type="button"
                className={cx(
                  styles.serviceTab,
                  draft.serviceType === value && styles.serviceTabActive,
                )}
                onClick={() => setDraft((p) => ({ ...p, serviceType: value }))}
              >
                <span>{domainLabel('serviceType', value)}</span>
              </button>
            ))}
          </div>

          {/* 2. Loại xe (Ô tô / Xe máy) */}
          <div className={styles.vehicleTypeRow}>
            <span className={styles.rowLabel}>{t('vehicleType')}</span>
            <div className={styles.vehicleTypeSegmented}>
              {vehicleTypes.map((value) => {
                const Icon = VEHICLE_TYPE_ICON[value];
                return (
                  <button
                    key={value}
                    type="button"
                    className={cx(
                      styles.vehicleTypeTab,
                      draft.vehicleType === value && styles.vehicleTypeTabActive,
                    )}
                    onClick={() =>
                      setDraft((p) => ({
                        ...p,
                        vehicleType: value,
                        // Xe máy không có "có tài xế" — rơi về tự lái, cùng luật với thẻ tìm kiếm.
                        serviceType: resolveServiceType(
                          value,
                          (p.serviceType ?? SERVICE_TYPE.SELF_DRIVE) as ServiceType,
                        ),
                      }))
                    }
                  >
                    <Icon aria-hidden />
                    <span>{domainLabel('vehicleType', value, VEHICLE_TYPE_LABEL[value])}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Ô Địa chỉ tìm xe & Thời gian nhận/trả */}
          <div className={styles.fieldsRow}>
            <div className={styles.fieldBox}>
              <span className={styles.fieldLabel}>{t('searchAddress')}</span>
              <div className={styles.fieldInputWrapper}>
                <LocationPicker variant="chip" />
              </div>
            </div>
            <div className={styles.fieldBox}>
              <span className={styles.fieldLabel}>{t('rentalTime')}</span>
              <div className={styles.fieldInputWrapper}>
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

          {/* 4. Hai cột lọc chính */}
          <div className={styles.filterGrid}>
            {/* CỘT TRÁI */}
            <div className={styles.column}>
              {/* Hãng xe */}
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>{t('brand')}</h3>
                  <span className={styles.sectionHint}>{t('multiple')}</span>
                </div>
                <div className={styles.optionsGrid}>
                  {displayedBrands.map((b) => (
                    <label key={b.key} className={styles.checkboxLabel}>
                      <Checkbox
                        checked={draft.brand.includes(b.key)}
                        onChange={() => toggleItem('brand', b.key)}
                      />
                      <span>{b.label}</span>
                    </label>
                  ))}
                </div>
                {brandItems.length > 6 ? (
                  <button
                    type="button"
                    className={styles.seeMoreLink}
                    onClick={() => setShowAllBrands(!showAllBrands)}
                  >
                    {showAllBrands ? t('seeLess') : t('seeMore')}
                  </button>
                ) : null}
              </div>

              {/* Kiểu dáng (BodyType cho ô tô, Phân khúc cho xe máy) */}
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>{t('bodyType')}</h3>
                  <span className={styles.sectionHint}>{t('multiple')}</span>
                </div>
                <div className={styles.optionsGrid}>
                  {!isMotorbike
                    ? displayedBodyTypes.map((bt) => (
                        <label key={bt.key} className={styles.checkboxLabel}>
                          <Checkbox
                            checked={draft.bodyType.includes(bt.key)}
                            onChange={() => toggleItem('bodyType', bt.key)}
                          />
                          <span>{bt.label}</span>
                        </label>
                      ))
                    : MOTORBIKE_CATEGORY_VALUES.map((mc) => (
                        <label key={mc} className={styles.checkboxLabel}>
                          <Checkbox
                            checked={draft.motorbikeCategory.includes(mc)}
                            onChange={() => toggleItem('motorbikeCategory', mc)}
                          />
                          <span>{domainLabel('motorbikeCategory', mc)}</span>
                        </label>
                      ))}
                </div>
                {!isMotorbike && bodyTypeItems.length > 6 ? (
                  <button
                    type="button"
                    className={styles.seeMoreLink}
                    onClick={() => setShowAllBodyTypes(!showAllBodyTypes)}
                  >
                    {showAllBodyTypes ? t('seeLess') : t('seeMore')}
                  </button>
                ) : null}
              </div>

              {/* Khoảng giá */}
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>{t('priceRange')}</h3>
                  <span className={styles.sectionHint}>{t('single')}</span>
                </div>
                <div className={styles.radioGroup}>
                  <label className={styles.radioLabel}>
                    <Radio
                      checked={draft.priceMin == null && draft.priceMax == null}
                      onChange={() =>
                        setDraft((p) => ({ ...p, priceMin: undefined, priceMax: undefined }))
                      }
                    />
                    <span>{t('any')}</span>
                  </label>
                  {priceBands.map((band) => (
                    <label
                      key={`${band.min ?? ''}-${band.max ?? ''}`}
                      className={styles.radioLabel}
                    >
                      <Radio
                        checked={isPriceBandSelected(band, draft.priceMin, draft.priceMax)}
                        onChange={() =>
                          setDraft((p) => ({ ...p, priceMin: band.min, priceMax: band.max }))
                        }
                      />
                      <span>{priceBandLabel(band)}</span>
                    </label>
                  ))}
                </div>

                <div className={styles.priceInputsRow}>
                  <div className={styles.priceInputBlock}>
                    <span className={styles.priceInputTitle}>{t('minPrice')}</span>
                    <InputNumber
                      className={styles.priceInput}
                      min={0}
                      step={50_000}
                      value={draft.priceMin}
                      onChange={(v) => setDraft((p) => ({ ...p, priceMin: v ?? undefined }))}
                      formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    />
                  </div>
                  <div className={styles.priceInputBlock}>
                    <span className={styles.priceInputTitle}>{t('maxPrice')}</span>
                    <InputNumber
                      className={styles.priceInput}
                      min={0}
                      step={50_000}
                      value={draft.priceMax}
                      placeholder={t('unlimited')}
                      onChange={(v) => setDraft((p) => ({ ...p, priceMax: v ?? undefined }))}
                      formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    />
                  </div>
                </div>

                {/* Đang chọn pills */}
                <div className={styles.selectedRow}>
                  <span>{t('selected')}:</span>
                  {draft.transmission.map((tr) => (
                    <button
                      key={tr}
                      type="button"
                      className={styles.selectedChip}
                      onClick={() => toggleItem('transmission', tr)}
                    >
                      <span>{transmissionLabel(tr)}</span>
                      <CloseOutlined className={styles.chipCloseIcon} aria-hidden />
                    </button>
                  ))}
                  {draft.priceMin != null || draft.priceMax != null ? (
                    <button
                      type="button"
                      className={styles.selectedChip}
                      onClick={() =>
                        setDraft((p) => ({ ...p, priceMin: undefined, priceMax: undefined }))
                      }
                    >
                      <span>{priceBandLabel({ min: draft.priceMin, max: draft.priceMax })}</span>
                      <CloseOutlined className={styles.chipCloseIcon} aria-hidden />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.resetIconBtn}
                    onClick={handleClear}
                    title={tCommon('actions.clearSelection')}
                    aria-label={tCommon('actions.clearSelection')}
                  >
                    <ReloadOutlined />
                  </button>
                </div>
              </div>
            </div>

            {/* CỘT PHẢI */}
            <div className={styles.column}>
              {/* Hộp số */}
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>{t('transmission')}</h3>
                  <span className={styles.sectionHint}>{t('single')}</span>
                </div>
                <div className={styles.radioGroup}>
                  <label className={styles.radioLabel}>
                    <Radio
                      checked={draft.transmission.length === 0}
                      onChange={() => setDraft((p) => ({ ...p, transmission: [] }))}
                    />
                    <span>{t('any')}</span>
                  </label>
                  {transmissions.map((code) => (
                    <label key={code} className={styles.radioLabel}>
                      <Radio
                        checked={draft.transmission.includes(code)}
                        onChange={() => setDraft((p) => ({ ...p, transmission: [code] }))}
                      />
                      <span>{transmissionLabel(code)}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Số chỗ ngồi (CHỈ CHO Ô TÔ!) */}
              {!isMotorbike ? (
                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>{t('seats')}</h3>
                    <span className={styles.sectionHint}>{t('multiple')}</span>
                  </div>
                  <div className={styles.optionsGrid}>
                    {SEAT_BUCKET_VALUES.map((sb) => (
                      <label key={sb} className={styles.checkboxLabel}>
                        <Checkbox
                          checked={draft.seats.includes(sb)}
                          onChange={() => toggleItem('seats', sb)}
                        />
                        <span>{domainLabel('seatBucket', sb, SEAT_BUCKET_LABEL[sb])}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Nhiên liệu */}
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>{t('fuelType')}</h3>
                  <span className={styles.sectionHint}>{t('multiple')}</span>
                </div>
                <div className={styles.optionsGrid}>
                  {fuelTypes.map((code) => (
                    <label key={code} className={styles.checkboxLabel}>
                      <Checkbox
                        checked={draft.fuelType.includes(code)}
                        onChange={() => toggleItem('fuelType', code)}
                      />
                      <span>{domainLabel('fuelType', code, FUEL_TYPE_LABEL[code])}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Tiện ích */}
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>{t('amenities')}</h3>
                  <span className={styles.sectionHint}>{t('multiple')}</span>
                </div>
                <div className={styles.optionsGrid}>
                  <label className={styles.checkboxLabel}>
                    <Checkbox
                      checked={Boolean(draft.delivery)}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, delivery: e.target.checked || undefined }))
                      }
                    />
                    <span>{t('amenityDesc.delivery')}</span>
                  </label>
                  <label className={styles.checkboxLabel}>
                    <Checkbox
                      checked={Boolean(draft.noCollateral)}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, noCollateral: e.target.checked || undefined }))
                      }
                    />
                    <span>{t('amenityDesc.noCollateral')}</span>
                  </label>
                  <label className={styles.checkboxLabel}>
                    <Checkbox
                      checked={Boolean(draft.vatInvoice)}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, vatInvoice: e.target.checked || undefined }))
                      }
                    />
                    <span>{t('vatInvoice')}</span>
                  </label>
                  <label className={styles.checkboxLabel}>
                    <Checkbox
                      checked={Boolean(draft.discount)}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, discount: e.target.checked || undefined }))
                      }
                    />
                    <span>{t('amenityDesc.discount')}</span>
                  </label>
                  {displayedFeatures.map((f) => (
                    <label key={f.key} className={styles.checkboxLabel}>
                      <Checkbox
                        checked={draft.features.includes(f.key)}
                        onChange={() => toggleItem('features', f.key)}
                      />
                      <span>{f.label}</span>
                    </label>
                  ))}
                </div>
                {featureItems.length > 6 ? (
                  <button
                    type="button"
                    className={styles.seeMoreLink}
                    onClick={() => setShowAllFeatures(!showAllFeatures)}
                  >
                    {showAllFeatures ? t('seeLess') : t('seeMore')}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
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
