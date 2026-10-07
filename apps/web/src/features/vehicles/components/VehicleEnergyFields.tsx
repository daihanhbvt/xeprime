'use client';

import { Col, Row } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useFormState, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import {
  VEHICLE_ENERGY_LIMITS,
  fixedTransmissionFor,
  normalizeTransmissionFor,
  vehicleEnergySpecPolicy,
} from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';

import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { useDomainLabel } from '@/i18n/use-domain-label';

import { useCatalogModelSpec } from '../hooks/use-catalog-model-spec';

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
   * Dọn ô không còn nghĩa khi đổi nguồn năng lượng. BẮT BUỘC: thiếu nó thì xe điện bị khoá ô hộp
   * số mà vẫn giữ "số tự động" — không lưu được, không sửa được (lỗi 06/10/2026 ở màn sửa xe).
   */
  setValue: UseFormSetValue<VehicleFormValues>;
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
  const transmission = useWatch({ control, name: 'transmission' });
  const policy = vehicleEnergySpecPolicy(vehicleType, fuelType);
  const tSpecs = useTranslations('Vehicles.form.specs');
  const domainLabel = useDomainLabel();
  // Nguồn năng lượng theo MẪU XE (`catalogSpecRule`). Khoá CHỈ khi giá trị đã khớp mẫu — xe cũ lưu
  // lệch (VF 5 ghi "Xăng") vẫn phải sửa lại được.
  const spec = useCatalogModelSpec(control, vehicleType);
  const fuelLocked =
    Boolean(spec.model) && spec.fuel.kind === 'fixed' && fuelType === spec.fuel.value;
  const fuelChoices = spec.model && spec.fuel.kind === 'choice' ? spec.fuel.values : undefined;
  // Hộp số của mẫu ỨNG VỚI nguồn năng lượng đang chọn. Xe điện đã có đáp án cố định của riêng nó
  // (`fixedTransmissionFor`) — luật mẫu xe chỉ thu hẹp thêm, không bao giờ mở rộng.
  const gearRule = spec.transmissionFor(fuelType);
  const fixedGear = gearRule.kind === 'fixed' ? gearRule.value : null;
  const gearLocked = fixedGear !== null && transmission === fixedGear;
  const gearOptions =
    gearRule.kind === 'choice'
      ? transmissionOptions.filter(
          (o) => gearRule.values.includes(o.value) || o.value === transmission,
        )
      : transmissionOptions;
  let fuelHelp: React.ReactNode = lockedNotice;
  if (!fuelHelp && spec.model && fuelLocked) {
    fuelHelp = tSpecs('specFromModel', { model: spec.model.label });
  } else if (!fuelHelp && spec.model && fuelChoices) {
    fuelHelp = tSpecs('specChoiceFromModel', {
      model: spec.model.label,
      values: fuelChoices.map((v) => domainLabel('fuelType', v)).join(', '),
    });
  }
  // Xe điện chỉ có MỘT đáp án (1 cấp) — ô khoá và điền sẵn, không ai phải chọn.
  const fixedTransmission = fixedTransmissionFor(vehicleType, fuelType);

  /*
   * Hộp số đi theo nguồn năng lượng: Xăng → Điện thì "Số tự động" cũ phải thành "1 cấp", Điện →
   * Xăng thì "1 cấp" không còn nghĩa và phải để trống cho người dùng chọn lại. Giữ giá trị cũ là
   * đúng cái lỗi "xe điện số tự động" — form hiện một lựa chọn không có trong danh sách rồi tự
   * chặn lúc lưu. Cũng chạy với xe cũ đã lưu sai, ngay khi form mở.
   */
  const transmissionError = useFormState({ control, name: 'transmission' }).errors.transmission;
  useEffect(() => {
    if (!fuelType) return;
    const next = normalizeTransmissionFor(vehicleType, fuelType, transmission);
    if (next === (transmission ?? null)) return;
    // Đang treo câu lỗi "hộp số không phù hợp" từ lần lưu trước thì kiểm lại ngay để gỡ nó;
    // còn không thì đừng — về trống mà báo "bắt buộc" ngay lập tức là quá gắt.
    setValue('transmission', next, { shouldValidate: Boolean(transmissionError) || next !== null });
  }, [fuelType, setValue, transmission, transmissionError, vehicleType]);

  /*
   * Mẫu xe chỉ có MỘT hộp số cho nguồn năng lượng này (Raize xăng ⇒ CVT) mà ô đang trống — điền
   * vào. Chỉ điền ô TRỐNG: giá trị đã lưu (kể cả lệch mẫu) là của chủ xe, và ô vẫn mở để sửa.
   */
  useEffect(() => {
    if (!fixedGear || transmission) return;
    setValue('transmission', fixedGear as VehicleFormValues['transmission'], { shouldDirty: true });
  }, [fixedGear, setValue, transmission]);

  /*
   * Đổi sang xe điện thì lít/100km không còn nghĩa (và ngược lại). Xoá ngay tại form để người
   * dùng thấy đúng thứ sắp lưu; server vẫn dọn lại một lần nữa vì nó không tin client.
   */
  useEffect(() => {
    // Chưa chọn nguồn năng lượng thì ma trận ẩn MỌI thông số vì CHƯA BIẾT, không phải vì không áp
    // dụng — xoá lúc đó là xoá chính con số người dùng vừa gõ (cùng luật `clearFieldsNotInProfile`).
    if (!fuelType) return;
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
    fuelType,
    setValue,
  ]);

  return (
    <Row gutter={16}>
      <Col xs={24} sm={12}>
        <FuelTypeSelect
          control={control}
          vehicleType={vehicleType}
          help={fuelHelp}
          disabled={disabled || fuelLocked}
          allowedValues={fuelChoices}
        />
      </Col>

      {policy.transmission !== 'hidden' ? (
        <Col xs={24} sm={12}>
          <SelectField
            control={control}
            name="transmission"
            label={t('transmission')}
            options={gearOptions}
            placeholder={t('transmissionPlaceholder')}
            required={policy.transmission === 'required'}
            help={
              lockedNotice ??
              (fixedTransmission
                ? t('transmissionElectricHelp')
                : gearLocked && spec.model
                  ? tSpecs('specFromModel', { model: spec.model.label })
                  : undefined)
            }
            disabled={disabled || Boolean(fixedTransmission) || gearLocked}
            allowClear={!fixedTransmission && !gearLocked}
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
            required={policy.engineDisplacementCc === 'required'}
            min={1}
            disabled={disabled}
          />
        </Col>
      ) : null}
    </Row>
  );
}
