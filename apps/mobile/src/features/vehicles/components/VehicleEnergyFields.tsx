import { useEffect, useMemo } from 'react';
import { useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  CATALOG_TYPE,
  VEHICLE_ENERGY_LIMITS,
  VEHICLE_TYPE,
  vehicleEnergySpecPolicy,
  vehicleFuelTypesFor,
  vehicleTransmissionTypesFor,
} from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { NumberField } from '@/components/ui/NumberField';
import { SelectField } from '@/components/ui/SelectField';
import { useCatalog } from '@/features/catalog/use-catalog';
import { useDomainLabel } from '@/i18n/domain';
import { space } from '@/theme/tokens';

/**
 * Lựa chọn truyền động HỢP LỆ của chiếc xe đang khai — bản native của `useTransmissionOptions`.
 *
 * Xe máy tay ga/xe số/côn tay, ô tô MT/AT/CVT/DCT/AMT, xe điện truyền động một cấp — ba bộ khác
 * hẳn nhau. Nguồn là `vehicleTransmissionTypesFor` ở `@xeprime/types`, cùng hàm backend dùng để
 * từ chối giá trị sai, nên form không đưa ra một lựa chọn mà server sẽ chặn.
 */
export function useTransmissionOptions(vehicleType: string, fuelType: string | null | undefined) {
  const domainLabel = useDomainLabel();
  return useMemo(
    () =>
      vehicleTransmissionTypesFor(vehicleType, fuelType).map((value) => ({
        value,
        label: domainLabel('transmissionType', value),
      })),
    [domainLabel, vehicleType, fuelType],
  );
}

/**
 * Khối "Nguồn năng lượng" — bản native của `VehicleEnergyFields` bên web.
 *
 * Ô hỏi ĐỔI theo loại năng lượng đang chọn: xe xăng/dầu đo bằng lít/100km; xe điện đo bằng km mỗi
 * lần sạc đầy (kèm pin và kWh/100km tuỳ chọn); hybrid khai phần xăng, phần điện để tuỳ chọn. Ma
 * trận là `vehicleEnergySpecPolicy` ở `@xeprime/types` — cùng hàm backend dùng để chuẩn hoá lúc
 * ghi và để dựng checklist lên chợ, nên form không thể nói khác server.
 */
