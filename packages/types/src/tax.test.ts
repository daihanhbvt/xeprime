import { describe, expect, it } from 'vitest';
import {
  TAX_WITHHOLDING_STATUS,
  canTransitionTax,
  isTaxPeriodKey,
  isTaxUnpaid,
  taxPeriodKeyVn,
  taxPeriodRangeVn,
} from './status/tax';

/**
 * Kỳ thuế theo GIỜ VIỆT NAM — ADR 0032 điều 3, Phase 8.
 *
 * Ca quan trọng nhất ở đây là khoảng BẢY GIỜ mỗi tháng mà giờ UTC và giờ Việt Nam thuộc hai kỳ
 * khác nhau. Tính bằng `getUTCMonth()` sẽ xếp những chuyến đó vào tờ khai của tháng trước — và
 * đó là loại sai không ai phát hiện cho tới khi cơ quan thuế đối chiếu.
 */
describe('taxPeriodKeyVn — kỳ thuế luôn theo giờ Việt Nam', () => {
  it('mốc đầu tháng theo giờ VN nhưng còn tháng trước theo UTC vẫn vào kỳ MỚI', () => {
    // 01/04/2026 06:30 giờ VN = 31/03/2026 23:30 UTC.
    expect(taxPeriodKeyVn(new Date('2026-03-31T23:30:00Z'))).toBe('2026-04');
  });

  it('mốc cuối tháng theo giờ VN vẫn ở kỳ CŨ', () => {
    // 31/03/2026 23:30 giờ VN = 31/03/2026 16:30 UTC.
    expect(taxPeriodKeyVn(new Date('2026-03-31T16:30:00Z'))).toBe('2026-03');
  });

  it('chuyển năm: 01/01 giờ VN không rơi về tháng 12 năm trước', () => {
    expect(taxPeriodKeyVn(new Date('2025-12-31T17:00:00Z'))).toBe('2026-01');
    expect(taxPeriodKeyVn(new Date('2025-12-31T16:59:00Z'))).toBe('2025-12');
  });

  it('khoảng của một kỳ khớp ĐÚNG mốc sinh ra nó — hai hàm không được lệch nhau', () => {
    for (const key of ['2026-01', '2026-02', '2026-04', '2026-12']) {
      const { start, end } = taxPeriodRangeVn(key);
      // Mốc đầu kỳ thuộc kỳ đó; mốc cuối kỳ (đã sang kỳ sau) thì không.
      expect(taxPeriodKeyVn(start)).toBe(key);
      expect(taxPeriodKeyVn(new Date(end.getTime() - 1))).toBe(key);
      expect(taxPeriodKeyVn(end)).not.toBe(key);
    }
  });

  it('tháng 2 năm nhuận dài 29 ngày, không phải 28', () => {
    const { start, end } = taxPeriodRangeVn('2028-02');
    expect((end.getTime() - start.getTime()) / 86_400_000).toBe(29);
  });

  it('khoá kỳ sai dạng bị từ chối — tháng 13 không tồn tại', () => {
    expect(isTaxPeriodKey('2026-01')).toBe(true);
    expect(isTaxPeriodKey('2026-13')).toBe(false);
    expect(isTaxPeriodKey('2026-00')).toBe(false);
    expect(isTaxPeriodKey('2026-1')).toBe(false);
    expect(isTaxPeriodKey('')).toBe(false);
  });
});

describe('vòng đời khai–nộp', () => {
  it('chỉ đi xuôi; `remitted` và `reversed` là trạng thái CUỐI', () => {
    expect(canTransitionTax(TAX_WITHHOLDING_STATUS.ACCRUED, TAX_WITHHOLDING_STATUS.DECLARED)).toBe(true);
    expect(canTransitionTax(TAX_WITHHOLDING_STATUS.DECLARED, TAX_WITHHOLDING_STATUS.REMITTED)).toBe(true);
    // Không nhảy cóc: không có đường "nộp mà chưa khai".
    expect(canTransitionTax(TAX_WITHHOLDING_STATUS.ACCRUED, TAX_WITHHOLDING_STATUS.REMITTED)).toBe(false);
    // Không đi lùi: tiền đã nộp thì sửa bằng dòng ĐẢO, không phải bằng cách đổi trạng thái.
    expect(canTransitionTax(TAX_WITHHOLDING_STATUS.REMITTED, TAX_WITHHOLDING_STATUS.DECLARED)).toBe(false);
    expect(canTransitionTax(TAX_WITHHOLDING_STATUS.REVERSED, TAX_WITHHOLDING_STATUS.ACCRUED)).toBe(false);
  });

  it('đảo được từ cả `accrued` lẫn `declared` — sai sót phát hiện muộn vẫn sửa được', () => {
    expect(canTransitionTax(TAX_WITHHOLDING_STATUS.ACCRUED, TAX_WITHHOLDING_STATUS.REVERSED)).toBe(true);
    expect(canTransitionTax(TAX_WITHHOLDING_STATUS.DECLARED, TAX_WITHHOLDING_STATUS.REVERSED)).toBe(true);
  });

  it('nghĩa vụ GIỮ HỘ chỉ gồm phần chưa nộp', () => {
    expect(isTaxUnpaid(TAX_WITHHOLDING_STATUS.ACCRUED)).toBe(true);
    expect(isTaxUnpaid(TAX_WITHHOLDING_STATUS.DECLARED)).toBe(true);
    // Đã nộp ⇒ tiền rời tài khoản; đã đảo ⇒ triệt tiêu. Cả hai thôi là nghĩa vụ.
    expect(isTaxUnpaid(TAX_WITHHOLDING_STATUS.REMITTED)).toBe(false);
    expect(isTaxUnpaid(TAX_WITHHOLDING_STATUS.REVERSED)).toBe(false);
  });
});
