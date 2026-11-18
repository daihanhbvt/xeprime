'use client';

import { Form, Input } from 'antd';
import type { ReactNode } from 'react';

import { FieldLockButton, LOCKED_FIELD_CLASS } from '@/components/form/field-lock';
import { useHelpAsTip } from '@/components/form/help-as-tip';

/**
 * Ô ĐANG KHOÁ thay chỗ một ô KHÔNG có trạng thái chỉ đọc (lưới thẻ ảnh kiểu dáng ở màn sửa xe):
 * chỉ đọc, giá trị đã định dạng, bút trong ô để mở.
 *
 * Ô nhập thường (chữ, số, ô chọn) KHÔNG dùng component này — chúng khoá tại chỗ qua prop `lock`
 * (`components/form/field-lock.tsx`), để đổi khoá ↔ mở không gỡ rồi dựng lại ô (18/11/2026).
 */
export function LockedValueField({
  id,
  label,
  fieldLabel,
  value,
  help,
  required,
  editLabel,
  onUnlock,
}: {
  id: string;
  label: ReactNode;
  /** Tên ô dạng chữ — đọc lên ở nhãn khả truy cập của ô. */
  fieldLabel: string;
  value: string;
  help?: ReactNode;
  required?: boolean;
  /** Nhãn khả truy cập của nút bút, đã dịch ("Sửa Số chỗ ngồi"). */
  editLabel: string;
  onUnlock: () => void;
}) {
  // Wizard thêm xe: "Theo dữ liệu mẫu xe" thành ⓘ cạnh nhãn, không đẩy lệch hàng lưới.
  const tip = useHelpAsTip(label, help);
  return (
    <Form.Item label={tip.label} required={required} help={tip.help} htmlFor={id}>
      <Input
        id={id}
        value={value}
        readOnly
        aria-label={fieldLabel}
        className={LOCKED_FIELD_CLASS}
        suffix={<FieldLockButton ariaLabel={editLabel} onClick={onUnlock} />}
      />
    </Form.Item>
  );
}
