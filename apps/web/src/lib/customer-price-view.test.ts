import { describe, expect, it } from 'vitest';
import { FEE_BEARER } from '@xeprime/types';
import { customerTotalView } from './customer-price-view';

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