export function VehicleEnergyFields({
  control,
  vehicleType,
  transmissionOptions,
  lockedNotice,
  disabled,
  setValue,
}: {
  control: Control<VehicleFormValues>;
  vehicleType: string;
  /** Ô hộp số nằm cùng khối vì nó cũng phụ thuộc loại xe/năng lượng. */
  transmissionOptions: ReadonlyArray<{ value: string; label: string }>;
  /** Lý do ô bị khoá (xe đang trên chợ) — nơi gọi truyền chữ. */
  lockedNotice?: string;
  disabled?: boolean;
  /**
   * Dọn ô không còn nghĩa khi đổi nguồn năng lượng. Không có nó, form giữ lại một con số vô hình
   * mà server sẽ xoá — người dùng phải thấy đúng thứ sắp được lưu.
   */
  setValue?: UseFormSetValue<VehicleFormValues>;
}) {
  const t = useTranslations('Vehicles.form.advanced');
  const tSpecs = useTranslations('Vehicles.form.specs');
  const { catalog } = useCatalog();
  const fuelType = useWatch({ control, name: 'fuelType' });
  const policy = vehicleEnergySpecPolicy(vehicleType, fuelType);

  /* Nhiên liệu hợp lệ phụ thuộc LOẠI XE — xe máy không có dầu diesel. */
  const fuelOptions = useMemo(() => {
    const allowed = vehicleFuelTypesFor(vehicleType);
    return (catalog[CATALOG_TYPE.FUEL_TYPE] ?? [])
      .filter((item) => allowed.some((value) => value === item.key))
      .map((item) => ({ value: item.key, label: item.label }));
  }, [catalog, vehicleType]);

  /*
   * Đổi sang xe điện thì lít/100km không còn nghĩa (và ngược lại). Xoá ngay tại form để người
   * dùng thấy đúng thứ sắp lưu; server vẫn dọn lại một lần nữa vì nó không tin client.
   */
  useEffect(() => {
    if (!setValue) return;
    if (policy.fuelConsumption === 'hidden') setValue('fuelConsumptionCombined', null);
    if (policy.electricRangeKm === 'hidden') setValue('electricRangeKm', null);
    if (policy.batteryCapacityKwh === 'hidden') setValue('batteryCapacityKwh', null);
    if (policy.electricConsumption === 'hidden') setValue('electricConsumptionKwhPer100Km', null);
    if (policy.engineDisplacementCc === 'hidden') setValue('engineDisplacementCc', null);
    if (policy.transmission === 'hidden') setValue('transmission', null);
  }, [
    policy.batteryCapacityKwh,
    policy.electricConsumption,
    policy.electricRangeKm,
    policy.engineDisplacementCc,
    policy.fuelConsumption,
    policy.transmission,
    setValue,
  ]);

  return (
    <YStack gap={space.md}>
      <SelectField
        control={control}
        name="fuelType"
        label={tSpecs('fuelType')}
        options={fuelOptions}
        placeholder={
          vehicleType === VEHICLE_TYPE.CAR
            ? tSpecs('fuelPlaceholderCar')
            : tSpecs('fuelPlaceholderMotorbike')
        }
        disabled={disabled}
        {...(lockedNotice ? { hint: lockedNotice } : {})}
      />

      {policy.transmission !== 'hidden' ? (
        <SelectField
          control={control}
          name="transmission"
          label={t('transmission')}
          options={transmissionOptions}
          placeholder={t('transmissionPlaceholder')}
          required={policy.transmission === 'required'}
          disabled={disabled}
          {...(lockedNotice ? { hint: lockedNotice } : {})}
        />
      ) : null}

      {policy.fuelConsumption !== 'hidden' ? (
        <NumberField
          control={control}
          name="fuelConsumptionCombined"
          label={t('consumption')}
          placeholder={t('consumptionPlaceholder')}
          hint={t('consumptionHelp')}
          required={policy.fuelConsumption === 'required'}
          min={0}
          editable={!disabled}
        />
      ) : null}

      {policy.electricRangeKm !== 'hidden' ? (
        <NumberField
          control={control}
          name="electricRangeKm"
          label={t('electricRange')}
          placeholder={t('electricRangePlaceholder')}
          hint={t('electricRangeHelp')}
          required={policy.electricRangeKm === 'required'}
          integer
          min={VEHICLE_ENERGY_LIMITS.electricRangeKm.min}
          max={VEHICLE_ENERGY_LIMITS.electricRangeKm.max}
          editable={!disabled}
        />
      ) : null}

      {policy.batteryCapacityKwh !== 'hidden' ? (
        <NumberField
          control={control}
          name="batteryCapacityKwh"
          label={t('batteryCapacity')}
          placeholder={t('batteryCapacityPlaceholder')}
          hint={t('batteryCapacityHelp')}
          min={VEHICLE_ENERGY_LIMITS.batteryCapacityKwh.min}
          max={VEHICLE_ENERGY_LIMITS.batteryCapacityKwh.max}
          editable={!disabled}
        />
      ) : null}

      {policy.electricConsumption !== 'hidden' ? (
        <NumberField
          control={control}
          name="electricConsumptionKwhPer100Km"
          label={t('electricConsumption')}
          placeholder={t('electricConsumptionPlaceholder')}
          hint={t('electricConsumptionHelp')}
          min={VEHICLE_ENERGY_LIMITS.electricConsumptionKwhPer100Km.min}
          max={VEHICLE_ENERGY_LIMITS.electricConsumptionKwhPer100Km.max}
          editable={!disabled}
        />
      ) : null}

      {policy.engineDisplacementCc !== 'hidden' ? (
        <NumberField
          control={control}
          name="engineDisplacementCc"
          label={t('engineDisplacementCc')}
          placeholder={t('enginePlaceholder')}
          suffix="cc"
          integer
          min={1}
          editable={!disabled}
        />
      ) : null}
    </YStack>
  );
}
