import { describe, expect, it } from 'vitest';
import { pickupWishParts } from './long-term';

/**
 * Nguyện vọng nhận xe của khách thuê dài hạn — ADR 0011.
 *
 * ADR nói rõ đây phải là "một hàm duy nhất", và lý do là ngữ nghĩa: yêu cầu dài hạn chưa duyệt
 * KHÔNG có lịch, nên mỗi màn tự phân loại một kiểu là mỗi màn ngụ ý một mức chắc chắn khác nhau
 * với khách. Giờ web và app native cùng gọi hàm này, nên phân loại sai ở đây là hai client cùng
 * nói sai một chuyện.
 *
 * Ba nhánh + các trường hợp DỮ LIỆU THIẾU, vì dữ liệu thiếu mới là chỗ dễ rơi nhầm nhánh: rơi
 * xuống `shopDecides` là an toàn (gian hàng chốt lúc duyệt), còn khẳng định một ngày cụ thể mà
 * khách chưa hề nêu thì không.
 */
describe('pickupWishParts', () => {
  it('khách nêu ngày cụ thể', () => {
    expect(
      pickupWishParts({
        pickupPreference: 'specific_date',
        requestedPickupDate: '2026-09-01',
      }),
    ).toEqual({ kind: 'specificDate', date: '2026-09-01' });
  });

  it('khách chọn "trong 7 ngày tới" — server đã tính sẵn khoảng', () => {
    expect(
      pickupWishParts({
        pickupPreference: 'within_7_days',
        pickupWindowStartDate: '2026-09-01',
        pickupWindowEndDate: '2026-09-07',
      }),
    ).toEqual({ kind: 'window', start: '2026-09-01', end: '2026-09-07' });
  });

  it('không có nguyện vọng ⇒ gian hàng chốt lúc duyệt', () => {
    expect(pickupWishParts({})).toEqual({ kind: 'shopDecides' });
    expect(pickupWishParts({ pickupPreference: null })).toEqual({ kind: 'shopDecides' });
  });

  it('`specific_date` mà THIẾU ngày ⇒ shopDecides, không bịa ngày', () => {
    expect(pickupWishParts({ pickupPreference: 'specific_date' })).toEqual({
      kind: 'shopDecides',
    });
    expect(
      pickupWishParts({ pickupPreference: 'specific_date', requestedPickupDate: null }),
    ).toEqual({ kind: 'shopDecides' });
  });

  it('`within_7_days` mà THIẾU một đầu khoảng ⇒ shopDecides, không hiện khoảng hở', () => {
    expect(
      pickupWishParts({ pickupPreference: 'within_7_days', pickupWindowStartDate: '2026-09-01' }),
    ).toEqual({ kind: 'shopDecides' });
    expect(
      pickupWishParts({ pickupPreference: 'within_7_days', pickupWindowEndDate: '2026-09-07' }),
    ).toEqual({ kind: 'shopDecides' });
  });

  it('mã lạ (dữ liệu cũ) ⇒ shopDecides thay vì nổ', () => {
    expect(
      pickupWishParts({ pickupPreference: 'asap', requestedPickupDate: '2026-09-01' }),
    ).toEqual({ kind: 'shopDecides' });
  });
});
