/**
 * Số KM — phần KHÔNG phụ thuộc ngôn ngữ.
 *
 * Luật §9 của docs/design/12: thiếu số thì nói "chưa có", KHÔNG bịa `0 km`. Việc chọn CHỮ cho
 * "chưa có" / "còn bao nhiêu" / "quá hạn bao nhiêu" nằm ở `useAppFormat()`; ở đây chỉ còn phép
 * phân loại, để tab bảo dưỡng, Trung tâm bảo dưỡng và header hồ sơ xe — trên CẢ hai client —
 * cùng phân loại một kiểu.
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

const FULL_PERCENT = 100;

/**
 * Phần trăm chu kỳ bảo dưỡng ĐÃ ĐI — suy từ hai thứ mà một dòng Trung tâm bảo dưỡng có sẵn:
 * chu kỳ và số KM còn lại tới mốc. `null` khi thiếu một trong hai, tức là không có gì để vẽ.
 *
 * `vehicleMaintenanceSchedule()` (`@xeprime/types`) tính cùng đại lượng này từ `lastServiceKm` —
 * trường mà `MaintenanceBoardItemDto` không trả về. Hai đường vào MỘT con số, nên chúng phải
 * đứng ở tầng dùng chung: cả web lẫn app đều vẽ thanh chu kỳ này, và một bản nhân chia chép tay
 * ở mỗi client là hai công thức chắc chắn sẽ trôi khỏi nhau.
 *
 * Kẹp về 0–100 ngay tại đây: quá hạn thì `remainingKm` âm, và 140% tô tràn ra ngoài khung thanh.
 */
export function maintenanceCyclePercent(
  intervalKm: number | null | undefined,
  remainingKm: number | null | undefined,
): number | null {
  if (typeof intervalKm !== 'number' || intervalKm <= 0) return null;
  if (typeof remainingKm !== 'number') return null;

  const used = ((intervalKm - remainingKm) / intervalKm) * FULL_PERCENT;
  return Math.min(FULL_PERCENT, Math.max(0, used));
}
