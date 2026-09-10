'use client';

import { Col, Row } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { VEHICLE_ENERGY_LIMITS, vehicleEnergySpecPolicy } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';

import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';

import { FuelTypeSelect } from './VehicleFormSections';

interface VehicleEnergyFieldsProps {
  control: Control<VehicleFormValues>;
  vehicleType: string;
  /** Ô hộp số nằm cùng khối vì nó cũng phụ thuộc loại xe/năng lượng. */
  transmissionOptions: ReadonlyArray<{ value: string; label: string }>;
  /** Lý do ô bị khoá (xe đang trên chợ) — nơi gọi truyền chữ. */
  lockedNotice?: React.ReactNode;
  disabled?: boolean;
  /**
   * Dọn ô không còn nghĩa khi đổi nguồn năng lượng. Truyền `setValue` để form không giữ lại một
   * con số vô hình mà server sẽ xoá — người dùng phải thấy đúng thứ sắp được lưu.
   */
  setValue?: UseFormSetValue<VehicleFormValues>;
}

/**
 * Khối "Nguồn năng lượng" — ô hỏi ĐỔI theo loại năng lượng đang chọn (09/09/2026).
 *
 * Xe xăng/dầu đo bằng lít/100km; xe điện đo bằng km mỗi lần sạc đầy (kèm pin và kWh/100km tuỳ
 * chọn); hybrid khai phần xăng, phần điện để tuỳ chọn vì enum chưa tách HEV với PHEV. Ma trận
 * này là `vehicleEnergySpecPolicy` ở `@xeprime/types` — cùng hàm mà backend dùng để chuẩn hoá
 * lúc ghi và để dựng checklist lên chợ, nên form không thể nói khác server.
 *
 * Dùng chung cho wizard đăng xe nhanh, wizard `/manage` và màn sửa xe: một chỗ sửa, ba màn đúng.
 */
export function VehicleEnergyFields({
  control,
  vehicleType,
  transmissionOptions,
  lockedNotice,
  disabled,
  setValue,
}: VehicleEnergyFieldsProps) {
  const t = useTranslations('Vehicles.form.advanced');
  const fuelType = useWatch({ control, name: 'fuelType' });
  const policy = vehicleEnergySpecPolicy(vehicleType, fuelType);

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
    <Row gutter={16}>
      <Col xs={24} sm={12}>
        <FuelTypeSelect
          control={control}
          vehicleType={vehicleType}
          help={lockedNotice}
          disabled={disabled}
        />
      </Col>

      {policy.transmission !== 'hidden' ? (
        <Col xs={24} sm={12}>
          <SelectField
            control={control}
            name="transmission"
            label={t('transmission')}
            options={transmissionOptions}
            placeholder={t('transmissionPlaceholder')}
            required={policy.transmission === 'required'}
            help={lockedNotice}
            disabled={disabled}
            allowClear
          />
        </Col>
      ) : null}

      {policy.fuelConsumption !== 'hidden' ? (
        <Col xs={24} sm={12}>
          <NumberField
            control={control}
            name="fuelConsumptionCombined"
            label={t('consumption')}
            placeholder={t('consumptionPlaceholder')}
            help={t('consumptionHelp')}
            required={policy.fuelConsumption === 'required'}
            min={0}
            disabled={disabled}
          />
        </Col>
      ) : null}

      {policy.electricRangeKm !== 'hidden' ? (
        <Col xs={24} sm={12}>
          <NumberField
            control={control}
            name="electricRangeKm"
            label={t('electricRange')}
            placeholder={t('electricRangePlaceholder')}
            help={t('electricRangeHelp')}
            required={policy.electricRangeKm === 'required'}
            min={VEHICLE_ENERGY_LIMITS.electricRangeKm.min}
            max={VEHICLE_ENERGY_LIMITS.electricRangeKm.max}
            disabled={disabled}
          />
        </Col>
      ) : null}

      {policy.batteryCapacityKwh !== 'hidden' ? (
        <Col xs={24} sm={12}>
          <NumberField
            control={control}
            name="batteryCapacityKwh"
            label={t('batteryCapacity')}
            placeholder={t('batteryCapacityPlaceholder')}
            help={t('batteryCapacityHelp')}
            min={VEHICLE_ENERGY_LIMITS.batteryCapacityKwh.min}
            max={VEHICLE_ENERGY_LIMITS.batteryCapacityKwh.max}
            disabled={disabled}
          />
        </Col>
      ) : null}

      {policy.electricConsumption !== 'hidden' ? (
        <Col xs={24} sm={12}>
          <NumberField
            control={control}
            name="electricConsumptionKwhPer100Km"
            label={t('electricConsumption')}
            placeholder={t('electricConsumptionPlaceholder')}
            help={t('electricConsumptionHelp')}
            min={VEHICLE_ENERGY_LIMITS.electricConsumptionKwhPer100Km.min}
            max={VEHICLE_ENERGY_LIMITS.electricConsumptionKwhPer100Km.max}
            disabled={disabled}
          />
        </Col>
      ) : null}

      {policy.engineDisplacementCc !== 'hidden' ? (
        <Col xs={24} sm={12}>
          <NumberField
            control={control}
            name="engineDisplacementCc"
            label={t('engineDisplacementCc')}
            placeholder={t('enginePlaceholder')}
            min={1}
            disabled={disabled}
          />
        </Col>
      ) : null}
    </Row>
  );
}
