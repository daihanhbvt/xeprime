import type { ComponentProps } from 'react';
import type { VehicleRegistrationReading } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import type { Control } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { LockedValueField } from '@/components/ui/LockedValueField';
import { TextField } from '@/components/ui/TextField';
import { useRegistrationFieldLock, type RegistrationFilledField } from '../hooks/use-vehicle-data';

/**
 * Ô biển số / màu sơn của form THÊM xe (ADR 0102 điều 6) - bản native của web `RegistrationTextField`:
 * khoá theo giá trị máy đọc trên cà vẹt (chỉ đọc + bút), bút mở riêng ô đó. Ô chưa khớp lượt đọc nào
 * thì là ô nhập thường.
 */
export function RegistrationTextField({
  control,
  name,
  reading,
  disabled = false,
  ...fieldProps
}: {
  control: Control<VehicleFormValues>;
  name: RegistrationFilledField;
  reading: VehicleRegistrationReading | null | undefined;
  /** Ô bị khoá vì lý do KHÁC (xe đã lên chợ) - không hứa một lần mở khoá. */
  disabled?: boolean;
} & Omit<ComponentProps<typeof TextField<VehicleFormValues>>, 'control' | 'name'>) {
  const t = useTranslations('Vehicles.form.registration');
  const tCatalog = useTranslations('Vehicles.form.catalog');
  const lock = useRegistrationFieldLock(control, name, reading);
  if (lock.locked && !disabled) {
    return (
      <LockedValueField
        label={fieldProps.label}
        value={lock.value}
        required={fieldProps.required ?? false}
        hint={t('filledFromScan')}
        lock={{
          locked: true,
          editLabel: tCatalog('unlockSpecAria', { field: fieldProps.label }),
          onUnlock: lock.unlock,
        }}
      />
    );
  }
  return <TextField control={control} name={name} {...fieldProps} />;
}
