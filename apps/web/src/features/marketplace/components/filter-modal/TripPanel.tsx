'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useId, useMemo } from 'react';
import { LIST_SEPARATOR, startOfAppDay } from '@xeprime/domain';
import { VEHICLE_TYPE, type VehicleType } from '@xeprime/types';
import { RentalDateTimeRangeField } from '@/components/form/RentalDateTimeRangeField';
import { LineIcon } from '@/components/icons/LineIcon';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { provinceLabelOf } from '../../province-options';
import { LocationPicker } from '../../search/LocationPicker';
import { LongTermDateField, LongTermMonthsField } from '../../search/LongTermFields';
import { resolveServiceType, serviceUsesRentalRange } from '../../search/search-draft';
import { useSearchExperience, type TripDraft } from '../../search/search-context';
import { serviceItems, vehicleItems } from '../../search/search-items';
import { FilterChip } from './FilterChip';
import styles from './TripPanel.module.css';

/** Minh hoạ 3D của Figma (22600:80583 / 80587) - ảnh gốc 26px, lưu 3x. */
const VEHICLE_ILLUSTRATION: Readonly<Record<VehicleType, string>> = {
  [VEHICLE_TYPE.CAR]: '/home/vehicle-car.webp',
  [VEHICLE_TYPE.MOTORBIKE]: '/home/vehicle-motorbike.webp',
};

/** Số tỉnh gợi ý dưới ô địa điểm - danh mục đã sắp theo số xe giảm dần ở backend. */
const SUGGESTED_PROVINCES = 3;

/**
 * Viên tóm tắt hành trình ở đầu hộp Bộ lọc — Figma "Trip Summary Pill" (22588:63421, mobile
 * 22600:78243). Bấm để mở / thu khay "Đổi hành trình".
 */
