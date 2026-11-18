'use client';

import type { ReactNode } from 'react';

import styles from './field-lock.module.css';

/**
 * Khoá TẠI CHỖ của một ô nhập tự điền (thông số theo mẫu xe, chữ máy đọc trên cà vẹt — ADR 0102).
 *
 * Khoá là một TRẠNG THÁI của chính ô nhập (chỉ đọc + nút bút trong ô), không phải một component
 * khác thay chỗ ô: đổi khoá ↔ mở chỉ đổi prop, React giữ nguyên phần tử nên ô không nhấp nháy
 * (18/11/2026 — trước đó ô khoá là `Input` riêng, đổi mẫu xe là gỡ cả ô rồi dựng lại).
 */
export interface FieldLock {
  locked: boolean;
  /** Nhãn khả truy cập của nút bút, đã dịch ("Sửa Số chỗ ngồi"). */
  editLabel: string;
  onUnlock: () => void;
}

/** Nút bút NẰM TRONG ô đang khoá — bấm là mở riêng ô đó để sửa. */
export function FieldLockButton({
  ariaLabel,
  onClick,
}: {
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.editField}
      onClick={onClick}
      // Ô chọn mở danh sách ở mousedown — chặn để bấm bút chỉ mở khoá, không kéo theo danh sách.
      onMouseDown={(event) => event.preventDefault()}
      aria-label={ariaLabel}
    >
      <span className={styles.editGlyph} aria-hidden="true" />
    </button>
  );
}

/** Lớp của ô đang khoá (nền xám nhạt, chữ vẫn đậm) — `Input` / `InputNumber` / `Select`. */
export const LOCKED_FIELD_CLASS = styles.locked;

/**
 * Hậu tố của một ô CÓ THỂ khoá: LUÔN là một phần tử (kể cả khi đang mở), vì AntD bọc ô trong
 * `affix-wrapper` chỉ khi có `suffix` — hậu tố lúc có lúc không là đổi khung bọc, React dựng lại
 * cả ô nhập. `base` là hậu tố sẵn có của ô (₫, %).
 */
export function fieldLockSuffix(lock: FieldLock | undefined, base?: ReactNode): ReactNode {
  if (!lock) return base;
  return (
    <span className={styles.suffixSlot}>
      {base}
      {lock.locked ? <FieldLockButton ariaLabel={lock.editLabel} onClick={lock.onUnlock} /> : null}
    </span>
  );
}
