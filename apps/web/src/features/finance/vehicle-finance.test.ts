import { describe, expect, it } from 'vitest';
import {
  REVENUE_SOURCE_VIEW,
  comparablePreviousRange,
  countDueDates,
  itemMatchesView,
  parseRevenueSourceView,
  revenueOf,
  sharePercent,
  tripsOf,
} from './vehicle-finance';
import type { FinanceSourceBreakdown } from './types';

const breakdown: FinanceSourceBreakdown = {
  total: '1500000',
  marketplaceAmount: '500000',
  directAmount: '700000',
  unlinkedAmount: '300000',
  items: [
    {
      source: 'xeprime',
      sourceLabel: null,
      amount: '500000',
      sharePercent: 33.3,
      trips: 2,
      bookedAmount: '900000',
    },
    {
      source: 'social',
      sourceLabel: null,
      amount: '700000',
      sharePercent: 46.7,
      trips: 1,
      bookedAmount: '1000000',
    },
    {
      source: 'other_platform',
      sourceLabel: 'A',
      amount: '0',
      sharePercent: 0,
      trips: 1,
      bookedAmount: '400000',
    },
    {
      source: null,
      sourceLabel: null,
      amount: '300000',
      sharePercent: 20,
      trips: 0,
      bookedAmount: '0',
    },
  ],
};

describe('góc nhìn nguồn doanh thu', () => {
  it('chỉ nhận hai mã hợp lệ - còn lại là "tất cả"', () => {
    expect(parseRevenueSourceView('xeprime')).toBe(REVENUE_SOURCE_VIEW.MARKETPLACE);
    expect(parseRevenueSourceView('direct')).toBe(REVENUE_SOURCE_VIEW.DIRECT);
    expect(parseRevenueSourceView('social')).toBeNull();
    expect(parseRevenueSourceView(null)).toBeNull();
  });

  it('doanh thu và số chuyến theo góc nhìn; khoản không gắn đơn chỉ thuộc "tất cả"', () => {
    expect(revenueOf(breakdown, null)).toBe('1500000');
    expect(revenueOf(breakdown, REVENUE_SOURCE_VIEW.MARKETPLACE)).toBe('500000');
    expect(revenueOf(breakdown, REVENUE_SOURCE_VIEW.DIRECT)).toBe('700000');
    expect(tripsOf(breakdown.items, null)).toBe(4);
    expect(tripsOf(breakdown.items, REVENUE_SOURCE_VIEW.MARKETPLACE)).toBe(2);
    expect(tripsOf(breakdown.items, REVENUE_SOURCE_VIEW.DIRECT)).toBe(2);
    expect(itemMatchesView({ source: null }, REVENUE_SOURCE_VIEW.DIRECT)).toBe(false);
  });

  it('tỷ trọng một chữ số lẻ; tổng 0 ⇒ 0', () => {
    expect(sharePercent('500000', '1500000')).toBe(33.3);
    expect(sharePercent('10', '0')).toBe(0);
  });
});

describe('comparablePreviousRange', () => {
  it('tháng đang chạy so với tháng trước TỚI CÙNG NGÀY', () => {
    expect(comparablePreviousRange('2026-11-01', '2026-11-30', '2026-11-26')).toEqual({
      from: '2026-10-01',
      to: '2026-10-26',
    });
  });

  it('tháng đã qua so với trọn tháng trước nó; 31 lùi về cuối tháng ngắn', () => {
    expect(comparablePreviousRange('2026-10-01', '2026-10-31', '2026-11-26')).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(comparablePreviousRange('2026-03-01', '2026-03-31', '2026-03-31')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });

  it('quý, năm lùi trọn số tháng', () => {
    expect(comparablePreviousRange('2026-10-01', '2026-12-31', '2026-11-26')).toEqual({
      from: '2026-07-01',
      to: '2026-08-26',
    });
    expect(comparablePreviousRange('2026-01-01', '2026-12-31', '2026-11-26')).toEqual({
      from: '2025-01-01',
      to: '2025-11-26',
    });
  });

  it('tuần / hôm nay lùi đúng số ngày', () => {
    expect(comparablePreviousRange('2026-11-23', '2026-11-29', '2026-11-26')).toEqual({
      from: '2026-11-16',
      to: '2026-11-19',
    });
    expect(comparablePreviousRange('2026-11-26', '2026-11-26', '2026-11-26')).toEqual({
      from: '2026-11-25',
      to: '2026-11-25',
    });
  });

  it('kỳ chưa bắt đầu hoặc tham số hỏng ⇒ null', () => {
    expect(comparablePreviousRange('2026-12-01', '2026-12-31', '2026-11-26')).toBeNull();
    expect(comparablePreviousRange(undefined, '2026-12-31', '2026-11-26')).toBeNull();
    expect(comparablePreviousRange('abc', '2026-12-31', '2026-11-26')).toBeNull();
  });
});

describe('countDueDates', () => {
  it('đếm ngày đóng tiền rơi trong kỳ', () => {
    expect(countDueDates({ from: '2026-11-01', to: '2026-11-30', paymentDay: 15 })).toBe(1);
    expect(countDueDates({ from: '2026-10-01', to: '2026-12-31', paymentDay: 15 })).toBe(3);
    expect(countDueDates({ from: '2026-11-23', to: '2026-11-29', paymentDay: 15 })).toBe(0);
  });

  it('ngày 31 kẹp về cuối tháng ngắn', () => {
    expect(countDueDates({ from: '2026-02-01', to: '2026-02-28', paymentDay: 31 })).toBe(1);
  });

  it('ngoài hiệu lực hợp đồng thì không tính', () => {
    expect(
      countDueDates({
        from: '2026-01-01',
        to: '2026-12-31',
        paymentDay: 10,
        startDate: '2026-06-01',
        termMonths: 3,
      }),
    ).toBe(3);
    expect(
      countDueDates({
        from: '2026-01-01',
        to: '2026-12-31',
        paymentDay: 10,
        endDate: '2026-02-20',
      }),
    ).toBe(2);
  });

  it('chưa khai ngày đóng tiền ⇒ null, không đoán', () => {
    expect(countDueDates({ from: '2026-11-01', to: '2026-11-30', paymentDay: null })).toBeNull();
  });
});
