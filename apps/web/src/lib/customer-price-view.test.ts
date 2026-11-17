import { describe, expect, it } from 'vitest';
import { FEE_BEARER, FEE_LINE } from '@xeprime/types';
import { customerFeeLines, customerTotalView } from './customer-price-view';

const fees = (over: Partial<Parameters<typeof customerTotalView>[0]['fees'] & object> = {}) => ({
  customerTotalAmount: '1900000',
  lines: [],
  promoDiscountAmount: '0',
  ...over,
});

describe('customerTotalView', () => {
  it('chỉ có tiền thuê ⇒ "total", số là tổng khách trả', () => {
    expect(customerTotalView({ totalAmount: '1800000', fees: fees({ customerTotalAmount: '1800000' }) }))
      .toEqual({ kind: 'total', amount: '1800000' });
  });

  it('báo giá cũ không có khối phí ⇒ rơi về tiền thuê', () => {
    expect(customerTotalView({ totalAmount: '1800000', fees: null })).toEqual({
      kind: 'total',
      amount: '1800000',
    });
  });

  it('có phụ phí PHÍA KHÁCH ⇒ "customerTotal" (Tổng bạn trả), không còn là tiền thuê', () => {
    expect(
      customerTotalView({
        totalAmount: '1800000',
        fees: fees({ lines: [{ bearer: FEE_BEARER.CUSTOMER, amount: '100000' }] }),
      }),
    ).toEqual({ kind: 'customerTotal', amount: '1900000' });
  });

  it('dòng do CHỦ XE chịu (thuế khấu trừ) không đổi tên tổng của khách', () => {
    expect(
      customerTotalView({
        totalAmount: '1800000',
        fees: fees({
          customerTotalAmount: '1800000',
          lines: [{ bearer: FEE_BEARER.OWNER, amount: '90000' }],
        }),
      }).kind,
    ).toBe('total');
  });

  it('có mã giảm ⇒ "customerTotal" dù không có phụ phí nào', () => {
    expect(
      customerTotalView({
        totalAmount: '1800000',
        fees: fees({ customerTotalAmount: '1700000', promoDiscountAmount: '100000' }),
      }),
    ).toEqual({ kind: 'customerTotal', amount: '1700000' });
  });

  it('còn phụ phí chưa tính ⇒ chỉ là "subtotal", thắng mọi tên khác', () => {
    expect(
      customerTotalView({
        estimateNote: 'Chưa gồm phí ngoài giờ',
        totalAmount: '1800000',
        fees: fees({ lines: [{ bearer: FEE_BEARER.CUSTOMER, amount: '100000' }] }),
      }).kind,
    ).toBe('subtotal');
  });
});

describe('customerFeeLines - phí thu hộ bảo hiểm gộp vào dòng bảo hiểm vật chất xe (ADR 0091 điều 3)', () => {
  const line = (key: string, amount: string, over: Record<string, unknown> = {}) => ({
    key,
    bearer: FEE_BEARER.CUSTOMER,
    percent: null as number | null,
    amount,
    unitAmount: null as string | null,
    quantity: null as number | null,
    ...over,
  });

  it('gộp X vào IV, giữ vị trí dòng IV, ⓘ mang hai số', () => {
    const lines = customerFeeLines([
      line(FEE_LINE.SERVICE_FEE, '50000'),
      line(FEE_LINE.VEHICLE_PROTECTION, '224400', { unitAmount: '74800', quantity: 3 }),
      line(FEE_LINE.INSURANCE_SERVICE_FEE, '22440', { percent: 10 }),
      line(FEE_LINE.TRIP_INSURANCE, '30000'),
    ]);
    expect(lines.map((l) => l.key)).toEqual([
      FEE_LINE.SERVICE_FEE,
      FEE_LINE.VEHICLE_PROTECTION,
      FEE_LINE.TRIP_INSURANCE,
    ]);
    const protection = lines[1]!;
    expect(protection.amount).toBe('246840');
    // Cách tính "N ngày × đơn giá" không còn ra đúng số gộp ⇒ bỏ.
    expect(protection.unitAmount).toBeNull();
    expect(protection.quantity).toBeNull();
    expect(protection.includedServiceFee).toEqual({
      premiumAmount: '224400',
      serviceFeeAmount: '22440',
      serviceFeePercent: 10,
    });
  });

  it('không có X ⇒ như visibleFeeLines của khách (bỏ dòng chủ xe chịu và dòng 0đ)', () => {
    const lines = customerFeeLines([
      line(FEE_LINE.VEHICLE_PROTECTION, '224400'),
      line(FEE_LINE.TAX, '90000', { bearer: FEE_BEARER.OWNER }),
      line(FEE_LINE.INSURANCE_SERVICE_FEE, '0'),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.amount).toBe('224400');
    expect(lines[0]!.includedServiceFee).toBeUndefined();
  });

  it('X không có IV đi kèm ⇒ giữ thành dòng riêng, không giấu tiền', () => {
    const lines = customerFeeLines([line(FEE_LINE.INSURANCE_SERVICE_FEE, '22440')]);
    expect(lines.map((l) => [l.key, l.amount])).toEqual([
      [FEE_LINE.INSURANCE_SERVICE_FEE, '22440'],
    ]);
  });
});
