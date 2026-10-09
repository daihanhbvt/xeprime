import { useEffect, useMemo, type ReactNode } from 'react';
import { useController, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { MOTORBIKE_CATEGORY_VALUES, vehicleFieldPolicy } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { Chip } from '@/components/ui/Chip';
import { FieldLabel, FieldMessage } from '@/components/ui/Field';
import { NumberField } from '@/components/ui/NumberField';
import { SelectField } from '@/components/ui/SelectField';
import { useDomainLabel } from '@/i18n/domain';
import { space } from '@/theme/tokens';
import { useCatalogModelSpec } from '../hooks/use-catalog-model-spec';

/**
 * Ô PHÂN LOẠI xe — bản native của `VehicleClassificationFields` bên web.
 *
 * Ô tô có số chỗ ngồi và kiểu dáng thân xe; xe máy không có cả hai mà có PHÂN KHÚC (tay ga / xe
 * số / côn tay…). Hai chiều này đối xứng và loại trừ nhau — chúng là thứ khách dùng để lọc ngoài
 * chợ, nên chọn sai đồng nghĩa với "không ai tìm thấy chiếc xe".
 *
 * Ma trận quyết định là `vehicleFieldPolicy` ở `@xeprime/types` — cùng hàm mà Yup, DTO backend và
 * checklist lên chợ dùng, không phải một cờ `isCar` rải rác trong JSX.
 */
export function VehicleClassificationFields({
  control,
  vehicleType,
  bodyTypePicker,
  disabled,
  required = false,
  setValue,
}: {
  control: Control<VehicleFormValues>;
  vehicleType: string;
  /** Ô kiểu dáng ô tô dùng thẻ có ảnh, nên nơi gọi tự dựng và truyền vào đây. */
  bodyTypePicker?: ReactNode;
  disabled?: boolean;
  /** Đánh dấu bắt buộc theo `vehicleFieldPolicy` (wizard thêm xe). Luật thật ở schema. */
  required?: boolean;
  /** Dọn ô không còn nghĩa khi đổi loại xe — form phải hiện đúng thứ sắp được lưu. */
  setValue?: UseFormSetValue<VehicleFormValues>;
}) {
  const t = useTranslations('Vehicles.form.specs');
  const domainLabel = useDomainLabel();
  const fuelType = useWatch({ control, name: 'fuelType' });
  const policy = vehicleFieldPolicy(vehicleType, fuelType);
  const tCommon = useTranslations('Common');
  const spec = useCatalogModelSpec(control, vehicleType);
  const seatRequired = required && policy.seatCount === 'required';
  const seatCount = useWatch({ control, name: 'seatCount' });
  // Khoá CHỈ khi giá trị đã khớp mẫu: xe cũ lưu lệch (VF 5 mà ghi 4 chỗ) vẫn phải sửa lại được.
  const seatLocked =
    Boolean(spec.model) && spec.seats.kind === 'fixed' && seatCount === spec.seats.value;

  const categoryOptions = useMemo(
    () =>
      MOTORBIKE_CATEGORY_VALUES.map((value) => ({
        value,
        label: domainLabel('motorbikeCategory', value),
      })),
    [domainLabel],
  );

  /*
   * Đổi ô tô ↔ xe máy thì hai chiều này loại trừ nhau. Xoá tại form để người dùng thấy đúng thứ
   * sắp lưu; server vẫn dọn thêm một lần vì nó không tin client.
   */
  useEffect(() => {
    if (!setValue) return;
    if (policy.seatCount === 'hidden') setValue('seatCount', null);
    if (policy.bodyType === 'hidden') setValue('bodyType', null);
    if (policy.motorbikeCategory === 'hidden') setValue('motorbikeCategory', null);
  }, [policy.seatCount, policy.bodyType, policy.motorbikeCategory, setValue]);

  return (
    <YStack gap={space.md}>
      {/*
        Số chỗ theo MẪU XE (`catalogSpecRule`): một cấu hình ⇒ điền sẵn và khoá; nhiều cấu hình ⇒
        chỉ chọn trong đó; mẫu chưa khai ⇒ nhập tự do.
      */}
      {policy.seatCount !== 'hidden' ? (
        spec.model && spec.seats.kind === 'choice' ? (
          <SeatChoiceField
            control={control}
            label={t('seatCount')}
            required={seatRequired}
            values={spec.seats.values}
            disabled={disabled}
            hint={t('specChoiceFromModel', {
              model: spec.model.label,
              values: spec.seats.values.map((count) => tCommon('units.seat', { count })).join(', '),
            })}
          />
        ) : (
          <NumberField
            control={control}
            name="seatCount"
            integer
            label={t('seatCount')}
            required={seatRequired}
            placeholder={t('seatPlaceholder')}
            min={1}
            max={64}
            editable={!disabled && !seatLocked}
            {...(seatLocked && spec.model
              ? { hint: t('specFromModel', { model: spec.model.label }) }
              : {})}
          />
        )
      ) : null}

      {policy.motorbikeCategory !== 'hidden' ? (
        <SelectField
          control={control}
          name="motorbikeCategory"
          label={t('motorbikeCategory')}
          required={required && policy.motorbikeCategory === 'required'}
          options={categoryOptions}
          placeholder={t('motorbikeCategoryPlaceholder')}
          hint={t('motorbikeCategoryHelp')}
          disabled={disabled}
        />
      ) : null}

      {policy.bodyType !== 'hidden' && bodyTypePicker ? bodyTypePicker : null}
    </YStack>
  );
}

/**
 * Số chỗ khi mẫu xe có NHIỀU cấu hình (VF 9: 6 hoặc 7 chỗ) — hàng viên chọn thay cho ô nhập số,
 * bản native của `SeatChoiceField` bên web. Giá trị ĐANG LƯU nằm ngoài các bản của mẫu vẫn hiện
 * thành một viên đã chọn: ô chọn không được giấu đúng con số nó sắp gửi đi. Hàng tự xuống dòng
 * nên màn hẹp không tràn ngang.
 */
function SeatChoiceField({
  control,
  label,
  values,
  required,
  disabled,
  hint,
}: {
  control: Control<VehicleFormValues>;
  label: string;
  values: readonly number[];
  required?: boolean;
  disabled?: boolean | undefined;
  hint?: string;
}) {
  const tCommon = useTranslations('Common');
  const { field, fieldState } = useController({ control, name: 'seatCount' });
  const current = typeof field.value === 'number' ? field.value : null;
  const shown = current != null && !values.includes(current) ? [...values, current] : values;

  return (
    <YStack gap={space.xs}>
      <FieldLabel label={label} required={Boolean(required)} />
      <XStack flexWrap="wrap" gap={space.sm}>
        {shown.map((count) => (
          <Chip
            key={count}
            label={tCommon('units.seat', { count })}
            selected={current === count}
            {...(disabled ? {} : { onPress: () => field.onChange(count) })}
          />
        ))}
      </XStack>
      <FieldMessage error={fieldState.error?.message} hint={hint} />
    </YStack>
  );
}
