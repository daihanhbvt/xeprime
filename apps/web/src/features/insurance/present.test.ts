import { describe, expect, it } from 'vitest';
import { INSURANCE_PRODUCT_KIND } from '@xeprime/types';
import { insuranceOfferPrice, insuranceProductCopy } from './present';
import type { InsuranceOfferItem, PublicInsuranceProduct } from './types';

const vi = <T>(a: T): T => a;

const product: PublicInsuranceProduct = {
  kind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
  provider: 'mic',
  nameVi: 'Bảo hiểm vật chất xe MIC',
  nameEn: 'MIC damage',
  coverageVi: 'Đâm va\nHoả hoạn\n\nMất cắp',
  coverageEn: 'Collision',
  summaryVi: null,
  summaryEn: null,
  mandatory: true,
};

const item = (over: Partial<InsuranceOfferItem>): InsuranceOfferItem => ({
  kind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
  dailyAmount: null,
  mandatory: false,
  tripAmount: null,
  serviceFeeAmount: null,
  product,
  ...over,
});

describe('insuranceOfferPrice', () => {
  it('phí cả chuyến gộp phí thu hộ (ADR 0091 điều 3)', () => {
    expect(insuranceOfferPrice(item({ tripAmount: '59411', serviceFeeAmount: '589' }))).toEqual({
      amount: '60000',
      basis: 'trip',
    });
  });

  it('phí theo ngày', () => {
    expect(insuranceOfferPrice(item({ dailyAmount: '30000' }))).toEqual({
      amount: '30000',
      basis: 'daily',
    });
  });

  it('không giá ⇒ null', () => {
    expect(insuranceOfferPrice(item({}))).toBeNull();
  });
});

describe('insuranceProductCopy', () => {
  it('tách phạm vi theo dòng, mô tả ngắn ghép từ các mục khi admin chưa đặt', () => {
    expect(insuranceProductCopy(product, (a) => vi(a))).toEqual({
      coverage: ['Đâm va', 'Hoả hoạn', 'Mất cắp'],
      summary: 'Đâm va, Hoả hoạn, Mất cắp',
    });
  });

  it('dùng mô tả ngắn admin đặt', () => {
    expect(
      insuranceProductCopy({ ...product, summaryVi: ' Đâm va, ngập nước ' }, (a) => vi(a)).summary,
    ).toBe('Đâm va, ngập nước');
  });
});
