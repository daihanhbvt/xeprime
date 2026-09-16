import { useEffect, useMemo, type ReactNode } from 'react';
import { useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { MOTORBIKE_CATEGORY_VALUES, vehicleFieldPolicy } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { NumberField } from '@/components/ui/NumberField';
import { SelectField } from '@/components/ui/SelectField';
import { useDomainLabel } from '@/i18n/domain';
import { space } from '@/theme/tokens';

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
  setValue,
}: {
  control: Control<VehicleFormValues>;
  vehicleType: string;
  /** Ô kiểu dáng ô tô dùng thẻ có ảnh, nên nơi gọi tự dựng và truyền vào đây. */
  bodyTypePicker?: ReactNode;
  disabled?: boolean;
  /** Dọn ô không còn nghĩa khi đổi loại xe — form phải hiện đúng thứ sắp được lưu. */
  setValue?: UseFormSetValue<VehicleFormValues>;
}) {
  const t = useTranslations('Vehicles.form.specs');
  const domainLabel = useDomainLabel();
  const fuelType = useWatch({ control, name: 'fuelType' });
  const policy = vehicleFieldPolicy(vehicleType, fuelType);

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
      {policy.seatCount !== 'hidden' ? (
        <NumberField
          control={control}
          name="seatCount"
          integer
          label={t('seatCount')}
          placeholder={t('seatPlaceholder')}
          min={1}
          max={64}
          editable={!disabled}
        />
      ) : null}

      {policy.motorbikeCategory !== 'hidden' ? (
        <SelectField
          control={control}
          name="motorbikeCategory"
          label={t('motorbikeCategory')}
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
