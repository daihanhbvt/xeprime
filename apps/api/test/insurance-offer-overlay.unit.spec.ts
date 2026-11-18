import { Prisma } from '@xeprime/prisma';
import {
  INSURANCE_PREMIUM_BASIS,
  INSURANCE_PRODUCT_KIND,
  MIC_VCX_TRIP_DEFAULT_TIERS,
  type InsuranceProductKind,
} from '@xeprime/types';
import {
  InsuranceOfferService,
  type InsuranceProductSource,
} from '../src/modules/insurance/insurance-offer.service';
import type { InsurancePartner } from '../src/modules/insurance/partner/insurance-partner.port';

/**
 * ADR 0098 — phần bảo hiểm của chính sách phí khi tính tiền (công tắc bán, biểu phí NGÀY, tên đối
 * tác) đọc từ SẢN PHẨM bảo hiểm + đối tác đang chạy, không còn từ `fee_policies`.
 */

type Row = {
  kind: InsuranceProductKind;
  premiumBasis: string;
  premiumTiersJson: unknown;
  serviceFeeEnabled: boolean;
  serviceFeePercent: Prisma.Decimal;
  dailyAmountCar: Prisma.Decimal | null;
  dailyAmountMotorbike: Prisma.Decimal | null;
};

function source(rows: Row[]): InsuranceProductSource {
  return {
    insuranceProduct: { findMany: async () => rows },
  } as unknown as InsuranceProductSource;
}

function partner(over: Partial<InsurancePartner> = {}): InsurancePartner {
  return {
    configured: true,
    partnerName: 'MIC (giả lập)',
    ...over,
  } as unknown as InsurancePartner;
}

const personalAccident = (car: number | null, moto: number | null): Row => ({
  kind: INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT,
  premiumBasis: INSURANCE_PREMIUM_BASIS.DAILY,
  premiumTiersJson: null,
  serviceFeeEnabled: false,
  serviceFeePercent: new Prisma.Decimal(0),
  dailyAmountCar: car == null ? null : new Prisma.Decimal(car),
  dailyAmountMotorbike: moto == null ? null : new Prisma.Decimal(moto),
});

const vehicleTripTier: Row = {
  kind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
  premiumBasis: INSURANCE_PREMIUM_BASIS.VALUE_TIER,
  premiumTiersJson: MIC_VCX_TRIP_DEFAULT_TIERS,
  serviceFeeEnabled: false,
  serviceFeePercent: new Prisma.Decimal(0),
  dailyAmountCar: null,
  dailyAmountMotorbike: null,
};

describe('InsuranceOfferService.feePolicyOverlay (ADR 0098)', () => {
  it('sản phẩm tai nạn người theo ngày đang bật ⇒ bán, biểu phí lấy từ CHÍNH sản phẩm', async () => {
    const offer = new InsuranceOfferService(partner(), source([personalAccident(20000, 5000)]));
    const overlay = await offer.feePolicyOverlay();

    expect(overlay.tripInsuranceEnabled).toBe(true);
    expect(overlay.tripInsuranceDailyAmount).toEqual({ car: '20000', motorbike: '5000' });
    expect(overlay.vehicleProtectionEnabled).toBe(false);
    expect(overlay.vehicleProtectionDailyAmount).toEqual({ car: '0', motorbike: '0' });
    expect(overlay.insurancePartnerName).toBe('MIC (giả lập)');
  });

  it('vật chất xe theo BẬC ⇒ bán nhưng biểu phí ngày 0 (phí đi qua báo giá bậc)', async () => {
    const offer = new InsuranceOfferService(partner(), source([vehicleTripTier]));
    const overlay = await offer.feePolicyOverlay();

    expect(overlay.vehicleProtectionEnabled).toBe(true);
    expect(overlay.vehicleProtectionDailyAmount).toEqual({ car: '0', motorbike: '0' });
  });

  it('đối tác không phát hành loại đó (MIC chỉ vật chất xe) ⇒ không bán, biểu phí 0', async () => {
    const offer = new InsuranceOfferService(
      partner({
        supportsKind: (kind: InsuranceProductKind) => kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
      } as Partial<InsurancePartner>),
      source([personalAccident(20000, 5000), vehicleTripTier]),
    );
    const overlay = await offer.feePolicyOverlay();

    expect(overlay.tripInsuranceEnabled).toBe(false);
    expect(overlay.tripInsuranceDailyAmount).toEqual({ car: '0', motorbike: '0' });
    expect(overlay.vehicleProtectionEnabled).toBe(true);
  });

  it('chưa có đối tác ⇒ không bán gì, không tên đối tác', async () => {
    const offer = new InsuranceOfferService(
      partner({ configured: false }),
      source([personalAccident(20000, 5000)]),
    );
    expect(await offer.feePolicyOverlay()).toEqual({
      vehicleProtectionEnabled: false,
      vehicleProtectionDailyAmount: { car: '0', motorbike: '0' },
      tripInsuranceEnabled: false,
      tripInsuranceDailyAmount: { car: '0', motorbike: '0' },
      insurancePartnerName: null,
    });
  });

  it('sản phẩm theo ngày chưa khai mức ⇒ 0 (báo giá không sinh dòng), không ném', async () => {
    const offer = new InsuranceOfferService(partner(), source([personalAccident(null, 3000)]));
    expect((await offer.feePolicyOverlay()).tripInsuranceDailyAmount).toEqual({
      car: '0',
      motorbike: '3000',
    });
  });
});
