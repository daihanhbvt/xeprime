import { describe, expect, it } from 'vitest';

import { PICKUP_URGENCY, pickupUrgency } from './pickup-queue';

/**
 * "Hôm nay" là câu hỏi về MÚI GIỜ, không phải về số mili-giây — nên mọi mốc dưới đây được viết
 * bằng giờ UTC có chủ đích, và điều được kiểm là chúng rơi đúng vào ngày lịch Việt Nam.
 */
describe('pickupUrgency', () => {
  // 22/09/2026 03:00Z = 10:00 giờ Việt Nam.
  const NOW = '2026-09-22T03:00:00.000Z';

  it('đã qua giờ hẹn ⇒ overdue, dù chỉ một phút', () => {
    expect(pickupUrgency('2026-09-22T02:59:00.000Z', NOW)).toBe(PICKUP_URGENCY.OVERDUE);
    expect(pickupUrgency('2026-09-20T02:00:00.000Z', NOW)).toBe(PICKUP_URGENCY.OVERDUE);
  });

  it('cùng ngày lịch Việt Nam, chưa tới giờ ⇒ today', () => {
    expect(pickupUrgency('2026-09-22T09:00:00.000Z', NOW)).toBe(PICKUP_URGENCY.TODAY);
    // 16:59Z = 23:59 giờ Việt Nam — vẫn là hôm nay.
    expect(pickupUrgency('2026-09-22T16:59:00.000Z', NOW)).toBe(PICKUP_URGENCY.TODAY);
  });

  it('sang ngày lịch Việt Nam kế tiếp ⇒ upcoming, dù đồng hồ UTC vẫn cùng ngày', () => {
    /*
     * 17:00Z ngày 22/09 = 00:00 ngày 23/09 giờ Việt Nam. Đây chính là chỗ một phép so bằng UTC
     * sẽ nói "hôm nay" và đẩy một việc chưa tới hạn lẫn vào danh sách phải làm ngay.
     */
    expect(pickupUrgency('2026-09-22T17:00:00.000Z', NOW)).toBe(PICKUP_URGENCY.UPCOMING);
  });

  it('đúng khoảnh khắc hẹn chưa phải là quá giờ', () => {
    expect(pickupUrgency(NOW, NOW)).toBe(PICKUP_URGENCY.TODAY);
  });

  it('nhận cả Date và số mili-giây, không chỉ chuỗi ISO', () => {
    expect(pickupUrgency(new Date('2026-09-21T03:00:00.000Z'), NOW)).toBe(PICKUP_URGENCY.OVERDUE);
    expect(pickupUrgency(Date.parse('2026-09-25T03:00:00.000Z'), NOW)).toBe(
      PICKUP_URGENCY.UPCOMING,
    );
  });
});
