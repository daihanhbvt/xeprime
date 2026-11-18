'use client';

import { Col, Form, Input, Row } from 'antd';
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
import { useCatalogSpecLock, type SpecLock } from '../hooks/use-catalog-spec-lock';
import { SpecLockedField } from './SpecLockedField';

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
  /**
   * Wizard THÊM XE (Figma `24352:79234`): ô hộp số, quãng đường mỗi lần sạc, mức tiêu thụ điện
   * luôn hiện - khi không áp dụng thì khoá kèm lý do, thay vì ẩn. Màn sửa xe giữ cách ẩn.
   */
  showInapplicable?: boolean;
  /** Dấu * ở Nhiên liệu - điều kiện lên chợ (wizard thêm xe). Mặc định theo `showInapplicable`. */
  fuelRequired?: boolean;
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
  showInapplicable = false,
  fuelRequired = showInapplicable,
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
  // Khoá theo xe chuẩn đang chọn (hoặc theo dòng một cấu hình); bút trong ô mở lại (ADR 0102).
  const tCatalog = useTranslations('Vehicles.form.catalog');
  const fuelLock = useCatalogSpecLock(control, vehicleType, 'fuelType', {
    modelLocked: fuelLocked,
  });
  const gearLock = useCatalogSpecLock(control, vehicleType, 'transmission', {
    modelLocked: gearLocked,
  });
  const consumptionLock = useCatalogSpecLock(control, vehicleType, 'fuelConsumptionCombined');
  const rangeLock = useCatalogSpecLock(control, vehicleType, 'electricRangeKm');
  const batteryLock = useCatalogSpecLock(control, vehicleType, 'batteryCapacityKwh');
  const engineLock = useCatalogSpecLock(control, vehicleType, 'engineDisplacementCc');
  /** Câu dưới ô đang khoá: theo dữ liệu mẫu xe, hay theo dòng xe một cấu hình. */
  const lockHelp = (lock: SpecLock): string | undefined =>
    lock.fromData
      ? tCatalog('specLocked')
      : lock.locked && spec.model
        ? tSpecs('specFromModel', { model: spec.model.label })
        : undefined;
  /**
   * Ô đang khoá ⇒ ô chỉ đọc có bút trong ô (cùng kiểu ô cà vẹt); `null` ⇒ nơi gọi vẽ ô nhập thật.
   * Ô bị khoá vì lý do KHÁC (`disabled`: xe đã lên chợ) giữ ô gốc — bút không hứa một lần sửa.
   */
  const lockedView = (
    lock: SpecLock,
    name: string,
    label: string,
    display: string | null,
    required?: boolean,
  ) =>
    lock.locked && !disabled && display ? (
      <SpecLockedField
        name={name}
        label={label}
        value={display}
        lock={lock}
        help={lockHelp(lock)}
        required={required}
      />
    ) : null;
  const numberText = (value: number | null | undefined) => (value == null ? null : String(value));
  const consumption = useWatch({ control, name: 'fuelConsumptionCombined' });
  const range = useWatch({ control, name: 'electricRangeKm' });
  const battery = useWatch({ control, name: 'batteryCapacityKwh' });
  const engine = useWatch({ control, name: 'engineDisplacementCc' });

  let fuelHelp: React.ReactNode = lockedNotice ?? lockHelp(fuelLock);
  if (!fuelHelp && spec.model && fuelChoices) {
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
        {lockedView(
          fuelLock,
          'fuelType',
          tSpecs('fuelType'),
          fuelType ? domainLabel('fuelType', fuelType) : null,
          fuelRequired,
        ) ?? (
          <FuelTypeSelect
            control={control}
            vehicleType={vehicleType}
            help={fuelHelp}
            disabled={disabled}
            allowedValues={fuelChoices}
            required={fuelRequired}
          />
        )}
      </Col>

      {showInapplicable && policy.transmission === 'hidden' ? (
        <InapplicableField label={t('transmission')} reason={t('pickFuelFirst')} />
      ) : null}
      {policy.transmission !== 'hidden' ? (
        <Col xs={24} sm={12}>
          {(!fixedTransmission &&
            lockedView(
              gearLock,
              'transmission',
              t('transmission'),
              transmissionOptions.find((o) => o.value === transmission)?.label ?? null,
              policy.transmission === 'required',
            )) || (
            <SelectField
              control={control}
              name="transmission"
              label={t('transmission')}
              options={gearOptions}
              placeholder={t('transmissionPlaceholder')}
              required={policy.transmission === 'required'}
              help={lockedNotice ?? (fixedTransmission ? t('transmissionElectricHelp') : undefined)}
              disabled={disabled || Boolean(fixedTransmission)}
              allowClear={!fixedTransmission}
            />
          )}
        </Col>
      ) : null}

      {policy.fuelConsumption !== 'hidden' ? (
        <Col xs={24} sm={12}>
          {lockedView(
            consumptionLock,
            'fuelConsumptionCombined',
            t('consumption'),
            numberText(consumption),
            policy.fuelConsumption === 'required',
          ) ?? (
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
          )}
        </Col>
      ) : null}

      {showInapplicable && policy.electricRangeKm === 'hidden' ? (
        <InapplicableField label={t('electricRange')} reason={t('electricOnly')} />
      ) : null}
      {policy.electricRangeKm !== 'hidden' ? (
        <Col xs={24} sm={12}>
          {lockedView(
            rangeLock,
            'electricRangeKm',
            t('electricRange'),
            numberText(range),
            policy.electricRangeKm === 'required',
          ) ?? (
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
          )}
        </Col>
      ) : null}

      {policy.batteryCapacityKwh !== 'hidden' ? (
        <Col xs={24} sm={12}>
          {lockedView(
            batteryLock,
            'batteryCapacityKwh',
            t('batteryCapacity'),
            numberText(battery),
            false,
          ) ?? (
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
          )}
        </Col>
      ) : null}

      {showInapplicable && policy.electricConsumption === 'hidden' ? (
        <InapplicableField label={t('electricConsumption')} reason={t('electricOnly')} />
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
          {lockedView(
            engineLock,
            'engineDisplacementCc',
            t('engineDisplacementCc'),
            numberText(engine),
            policy.engineDisplacementCc === 'required',
          ) ?? (
            <NumberField
              control={control}
              name="engineDisplacementCc"
              label={t('engineDisplacementCc')}
              placeholder={t('enginePlaceholder')}
              required={policy.engineDisplacementCc === 'required'}
              min={1}
              disabled={disabled}
            />
          )}
        </Col>
      ) : null}
    </Row>
  );
}

/** Ô không áp dụng cho nguồn năng lượng đang chọn - hiện khoá kèm lý do (wizard thêm xe). */
function InapplicableField({ label, reason }: { label: string; reason: string }) {
  return (
    <Col xs={24} sm={12}>
      <Form.Item label={label}>
        <Input disabled placeholder={reason} aria-label={label} />
      </Form.Item>
    </Col>
  );
}
