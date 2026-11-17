import { describe, expect, it } from 'vitest';
import { INSURANCE_PRODUCT_KIND, INSURANCE_PROVIDER, VEHICLE_TYPE } from '@xeprime/types';
import type { PublicQuote } from '@/features/rental-policies/types';
import { insuranceOfferItems, sameOfferItems } from './offer';
import type { PublicInsuranceProduct } from './types';

function quote(overrides: {
  insuranceOffered?: boolean;
  vehicleProtectionEnabled?: boolean;
  tripInsuranceEnabled?: boolean;
  noFees?: boolean;
}): PublicQuote {
  const policy = {
    vehicleProtectionEnabled: overrides.vehicleProtectionEnabled ?? true,
    tripInsuranceEnabled: overrides.tripInsuranceEnabled ?? true,
    vehicleProtectionDailyAmount: { car: '50000', motorbike: '15000' },
    tripInsuranceDailyAmount: { car: '20000', motorbike: '0' },
  };
  return {
    insuranceOffered: overrides.insuranceOffered ?? true,
    insuranceOfferedByKind: { vehicleProtection: true, tripInsurance: true },
    breakdown: { fees: overrides.noFees ? null : { policy } },
  } as unknown as PublicQuote;
}

const product = (kind: (typeof INSURANCE_PRODUCT_KIND)[keyof typeof INSURANCE_PRODUCT_KIND]) =>
  ({
    kind,
    provider: INSURANCE_PROVIDER.MIC,
    nameVi: kind,
    nameEn: kind,
    coverageVi: 'x',
    coverageEn: 'x',
    deductibleAmount: null,
    maxPayoutAmount: null,
    maxPayoutNoteVi: null,
    maxPayoutNoteEn: null,
  }) as PublicInsuranceProduct;

