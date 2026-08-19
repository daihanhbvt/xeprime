/**
 * Số KM — phần KHÔNG phụ thuộc ngôn ngữ.
 *
 * Luật §9 của docs/design/12: thiếu số thì nói "chưa có", KHÔNG bịa `0 km`. Việc chọn CHỮ cho
 * "chưa có" / "còn bao nhiêu" / "quá hạn bao nhiêu" nằm ở `useAppFormat()`; ở đây chỉ còn phép
 * phân loại, để cả tab bảo dưỡng, Trung tâm bảo dưỡng và header hồ sơ xe cùng phân loại một kiểu.
 */

/** Cách diễn đạt quãng đường còn lại tới mốc bảo dưỡng. */
export type RemainingKmKind = 'unknown' | 'overdue' | 'remaining';

export interface RemainingKm {
  readonly kind: RemainingKmKind;
  /** Trị tuyệt đối của số KM; `null` khi chưa đủ dữ liệu để kết luận. */
  readonly km: number | null;
}

/**
 * KM còn lại tới mốc bảo dưỡng, diễn đạt theo hướng người đọc cần: còn bao nhiêu, hay đã
 * vượt bao nhiêu. `unknown` = chưa đủ dữ liệu để kết luận.
 */
export function remainingKm(value: number | null | undefined): RemainingKm {
  if (value == null) return { kind: 'unknown', km: null };
  if (value <= 0) return { kind: 'overdue', km: Math.abs(value) };
  return { kind: 'remaining', km: value };
}
