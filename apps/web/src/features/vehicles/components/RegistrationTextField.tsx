'use client';

import type { VehicleRegistrationReading } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { useTranslations } from 'next-intl';
import { useRegistrationBusy } from '../registration-busy';
import type { ReactNode } from 'react';
import type { Control } from 'react-hook-form';

import { TextField } from '@/components/form/TextField';

import {
  useRegistrationFieldLock,
  type RegistrationFilledField,
} from '../hooks/use-registration-autofill';

/**
 * Ô biển số / màu sắc nhận giá trị đọc từ cà vẹt (ADR 0102): đang mang đúng giá trị máy đọc ⇒ ô chỉ
 * đọc + bút trong ô (cùng kiểu ô số khung / số máy); bấm bút hoặc chưa có lượt đọc ⇒ ô nhập thường.
 */
export function RegistrationTextField({
  control,
  name,
  reading,
  label,
  fieldLabel,
  placeholder,
  help,
  required,
  disabled,
}: {
  control: Control<VehicleFormValues>;
  name: RegistrationFilledField;
  /** Lượt đọc cà vẹt hiện có — `null`/không truyền (màn sửa xe) ⇒ không bao giờ khoá. */
  reading?: VehicleRegistrationReading | null;
  label: ReactNode;
  /** Tên ô dạng chữ — cho nhãn khả truy cập của ô khoá và nút bút. */
  fieldLabel: string;
  placeholder?: string;
  help?: ReactNode;
  required?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations('Vehicles.form.registration');
  const lock = useRegistrationFieldLock(control, name, reading);
  // Máy đang đọc cà vẹt ⇒ ô này sắp được điền: khoá + nói đang đọc.
  const busy = useRegistrationBusy();

  // Khoá là trạng thái của CHÍNH ô nhập (chỉ đọc + bút trong ô) - máy đọc xong không dựng lại ô.
  const locked = lock.locked && !disabled && !busy;
  return (
    <TextField
      control={control}
      name={name}
      label={label}
      placeholder={busy ? t('reading') : placeholder}
      help={locked ? t('filledFromScan') : help}
      required={required}
      disabled={disabled || busy}
      lock={{
        locked,
        editLabel: t('editField', { field: fieldLabel }),
        onUnlock: lock.unlock,
      }}
    />
  );
}
