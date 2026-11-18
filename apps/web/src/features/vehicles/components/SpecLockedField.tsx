'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import type { SpecLock } from '../hooks/use-catalog-spec-lock';
import { LockedValueField } from './LockedValueField';

/**
 * Ô thông số đang khoá theo dữ liệu mẫu xe (ADR 0102) — CÙNG hình dạng với ô cà vẹt máy đã đọc:
 * chỉ đọc, bút trong ô. Bấm bút ⇒ nơi gọi vẽ lại ô nhập thật của trường đó.
 */
export function SpecLockedField({
  name,
  label,
  value,
  lock,
  help,
  required,
}: {
  /** Tên trường — làm id của ô. */
  name: string;
  label: string;
  /** Giá trị đã định dạng để đọc ("5 chỗ", "Điện", "1496"). */
  value: string;
  lock: SpecLock;
  help?: ReactNode;
  required?: boolean;
}) {
  const t = useTranslations('Vehicles.form.catalog');
  return (
    <LockedValueField
      id={`vehicle-${name}-locked`}
      label={label}
      fieldLabel={label}
      value={value}
      help={help}
      required={required}
      editLabel={t('unlockSpecAria', { field: label })}
      onUnlock={lock.unlock}
    />
  );
}
