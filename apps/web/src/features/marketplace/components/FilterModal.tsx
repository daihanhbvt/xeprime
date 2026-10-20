'use client';

import {
  CarOutlined,
  CloseOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Checkbox, InputNumber, Radio } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import {
  CATALOG_TYPE,
  FUEL_TYPE_VALUES,
  MOTORBIKE_CATEGORY_VALUES,
  SEAT_BUCKET_LABEL,
  SEAT_BUCKET_VALUES,
  SERVICE_TYPE,
  SERVICE_TYPE_LABEL,
  VEHICLE_TYPE,
  type SeatBucket,
  type ServiceType,
  type VehicleType,
} from '@xeprime/types';
import { RentalDateTimeRangeField } from '@/components/form/RentalDateTimeRangeField';
import { useCatalog, useCatalogLabels } from '@/features/catalog/use-catalog';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import { LocationPicker } from '../search/LocationPicker';
import { useSearchExperience } from '../search/search-context';
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
  const domainLabel = useDomainLabel();
  const { filters, setFilters } = useMarketplaceFilters();
  const { draft: searchDraft, setRentalRange, setRentalMode } = useSearchExperience();
  const { catalog } = useCatalog();
  const { brandLabel } = useCatalogLabels();

  const [draft, setDraft] = useState<ModalDraft>(() => initDraft(filters));
  const [showAllBrands, setShowAllBrands] = useState(false);
  const [showAllBodyTypes, setShowAllBodyTypes] = useState(false);
  const [showAllFeatures, setShowAllFeatures] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(initDraft(filters));
      setShowAllBrands(false);
      setShowAllBodyTypes(false);
      setShowAllFeatures(false);
    }
  }, [open, filters]);

  if (!open) return null;

  const isMotorbike = draft.vehicleType === VEHICLE_TYPE.MOTORBIKE;
  const brandItems = catalog[CATALOG_TYPE.VEHICLE_BRAND] ?? [];
  const bodyTypeItems = catalog[CATALOG_TYPE.BODY_TYPE] ?? [];
  const featureItems = catalog[CATALOG_TYPE.VEHICLE_FEATURE] ?? [];

  const displayedBrands = showAllBrands ? brandItems : brandItems.slice(0, 6);
  const displayedBodyTypes = showAllBodyTypes ? bodyTypeItems : bodyTypeItems.slice(0, 6);
  const displayedFeatures = showAllFeatures ? featureItems : featureItems.slice(0, 6);

  const toggleItem = (
    field: 'brand' | 'bodyType' | 'motorbikeCategory' | 'seats' | 'fuelType' | 'features' | 'transmission',
    value: string,
  ) => {
    setDraft((prev) => {
      const list = prev[field];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...prev, [field]: next };
    });
  };

  const handleApply = () => {
    setFilters({
      vehicleType: draft.vehicleType,
      serviceType: draft.serviceType,
      brand: draft.brand.length > 0 ? draft.brand : undefined,
      bodyType: !isMotorbike && draft.bodyType.length > 0 ? draft.bodyType : undefined,
      motorbikeCategory: isMotorbike && draft.motorbikeCategory.length > 0 ? draft.motorbikeCategory : undefined,
      seats: !isMotorbike && draft.seats.length > 0 ? draft.seats : undefined,
      fuelType: draft.fuelType.length > 0 ? draft.fuelType : undefined,
      features: draft.features.length > 0 ? draft.features : undefined,
      transmission: draft.transmission.length > 0 ? draft.transmission : undefined,
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
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="filter-modal-title">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <h2 id="filter-modal-title" className={styles.title}>{t('title')}</h2>
            <p className={styles.subtitle}>{t('subtitle')}</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <CloseOutlined />
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {/* 1. Dải tab Dịch vụ */}
          <div className={styles.serviceSegmented}>
            <button
              type="button"
              className={cx(
                styles.serviceTab,
                draft.serviceType === SERVICE_TYPE.SELF_DRIVE && styles.serviceTabActive,
              )}
              onClick={() => setDraft((p) => ({ ...p, serviceType: SERVICE_TYPE.SELF_DRIVE }))}
            >
              <span>{domainLabel('serviceType', SERVICE_TYPE.SELF_DRIVE)}</span>
            </button>
            <button
              type="button"
              className={cx(
                styles.serviceTab,
                draft.serviceType === SERVICE_TYPE.WITH_DRIVER && styles.serviceTabActive,
              )}
              onClick={() => setDraft((p) => ({ ...p, serviceType: SERVICE_TYPE.WITH_DRIVER }))}
            >
              <span>{domainLabel('serviceType', SERVICE_TYPE.WITH_DRIVER)}</span>
            </button>
            <button
              type="button"
              className={cx(
                styles.serviceTab,
                draft.serviceType === SERVICE_TYPE.LONG_TERM && styles.serviceTabActive,
              )}
              onClick={() => setDraft((p) => ({ ...p, serviceType: SERVICE_TYPE.LONG_TERM }))}
            >
              <span>{domainLabel('serviceType', SERVICE_TYPE.LONG_TERM)}</span>
            </button>
          </div>

          {/* 2. Loại xe (Ô tô / Xe máy) */}
          <div className={styles.vehicleTypeRow}>
            <span className={styles.rowLabel}>{t('vehicleType')}</span>
            <div className={styles.vehicleTypeSegmented}>
              <button
                type="button"
                className={cx(
                  styles.vehicleTypeTab,
                  draft.vehicleType === VEHICLE_TYPE.CAR && styles.vehicleTypeTabActive,
                )}
                onClick={() => setDraft((p) => ({ ...p, vehicleType: VEHICLE_TYPE.CAR }))}
              >
                <CarOutlined />
                <span>Ô tô</span>
              </button>
              <button
                type="button"
                className={cx(
                  styles.vehicleTypeTab,
                  draft.vehicleType === VEHICLE_TYPE.MOTORBIKE && styles.vehicleTypeTabActive,
                )}
                onClick={() => setDraft((p) => ({ ...p, vehicleType: VEHICLE_TYPE.MOTORBIKE }))}
              >
                <ThunderboltOutlined />
                <span>Xe máy</span>
              </button>
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

              {/* Kiểu xe (BodyType cho ô tô, Phân khúc cho xe máy) */}
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>{t('vehicleType')}</h3>
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
                  {!isMotorbike ? (
                    <>
                      <label className={styles.radioLabel}>
                        <Radio
                          checked={draft.priceMin == null && draft.priceMax == null}
                          onChange={() =>
                            setDraft((p) => ({ ...p, priceMin: undefined, priceMax: undefined }))
                          }
                        />
                        <span>{t('any')}</span>
                      </label>
                      <label className={styles.radioLabel}>
                        <Radio
                          checked={draft.priceMax === 500_000 && draft.priceMin == null}
                          onChange={() =>
                            setDraft((p) => ({ ...p, priceMin: undefined, priceMax: 500_000 }))
                          }
                        />
                        <span>Dưới 500k</span>
                      </label>
                      <label className={styles.radioLabel}>
                        <Radio
                          checked={draft.priceMin === 500_000 && draft.priceMax === 1_000_000}
                          onChange={() =>
                            setDraft((p) => ({ ...p, priceMin: 500_000, priceMax: 1_000_000 }))
                          }
                        />
                        <span>500k – 1 triệu</span>
                      </label>
                      <label className={styles.radioLabel}>
                        <Radio
                          checked={draft.priceMin === 1_000_000 && draft.priceMax == null}
                          onChange={() =>
                            setDraft((p) => ({ ...p, priceMin: 1_000_000, priceMax: undefined }))
                          }
                        />
                        <span>Trên 1 triệu</span>
                      </label>
                    </>
                  ) : (
                    <>
                      <label className={styles.radioLabel}>
                        <Radio
                          checked={draft.priceMin == null && draft.priceMax == null}
                          onChange={() =>
                            setDraft((p) => ({ ...p, priceMin: undefined, priceMax: undefined }))
                          }
                        />
                        <span>{t('any')}</span>
                      </label>
                      <label className={styles.radioLabel}>
                        <Radio
                          checked={draft.priceMax === 100_000 && draft.priceMin == null}
                          onChange={() =>
                            setDraft((p) => ({ ...p, priceMin: undefined, priceMax: 100_000 }))
                          }
                        />
                        <span>Dưới 100k</span>
                      </label>
                      <label className={styles.radioLabel}>
                        <Radio
                          checked={draft.priceMin === 100_000 && draft.priceMax === 200_000}
                          onChange={() =>
                            setDraft((p) => ({ ...p, priceMin: 100_000, priceMax: 200_000 }))
                          }
                        />
                        <span>100k – 200k</span>
                      </label>
                      <label className={styles.radioLabel}>
                        <Radio
                          checked={draft.priceMin === 200_000 && draft.priceMax == null}
                          onChange={() =>
                            setDraft((p) => ({ ...p, priceMin: 200_000, priceMax: undefined }))
                          }
                        />
                        <span>Trên 200k</span>
                      </label>
                    </>
                  )}
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
                      <span>{tr === 'automatic' ? 'Số tự động' : tr === 'manual' ? 'Số sàn' : tr}</span>
                      <CloseOutlined style={{ fontSize: 10 }} />
                    </button>
                  ))}
                  {draft.priceMax ? (
                    <button
                      type="button"
                      className={styles.selectedChip}
                      onClick={() => setDraft((p) => ({ ...p, priceMax: undefined }))}
                    >
                      <span>{`Dưới ${draft.priceMax / 1000}k`}</span>
                      <CloseOutlined style={{ fontSize: 10 }} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.resetIconBtn}
                    onClick={handleClear}
                    title="Xóa lựa chọn"
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
                  {!isMotorbike ? (
                    <>
                      <label className={styles.radioLabel}>
                        <Radio
                          checked={draft.transmission.length === 0}
                          onChange={() => setDraft((p) => ({ ...p, transmission: [] }))}
                        />
                        <span>{t('any')}</span>
                      </label>
                      <label className={styles.radioLabel}>
                        <Radio
                          checked={draft.transmission.includes('automatic')}
                          onChange={() => setDraft((p) => ({ ...p, transmission: ['automatic'] }))}
                        />
                        <span>Số tự động</span>
                      </label>
                      <label className={styles.radioLabel}>
                        <Radio
                          checked={draft.transmission.includes('manual')}
                          onChange={() => setDraft((p) => ({ ...p, transmission: ['manual'] }))}
                        />
                        <span>Số sàn</span>
                      </label>
                    </>
                  ) : (
                    <>
                      <label className={styles.radioLabel}>
                        <Radio
                          checked={draft.transmission.length === 0}
                          onChange={() => setDraft((p) => ({ ...p, transmission: [] }))}
                        />
                        <span>{t('any')}</span>
                      </label>
                      <label className={styles.radioLabel}>
                        <Radio
                          checked={draft.transmission.includes('automatic_cvt')}
                          onChange={() => setDraft((p) => ({ ...p, transmission: ['automatic_cvt'] }))}
                        />
                        <span>Tự động (tay ga)</span>
                      </label>
                      <label className={styles.radioLabel}>
                        <Radio
                          checked={draft.transmission.includes('semi_automatic')}
                          onChange={() => setDraft((p) => ({ ...p, transmission: ['semi_automatic'] }))}
                        />
                        <span>Bán tự động</span>
                      </label>
                      <label className={styles.radioLabel}>
                        <Radio
                          checked={draft.transmission.includes('manual_clutch')}
                          onChange={() => setDraft((p) => ({ ...p, transmission: ['manual_clutch'] }))}
                        />
                        <span>Côn tay</span>
                      </label>
                    </>
                  )}
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
                  {!isMotorbike ? (
                    <>
                      <label className={styles.checkboxLabel}>
                        <Checkbox
                          checked={draft.fuelType.includes('petrol')}
                          onChange={() => toggleItem('fuelType', 'petrol')}
                        />
                        <span>Xăng</span>
                      </label>
                      <label className={styles.checkboxLabel}>
                        <Checkbox
                          checked={draft.fuelType.includes('diesel')}
                          onChange={() => toggleItem('fuelType', 'diesel')}
                        />
                        <span>Dầu diesel</span>
                      </label>
                      <label className={styles.checkboxLabel}>
                        <Checkbox
                          checked={draft.fuelType.includes('electric')}
                          onChange={() => toggleItem('fuelType', 'electric')}
                        />
                        <span>Điện</span>
                      </label>
                      <label className={styles.checkboxLabel}>
                        <Checkbox
                          checked={draft.fuelType.includes('hybrid')}
                          onChange={() => toggleItem('fuelType', 'hybrid')}
                        />
                        <span>Hybrid</span>
                      </label>
                    </>
                  ) : (
                    <>
                      <label className={styles.checkboxLabel}>
                        <Checkbox
                          checked={draft.fuelType.includes('petrol')}
                          onChange={() => toggleItem('fuelType', 'petrol')}
                        />
                        <span>Xăng</span>
                      </label>
                      <label className={styles.checkboxLabel}>
                        <Checkbox
                          checked={draft.fuelType.includes('electric')}
                          onChange={() => toggleItem('fuelType', 'electric')}
                        />
                        <span>Điện</span>
                      </label>
                    </>
                  )}
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
                      onChange={(e) => setDraft((p) => ({ ...p, delivery: e.target.checked || undefined }))}
                    />
                    <span>{t('amenityDesc.delivery')}</span>
                  </label>
                  <label className={styles.checkboxLabel}>
                    <Checkbox
                      checked={Boolean(draft.noCollateral)}
                      onChange={(e) => setDraft((p) => ({ ...p, noCollateral: e.target.checked || undefined }))}
                    />
                    <span>{t('amenityDesc.noCollateral')}</span>
                  </label>
                  <label className={styles.checkboxLabel}>
                    <Checkbox
                      checked={Boolean(draft.vatInvoice)}
                      onChange={(e) => setDraft((p) => ({ ...p, vatInvoice: e.target.checked || undefined }))}
                    />
                    <span>Xuất hoá đơn VAT</span>
                  </label>
                  <label className={styles.checkboxLabel}>
                    <Checkbox
                      checked={Boolean(draft.discount)}
                      onChange={(e) => setDraft((p) => ({ ...p, discount: e.target.checked || undefined }))}
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