describe('insuranceOfferItems - ADR 0064', () => {
  it('chưa có báo giá ⇒ CHƯA BIẾT (null), không phải "không bán"', () => {
    expect(insuranceOfferItems(undefined, VEHICLE_TYPE.CAR, undefined)).toBeNull();
  });

  it('nền tảng chưa có đối tác (insuranceOffered=false) ⇒ ẩn cả hai ô', () => {
    expect(
      insuranceOfferItems(quote({ insuranceOffered: false }), VEHICLE_TYPE.CAR, undefined),
    ).toEqual([]);
  });

  it('báo giá thiếu trường insuranceOffered (API cũ) ⇒ coi là KHÔNG bán', () => {
    const q = quote({}) as unknown as Record<string, unknown>;
    delete q.insuranceOffered;
    expect(insuranceOfferItems(q as unknown as PublicQuote, VEHICLE_TYPE.CAR, undefined)).toEqual(
      [],
    );
  });

  it('phí ngày đọc từ báo giá theo loại xe; phí 0 của loại xe đó ⇒ không chào', () => {
    const car = insuranceOfferItems(quote({}), VEHICLE_TYPE.CAR, undefined)!;
    expect(car.map((i) => [i.kind, i.dailyAmount])).toEqual([
      [INSURANCE_PRODUCT_KIND.VEHICLE_TRIP, '50000'],
      [INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT, '20000'],
    ]);
    const moto = insuranceOfferItems(quote({}), VEHICLE_TYPE.MOTORBIKE, undefined)!;
    expect(moto.map((i) => i.kind)).toEqual([INSURANCE_PRODUCT_KIND.VEHICLE_TRIP]);
  });

  it('server tắt một sản phẩm (insuranceOfferedByKind) ⇒ ô đó không hiện', () => {
    const q = quote({}) as unknown as Record<string, unknown>;
    q.insuranceOfferedByKind = { vehicleProtection: false, tripInsurance: true };
    const items = insuranceOfferItems(q as unknown as PublicQuote, VEHICLE_TYPE.CAR, undefined)!;
    expect(items.map((i) => i.kind)).toEqual([INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT]);
  });

  it('báo giá thiếu insuranceOfferedByKind (API cũ) ⇒ coi là KHÔNG bán', () => {
    const q = quote({}) as unknown as Record<string, unknown>;
    delete q.insuranceOfferedByKind;
    expect(insuranceOfferItems(q as unknown as PublicQuote, VEHICLE_TYPE.CAR, undefined)).toEqual(
      [],
    );
  });

  it('chính sách tắt một dòng ⇒ dòng đó không hiện', () => {
    const items = insuranceOfferItems(
      quote({ tripInsuranceEnabled: false }),
      VEHICLE_TYPE.CAR,
      undefined,
    )!;
    expect(items.map((i) => i.kind)).toEqual([INSURANCE_PRODUCT_KIND.VEHICLE_TRIP]);
  });

  it('admin tắt sản phẩm trong danh mục ⇒ ẩn; danh mục chưa tải ⇒ vẫn chào, thiếu quyền lợi', () => {
    const onlyIp = [product(INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT)];
    const items = insuranceOfferItems(quote({}), VEHICLE_TYPE.CAR, onlyIp)!;
    expect(items.map((i) => i.kind)).toEqual([INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT]);
    expect(items[0]!.product).toBe(onlyIp[0]);

    const loading = insuranceOfferItems(quote({}), VEHICLE_TYPE.CAR, undefined)!;
    expect(loading.every((i) => i.product === null)).toBe(true);
  });

  it('không có bảng phí ⇒ không chào', () => {
    expect(insuranceOfferItems(quote({ noFees: true }), VEHICLE_TYPE.CAR, undefined)).toEqual([]);
  });

  describe('bảo hiểm theo bậc - chủ xe chọn chế độ (ADR 0091)', () => {
    const tierProduct = { ...product(INSURANCE_PRODUCT_KIND.VEHICLE_TRIP), mandatory: true };
    const withOffer = (
      offer: { amount: string; required: boolean; serviceFeeAmount?: string } | null,
    ) => {
      const q = quote({}) as unknown as { breakdown: { fees: Record<string, unknown> } };
      q.breakdown.fees.vehicleProtectionOffer = offer;
      q.breakdown.fees.lines = [];
      return q as unknown as PublicQuote;
    };

    it('Tuỳ chọn ⇒ ô tích bỏ được, phí cả chuyến từ lời chào bán', () => {
      const items = insuranceOfferItems(
        withOffer({ amount: '224400', required: false }),
        VEHICLE_TYPE.CAR,
        [tierProduct],
      )!;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ mandatory: false, tripAmount: '224400', dailyAmount: null });
    });

    it('Bắt buộc ⇒ dòng cố định không bỏ được', () => {
      const items = insuranceOfferItems(
        withOffer({ amount: '224400', required: true }),
        VEHICLE_TYPE.CAR,
        [tierProduct],
      )!;
      expect(items[0]).toMatchObject({ mandatory: true, tripAmount: '224400' });
    });

    it('phí thu hộ đi kèm lời chào bán (ADR 0091 điều 3) - "0" hay vắng ⇒ null', () => {
      const [withFee] = insuranceOfferItems(
        withOffer({ amount: '224400', required: false, serviceFeeAmount: '22440' }),
        VEHICLE_TYPE.CAR,
        [tierProduct],
      )!;
      expect(withFee).toMatchObject({ tripAmount: '224400', serviceFeeAmount: '22440' });
      const [zero] = insuranceOfferItems(
        withOffer({ amount: '224400', required: false, serviceFeeAmount: '0' }),
        VEHICLE_TYPE.CAR,
        [tierProduct],
      )!;
      expect(zero!.serviceFeeAmount).toBeNull();
      const [legacy] = insuranceOfferItems(
        withOffer({ amount: '224400', required: false }),
        VEHICLE_TYPE.CAR,
        [tierProduct],
      )!;
      expect(legacy!.serviceFeeAmount).toBeNull();
    });

    it('sản phẩm bậc mà báo giá không chào (xe chưa đủ điều kiện) ⇒ không rơi về ô theo ngày', () => {
      expect(insuranceOfferItems(withOffer(null), VEHICLE_TYPE.CAR, [tierProduct])).toEqual([]);
    });
  });

  it('sameOfferItems so theo nội dung', () => {
    const a = insuranceOfferItems(quote({}), VEHICLE_TYPE.CAR, undefined);
    const b = insuranceOfferItems(quote({}), VEHICLE_TYPE.CAR, undefined);
    expect(sameOfferItems(a, b)).toBe(true);
    expect(sameOfferItems(a, [])).toBe(false);
  });
});