export function TripSummary({
  vehicleType,
  serviceType,
  open,
  onToggle,
}: Pick<TripDraft, 'vehicleType' | 'serviceType'> & {
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations('Marketplace.filterPanel.modal.trip');
  const tService = useTranslations('HomeSearch.service');
  const tLocation = useTranslations('HomeSearch.location');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const { draft, destinations } = useSearchExperience();

  const service = serviceItems(vehicleType, false, tService).find(
    (item) => item.value === serviceType,
  );
  const vehicleService = t('vehicleService', {
    vehicle: domainLabel('vehicleType', vehicleType),
    service: service?.shortLabel ?? service?.label ?? '',
  });
  const place =
    provinceLabelOf(destinations, draft.provinceCode) ??
    (draft.provinceCode ? tLocation('unavailable') : tLocation('nationwide'));

  /*
   * Desktop đủ ngày giờ (`rentalPointCompact`), điện thoại chỉ ngày/tháng — Figma "13/10 → 14/10".
   * Dài hạn không có khoảng nhận–trả (ADR 0011): viên nói gói + ngày nhận mong muốn - Figma
   * `22647:49462` "2 tháng từ 13/10/2026".
   */
  const { pickupAt, returnAt } = draft.rental;
  const usesRange = serviceUsesRentalRange(serviceType);
  const hasDates = Boolean(pickupAt && returnAt);
  const timeWide =
    pickupAt && returnAt
      ? `${fmt.rentalPointCompact(pickupAt)} → ${fmt.rentalPointCompact(returnAt)}`
      : t('noDates');
  const timeNarrow =
    pickupAt && returnAt
      ? `${fmt.dayMonth(pickupAt.toISOString())} → ${fmt.dayMonth(returnAt.toISOString())}`
      : t('noDates');

  const longTermFrom = fmt.date(startOfAppDay(draft.longTerm.fromDate).toISOString());
  const longTermTime = t('longTermTime', {
    months: fmt.packageLabel(draft.longTerm.months) ?? '',
    date: longTermFrom,
  });

  const summary = [vehicleService, place, usesRange ? timeWide : longTermTime]
    .filter(Boolean)
    .join(LIST_SEPARATOR);

  return (
    <button
      type="button"
      className={cx(styles.pill, open && styles.pillOpen)}
      aria-expanded={open}
      aria-label={t('summaryAria', { summary })}
      onClick={onToggle}
    >
      <span className={styles.pillStrong}>{vehicleService}</span>
      <span className={styles.pillDot} aria-hidden="true">
        •
      </span>
      <span className={styles.pillStrong}>{place}</span>
      {usesRange ? (
        <>
          <span className={styles.pillDot} aria-hidden="true">
            •
          </span>
          <span className={cx(styles.pillTime, !hasDates && styles.pillMuted)}>
            <span className={styles.onlyWide}>{timeWide}</span>
            <span className={styles.onlyNarrow}>{timeNarrow}</span>
          </span>
        </>
      ) : (
        <>
          <span className={styles.pillDot} aria-hidden="true">
            •
          </span>
          <span className={styles.pillTime}>{longTermTime}</span>
        </>
      )}
      <span className={styles.pillAction}>{open ? t('collapse') : t('change')}</span>
    </button>
  );
}

/**
 * Khay "Đổi hành trình" — Figma desktop "Inline Trip Switcher Tray" (22588:74815), điện thoại
 * nằm trong "Header cố định" (22600:80568).
 *
 * Mọi lựa chọn trong khay là NHÁP (`value`/`onChange` của nơi gọi): chỉ "Cập nhật hành trình" mới
 * ghi vào tìm kiếm, "Hủy" bỏ hết. Luật loại xe ↔ dịch vụ đọc cùng bảng với thẻ tìm kiếm
 * (`vehicleItems` / `serviceItems` / `resolveServiceType`).
 */
export function TripTray({
  value,
  onChange,
  onCancel,
  onCommit,
}: {
  value: TripDraft;
  onChange: (next: TripDraft) => void;
  onCancel: () => void;
  onCommit: () => void;
}) {
  const t = useTranslations('Marketplace.filterPanel.modal');
  const tService = useTranslations('HomeSearch.service');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const { destinations } = useSearchExperience();

  const vehicles = useMemo(
    () => vehicleItems(domainLabel, value.serviceType),
    [domainLabel, value.serviceType],
  );
  const services = useMemo(
    () => serviceItems(value.vehicleType, false, tService),
    [value.vehicleType, tService],
  );
  const suggestions = (destinations ?? []).slice(0, SUGGESTED_PROVINCES);
  const usesRange = serviceUsesRentalRange(value.serviceType);
  const { pickupAt, returnAt } = value.rental;
  const vehicleLabelId = useId();
  const serviceLabelId = useId();

  return (
    <div className={styles.tray} role="group" aria-label={t('trip.trayAria')}>
      <div className={styles.trayTop}>
        <div className={styles.group}>
          <span className={cx(styles.label, styles.vehicleLabel)} id={vehicleLabelId}>
            {t('trip.vehicleKind')}
          </span>
          <div className={styles.segmented} role="radiogroup" aria-labelledby={vehicleLabelId}>
            {vehicles.map((item) => {
              const active = value.vehicleType === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={cx(styles.segment, active && styles.segmentActive)}
                  onClick={() =>
                    onChange({
                      ...value,
                      vehicleType: item.value,
                      // Xe máy không có "có tài xế" — rơi về tự lái, cùng luật với thẻ tìm kiếm.
                      serviceType: resolveServiceType(item.value, value.serviceType),
                    })
                  }
                >
                  <Image
                    src={VEHICLE_ILLUSTRATION[item.value]}
                    alt=""
                    width={26}
                    height={26}
                    className={styles.segmentArt}
                    unoptimized
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={cx(styles.group, styles.groupGrow)}>
          <span className={styles.label} id={serviceLabelId}>
            {t('rentalForm')}
          </span>
          <div className={styles.chips} role="group" aria-labelledby={serviceLabelId}>
            {services.map((item) => (
              <FilterChip
                key={item.value}
                active={value.serviceType === item.value}
                onClick={() => onChange({ ...value, serviceType: item.value })}
              >
                {item.label}
              </FilterChip>
            ))}
          </div>
        </div>
      </div>

      <div className={cx(styles.fields, !usesRange && styles.fieldsLongTerm)}>
        <div className={cx(styles.field, styles.fieldArea)}>
          <span className={cx(styles.label, styles.fieldLabel)}>{t('trip.area')}</span>
          <LocationPicker
            variant="select"
            value={value.provinceCode}
            onChange={(provinceCode) => onChange({ ...value, provinceCode })}
          />
        </div>

        {suggestions.length > 0 ? (
          <div className={styles.suggest}>
            <span className={styles.suggestLabel}>{t('trip.suggest')}</span>
            {suggestions.map((d) => (
              <button
                key={d.provinceCode}
                type="button"
                className={cx(
                  styles.suggestChip,
                  value.provinceCode === d.provinceCode && styles.suggestChipActive,
                )}
                aria-pressed={value.provinceCode === d.provinceCode}
                onClick={() => onChange({ ...value, provinceCode: d.provinceCode })}
              >
                {d.provinceName}
              </button>
            ))}
          </div>
        ) : null}

        {usesRange ? (
          <div className={cx(styles.field, styles.fieldTime)}>
            <span className={cx(styles.label, styles.fieldLabel)}>{t('trip.time')}</span>
            <div className={styles.inputShell}>
              <RentalDateTimeRangeField
                value={value.rental}
                onChange={(range) => onChange({ ...value, rental: { ...value.rental, ...range } })}
                mode={value.rental.mode}
                onModeChange={(mode) => onChange({ ...value, rental: { ...value.rental, mode } })}
                ariaLabel={t('trip.time')}
                suffix={
                  <span className={styles.timeSuffix}>
                    {pickupAt && returnAt ? (
                      <span className={styles.duration}>
                        {fmt.rentalDuration(pickupAt, returnAt)}
                      </span>
                    ) : null}
                    <LineIcon name="chevron-down" className={styles.caret} />
                  </span>
                }
              />
            </div>
          </div>
        ) : (
          <>
            <div className={cx(styles.field, styles.fieldPickup)}>
              <span className={cx(styles.label, styles.fieldLabel)}>{t('trip.pickupDate')}</span>
              <div className={styles.inputShell}>
                <LongTermDateField
                  value={value.longTerm}
                  onChange={(longTerm) => onChange({ ...value, longTerm })}
                  className={styles.longTermInput}
                  suffix={<LineIcon name="chevron-down" className={styles.caret} />}
                />
              </div>
            </div>
            <div className={cx(styles.field, styles.fieldDuration)}>
              <span className={cx(styles.label, styles.fieldLabel)}>{t('trip.duration')}</span>
              <div className={styles.inputShell}>
                <LongTermMonthsField
                  value={value.longTerm}
                  onChange={(longTerm) => onChange({ ...value, longTerm })}
                  withReturnDate
                  className={styles.longTermInput}
                  suffix={<LineIcon name="chevron-down" className={styles.caret} />}
                />
              </div>
            </div>
          </>
        )}
      </div>

      <div className={styles.actions}>
        <p className={styles.note}>{t('trip.note')}</p>
        <div className={styles.buttons}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            {t('trip.cancel')}
          </button>
          <button type="button" className={styles.commitBtn} onClick={onCommit}>
            {t('trip.update')}
          </button>
        </div>
      </div>
    </div>
  );
}
