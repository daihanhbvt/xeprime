import { useEffect, useMemo } from 'react';
import { useFormState, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  CATALOG_TYPE,
  VEHICLE_ENERGY_LIMITS,
  VEHICLE_TYPE,
  fixedTransmissionFor,
  normalizeTransmissionFor,
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
import { useCatalogModelSpec } from '../hooks/use-catalog-model-spec';

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
 *
 * Hộp số đi theo nguồn năng lượng (`normalizeTransmissionFor`) và theo MẪU XE đang chọn
 * (`useCatalogModelSpec`): một bản ⇒ điền và khoá, nhiều bản ⇒ chỉ chọn trong đó.
 */
export function VehicleEnergyFields({
  control,
  vehicleType,
  transmissionOptions,
  lockedNotice,
  disabled,
  fuelTypeRequired = false,
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
   * Nhiên liệu là điều kiện lên chợ (`ENERGY_SPEC`) và hai luồng TẠO xe chặn khi trống — nơi gọi
   * bật (*) ở đó. Form SỬA không chặn nên không truyền.
   */
  fuelTypeRequired?: boolean;
  /**
   * BẮT BUỘC: dọn ô không còn nghĩa và chuẩn hoá hộp số khi đổi nguồn năng lượng. Thiếu nó thì
   * form giữ "xe điện số tự động" — giá trị server từ chối (`VEHICLE_TRANSMISSION_INCOMPATIBLE`).
   */
  setValue: UseFormSetValue<VehicleFormValues>;
}) {
  const t = useTranslations('Vehicles.form.advanced');
  const tSpecs = useTranslations('Vehicles.form.specs');
  const domainLabel = useDomainLabel();
  const { catalog } = useCatalog();
  const fuelType = useWatch({ control, name: 'fuelType' });
  const transmission = useWatch({ control, name: 'transmission' });
  const policy = vehicleEnergySpecPolicy(vehicleType, fuelType);

  // Nguồn năng lượng theo MẪU XE (`catalogSpecRule`). Khoá CHỈ khi giá trị đã khớp mẫu — xe cũ lưu
  // lệch (VF 5 ghi "Xăng") vẫn phải sửa lại được.
  const spec = useCatalogModelSpec(control, vehicleType);
  const fuelLocked =
    Boolean(spec.model) && spec.fuel.kind === 'fixed' && fuelType === spec.fuel.value;
  const fuelChoices = spec.model && spec.fuel.kind === 'choice' ? spec.fuel.values : undefined;
  // Hộp số của mẫu ỨNG VỚI nguồn năng lượng đang chọn; luật mẫu chỉ thu hẹp, không mở rộng.
  const gearRule = spec.transmissionFor(fuelType);
  const fixedGear = gearRule.kind === 'fixed' ? gearRule.value : null;
  const gearLocked = fixedGear !== null && transmission === fixedGear;
  const gearOptions =
    gearRule.kind === 'choice'
      ? transmissionOptions.filter(
          (o) => gearRule.values.includes(o.value) || o.value === transmission,
        )
      : transmissionOptions;

  let fuelHint: string | undefined = lockedNotice;
  if (!fuelHint && spec.model && fuelLocked) {
    fuelHint = tSpecs('specFromModel', { model: spec.model.label });
  } else if (!fuelHint && spec.model && fuelChoices) {
    fuelHint = tSpecs('specChoiceFromModel', {
      model: spec.model.label,
      values: fuelChoices.map((v) => domainLabel('fuelType', v)).join(', '),
    });
  }
  // Xe điện chỉ có MỘT đáp án (1 cấp) — ô khoá và điền sẵn, không ai phải chọn.
  const fixedTransmission = fixedTransmissionFor(vehicleType, fuelType);
  const transmissionHint =
    lockedNotice ??
    (fixedTransmission
      ? t('transmissionElectricHelp')
      : gearLocked && spec.model
        ? tSpecs('specFromModel', { model: spec.model.label })
        : undefined);

  /* Nhiên liệu hợp lệ phụ thuộc LOẠI XE (xe máy không có dầu) và MẪU XE (nhiều bản ⇒ chỉ các bản đó). */
  const fuelOptions = useMemo(() => {
    const allowed = vehicleFuelTypesFor(vehicleType);
    return (catalog[CATALOG_TYPE.FUEL_TYPE] ?? [])
      .filter((item) => allowed.some((value) => value === item.key))
      // Không giấu giá trị ĐANG LƯU dù nó nằm ngoài các bản của mẫu — ô không được giấu thứ nó gửi.
      .filter((item) => !fuelChoices || fuelChoices.includes(item.key) || item.key === fuelType)
      .map((item) => ({ value: item.key, label: item.label }));
  }, [catalog, vehicleType, fuelChoices, fuelType]);

  /*
   * Hộp số đi theo nguồn năng lượng: Xăng → Điện thì "Số tự động" phải thành "1 cấp", Điện → Xăng
   * thì "1 cấp" hết nghĩa và để trống cho người dùng chọn lại. Chạy cả với xe cũ đã lưu sai, ngay
   * khi form mở — giữ giá trị cũ là đúng lỗi server từ chối.
   */
  const transmissionError = useFormState({ control, name: 'transmission' }).errors.transmission;
  useEffect(() => {
    if (!fuelType) return;
    const next = normalizeTransmissionFor(vehicleType, fuelType, transmission);
    if (next === (transmission ?? null)) return;
    // Đang treo lỗi từ lần lưu trước thì kiểm lại để gỡ; về trống thì đừng báo "bắt buộc" ngay.
    setValue('transmission', next, { shouldValidate: Boolean(transmissionError) || next !== null });
  }, [fuelType, setValue, transmission, transmissionError, vehicleType]);

  /* Mẫu xe chỉ có MỘT hộp số cho nguồn năng lượng này mà ô đang trống — điền vào (chỉ ô TRỐNG). */
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
    // dụng — xoá lúc đó là xoá chính con số người dùng vừa gõ.
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
        disabled={disabled || fuelLocked}
        required={fuelTypeRequired}
        {...(fuelHint ? { hint: fuelHint } : {})}
      />

      {policy.transmission !== 'hidden' ? (
        <SelectField
          control={control}
          name="transmission"
          label={t('transmission')}
          options={gearOptions}
          placeholder={t('transmissionPlaceholder')}
          required={policy.transmission === 'required'}
          disabled={disabled || Boolean(fixedTransmission) || gearLocked}
          allowClear={!fixedTransmission && !gearLocked}
          {...(transmissionHint ? { hint: transmissionHint } : {})}
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
          required={policy.engineDisplacementCc === 'required'}
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
