import type { ExcessMileageSuggestion } from './api';

import { showsExcessMileageFacts } from './excess-mileage-visibility';

/**
 * Cổng hiển thị khối "Vượt hạn mức km" ở tấm quyết toán.
 *
 * Bẫy nằm ở HỢP ĐỒNG API: `settlement.excessMileage` khai `!` trong DTO, tức LUÔN có mặt. Nên
 * `data.excessMileage ? …` — phép kiểm trông rất hợp lý — luôn đúng, và khối "chưa đặt hạn mức"
 * hiện trên mọi đơn, kể cả đơn của xe không bao giờ tính phí vượt km.
 *
 * Trường phân biệt là `includedKmPerDay`: null nghĩa là đơn này không có hạn mức nào để vượt.
 */
function suggestion(over: Partial<ExcessMileageSuggestion>): ExcessMileageSuggestion {
  return {
    available: false,
    amount: null,
    includedKmPerDay: null,
    allowedKm: null,
    actualKm: null,
    excessKm: null,
    feePerKm: null,
    chargedDays: null,
    ...over,
  } as ExcessMileageSuggestion;
}

describe('showsExcessMileageFacts', () => {
  it('đơn KHÔNG có hạn mức ⇒ ẩn hẳn khối', () => {
    expect(showsExcessMileageFacts(suggestion({ includedKmPerDay: null }))).toBe(false);
  });

  it('đơn CÓ hạn mức ⇒ hiện, kể cả khi chưa đủ dữ kiện để đề xuất', () => {
    /*
     * Đây là vế dễ bị siết nhầm thành `available === true`. Ca "có hạn mức nhưng thiếu chỉ số
     * đồng hồ" phải hiện, vì chính khối này là chỗ nói ra đang thiếu gì — im lặng thì chủ xe tự
     * gõ một con số mà không biết hệ thống thiếu dữ liệu.
     */
    expect(
      showsExcessMileageFacts(suggestion({ includedKmPerDay: 300, available: false })),
    ).toBe(true);
  });

  it('hạn mức 0 km/ngày vẫn là MỘT hạn mức ⇒ hiện', () => {
    // `0` là giá trị thật, không phải "chưa khai" — một phép kiểm truthy sẽ nuốt mất ca này.
    expect(showsExcessMileageFacts(suggestion({ includedKmPerDay: 0 }))).toBe(true);
  });
});
