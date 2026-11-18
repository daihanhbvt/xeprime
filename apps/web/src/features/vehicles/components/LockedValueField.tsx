'use client';

import { Form, Input } from 'antd';
import type { ReactNode } from 'react';

import styles from './LockedValueField.module.css';

/**
 * Nút bút NẰM TRONG ô đang khoá — một kiểu cho mọi ô tự điền của form xe (thông số theo mẫu xe,
 * biển số / màu / số khung / số máy đọc từ cà vẹt — ADR 0102). Bấm là mở riêng ô đó để sửa.
 */
export function LockedEditButton({
  ariaLabel,
  onClick,
}: {
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.editField} onClick={onClick} aria-label={ariaLabel}>
      <span className={styles.editGlyph} aria-hidden="true" />
    </button>
  );
}

/** Lớp của ô khoá (readOnly, nền xám nhạt) — dùng khi nơi gọi tự dựng `Input`. */
export const LOCKED_INPUT_CLASS = styles.lockedInput;

/**
 * Ô ĐANG KHOÁ của một trường tự điền: chỉ đọc (không disabled — chữ vẫn đậm, rõ), giá trị đã định
 * dạng, bút trong ô để mở. Nơi gọi vẽ ô nhập thật (ô số, ô chọn, thẻ kiểu dáng…) sau khi mở khoá —
 * khoá hiện CÙNG một hình dạng dù ô gốc là loại gì.
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
  return (
    <Form.Item label={label} required={required} help={help} htmlFor={id}>
      <Input
        id={id}
        value={value}
        readOnly
        aria-label={fieldLabel}
        className={styles.lockedInput}
        suffix={<LockedEditButton ariaLabel={editLabel} onClick={onUnlock} />}
      />
    </Form.Item>
  );
}
