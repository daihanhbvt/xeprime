import type { ExcessMileageSuggestion } from './api';

/**
 * Khối "Vượt hạn mức km" có hiện ở tấm quyết toán không.
 *
 * Tách thành hàm thuần vì cổng này SAI theo một cách không nhìn thấy được: `excessMileage` khai
 * `!` trong DTO nên luôn có mặt, và một phép kiểm `data.excessMileage ?` luôn đúng — khối "chưa
 * đặt hạn mức" hiện trên cả những đơn không bao giờ tính phí vượt km. Cùng cổng với web
 * (`SettlementCard`).
 */
export function showsExcessMileageFacts(suggestion: ExcessMileageSuggestion): boolean {
  return suggestion.includedKmPerDay != null;
}
