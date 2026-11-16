'use client';

import { BulbOutlined } from '@ant-design/icons';
import { RENT_REFERENCE_BASIS, VEHICLE_TYPE, type VehicleDataRentField } from '@xeprime/types';
import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { useCatalogItems } from '@/features/catalog/use-catalog';
import { useVehicleDataSuggestion } from '@/features/vehicle-data/hooks';
import type {
  VehicleDataOption,
  VehicleDataSuggestion,
  VehicleDataValue,
} from '@/features/vehicle-data/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';

import styles from './CatalogSuggestions.module.css';

/**
 * Gợi ý từ Dữ liệu xe khi đăng/sửa xe (ADR 0090): GỢI Ý như Mioto, không tự điền. Mọi khối ở đây chỉ
 * hiện chữ + một nút để chủ xe chủ động dùng; lỗi mạng thì im lặng biến mất — gợi ý là phần thêm,
 * không được chặn việc đăng xe.
 */
export function useVehicleCatalogSuggestion(params: {
  modelId: string | null | undefined;
  variantId: string | null | undefined;
  year: number | null | undefined;
  vehicleId?: string | null;
}): VehicleDataSuggestion | null {
  return useVehicleDataSuggestion(params);
}

/** Thông số của xe chuẩn đang khớp — bấm "Áp dụng" mới chép vào form. */
export function CatalogSpecSuggestionCard({
  record,
  name,
  vehicleType,
  onApply,
}: {
  record: VehicleDataOption;
  /** Tên hiển thị: dòng xe + phiên bản. */
  name: string;
  vehicleType: string;
  onApply: (record: VehicleDataOption) => void;
}) {
  const t = useTranslations('Vehicles.form.catalog');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const { items: featureItems } = useCatalogItems('vehicle_feature');
  const featureLabel = new Map(featureItems.map((f) => [f.key, f.label]));
  const isCar = vehicleType === VEHICLE_TYPE.CAR;

  const facts: Array<[string, string]> = [];
  if (isCar && record.seatCount) {
    facts.push([t('spec.seats'), tCommon('units.seat', { count: record.seatCount })]);
  }
  if (record.fuelType) facts.push([t('spec.fuel'), domainLabel('fuelType', record.fuelType)]);
  if (record.transmission) {
    facts.push([t('spec.transmission'), domainLabel('transmissionType', record.transmission)]);
  }
  if (isCar && record.bodyType)
    facts.push([t('spec.body'), domainLabel('bodyType', record.bodyType)]);
  if (record.engineDisplacementCc) {
    facts.push([t('spec.engine'), t('spec.ccValue', { cc: record.engineDisplacementCc })]);
  }
  if (record.horsepowerHp)
    facts.push([t('spec.power'), t('spec.hpValue', { hp: record.horsepowerHp })]);
  if (record.lengthMm && record.widthMm && record.heightMm) {
    facts.push([
      t('spec.size'),
      t('spec.sizeValue', { l: record.lengthMm, w: record.widthMm, h: record.heightMm }),
    ]);
  }
  if (record.fuelConsumptionCombined) {
    facts.push([
      t('spec.consumption'),
      t('spec.consumptionValue', { value: record.fuelConsumptionCombined }),
    ]);
  }
  if (record.electricRangeKm) {
    facts.push([t('spec.range'), t('spec.rangeValue', { km: record.electricRangeKm })]);
  }
  const features = record.featureKeys.map((key) => featureLabel.get(key) ?? key);

  if (facts.length === 0 && features.length === 0) return null;

  return (
    <section className={styles.card} aria-label={t('specTitle', { name })}>
      <header className={styles.header}>
        <span className={styles.title}>
          <BulbOutlined aria-hidden /> {t('specTitle', { name })}
        </span>
        <Button size="small" onClick={() => onApply(record)}>
          {t('apply')}
        </Button>
      </header>
      <dl className={styles.facts}>
        {facts.map(([label, value]) => (
          <div key={label} className={styles.fact}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {features.length > 0 ? (
        <p className={styles.features}>{t('features', { list: features.join(', ') })}</p>
      ) : null}
      <p className={styles.note}>{t('applyNote')}</p>
    </section>
  );
}

/** Giá trị xe tham khảo cho bảo hiểm — giá xe mới của xe chuẩn × khấu hao theo tuổi xe. */
export function CatalogValueHint({
  value,
  onApply,
}: {
  value: VehicleDataValue;
  onApply: (amount: number) => void;
}) {
  const t = useTranslations('Vehicles.form.catalog');
  const fmt = useAppFormat();
  const basis =
    value.age > 0
      ? t('valueBasis', { age: value.age, percent: value.residualPercent })
      : t('valueBasisNew');
  return (
    <span className={styles.inlineHint}>
      {t('valueHint', { amount: fmt.money(value.amount) })} {basis}{' '}
      <Button
        type="link"
        size="small"
        className={styles.link}
        onClick={() => onApply(Number(value.amount))}
      >
        {t('useValue')}
      </Button>
    </span>
  );
}

/**
 * Gợi ý cho MỘT ô giá: giá tham khảo của XePrime (kèm nút dùng) + giá các xe cùng dòng đang cho thuê
 * trên chợ khi đủ mẫu. Không có gì ⇒ `fallback` (gợi ý theo phân khúc + tỉnh của wizard đăng nhanh).
 */
export function CatalogRentHint({
  suggestion,
  field,
  onApply,
  fallback = null,
}: {
  suggestion: VehicleDataSuggestion | null;
  field: VehicleDataRentField;
  onApply?: (price: number) => void;
  fallback?: ReactNode;
}) {
  const t = useTranslations('Vehicles.form.catalog');
  const fmt = useAppFormat();
  const rent = suggestion?.rent.find((r) => r.field === field);
  if (!rent || (!rent.reference && !rent.market)) return <>{fallback}</>;
  return (
    <div className={styles.rent}>
      {rent.reference ? (
        <p className={styles.rentRange}>
          {rent.referenceBasis === RENT_REFERENCE_BASIS.MODEL
            ? t('rentReferenceModel', { price: fmt.money(rent.reference) })
            : t('rentReference', { price: fmt.money(rent.reference) })}
          {onApply ? (
            <Button
              type="link"
              size="small"
              className={styles.link}
              onClick={() => onApply(Number(rent.reference))}
            >
              {t('useRent', { price: fmt.money(rent.reference) })}
            </Button>
          ) : null}
        </p>
      ) : null}
      {rent.market ? (
        <p className={styles.note}>
          {t('rentMarket', {
            low: fmt.money(rent.market.low),
            high: fmt.money(rent.market.high),
            count: rent.market.sampleSize,
          })}
        </p>
      ) : null}
    </div>
  );
}

/**
 * `CatalogRentHint` tự lấy gợi ý — dùng ở nơi không có sẵn dữ liệu gợi ý (màn sửa xe: form giá là
 * một form riêng, dòng/phiên bản/năm đọc từ bản ghi xe). Cùng query key với form nên không gọi thêm.
 */
export function CatalogRentHintFor({
  modelId,
  variantId,
  year,
  vehicleId,
  field,
  onApply,
  fallback = null,
}: {
  modelId: string | null | undefined;
  variantId: string | null | undefined;
  year: number | null | undefined;
  vehicleId?: string | null;
  field: VehicleDataRentField;
  onApply?: (price: number) => void;
  fallback?: ReactNode;
}) {
  const suggestion = useVehicleCatalogSuggestion({ modelId, variantId, year, vehicleId });
  return (
    <CatalogRentHint suggestion={suggestion} field={field} onApply={onApply} fallback={fallback} />
  );
}
