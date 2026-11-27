/**
 * Danh mục sản phẩm bảo hiểm chuyến — dữ liệu NỀN (SEED_MODE=system), ADR 0064.
 *
 * Hai sản phẩm MIC theo `docs/financial-system-architecture.md` §8.1: phần mô tả hiện cho khách
 * (tên, quyền lợi, mức khấu trừ, bồi thường tối đa, mẫu URL tra cứu GCN) và cách tính phí. Sản phẩm
 * tính theo NGÀY mang biểu phí ngày ở chính nó (ADR 0098), khởi tạo bằng `FEE_SCHEDULE_DEFAULTS`.
 *
 * Seed chỉ TẠO MỚI (`update: {}`): admin sửa quyền lợi/bật tắt ở màn "Bảo hiểm", và chạy lại seed
 * không được ghi đè chỉnh sửa đó. Khoá tự nhiên `(provider, kind)` nên chạy lại bao nhiêu lần cũng
 * chỉ có hai dòng.
 *
 * Mẫu URL trỏ về trang tra cứu THỬ NGHIỆM: chưa có hợp đồng MIC thật, và GCN duy nhất phát hành
 * được hiện nay là GCN `TEST-…` của adapter giả lập (`INSURANCE_PARTNER=mic_mock`).
 */
import {
  FEE_SCHEDULE_DEFAULTS,
  INSURANCE_PREMIUM_BASIS,
  INSURANCE_PRODUCT_KIND,
  INSURANCE_PROVIDER,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { Prisma } from '../index';
import { prisma, seedId } from './context';
import { CERTIFICATE_URL_TEMPLATE, INSURANCE_PRODUCTS } from './insurance-products.data';

const money = (v: number | null) => (v === null ? null : new Prisma.Decimal(v));

/** Biểu phí ngày khởi tạo của sản phẩm theo ngày — cùng số mặc định của chính sách phí v2. */
const DAILY_DEFAULTS = {
  [INSURANCE_PRODUCT_KIND.VEHICLE_TRIP]: FEE_SCHEDULE_DEFAULTS.vehicleProtectionDailyAmount,
  [INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT]: FEE_SCHEDULE_DEFAULTS.tripInsuranceDailyAmount,
} as const;

export async function seedInsuranceProducts(): Promise<number> {
  for (const p of INSURANCE_PRODUCTS) {
    const basis = p.premiumBasis ?? INSURANCE_PREMIUM_BASIS.DAILY;
    const daily = basis === INSURANCE_PREMIUM_BASIS.DAILY ? DAILY_DEFAULTS[p.kind] : null;
    await prisma.insuranceProduct.upsert({
      where: {
        provider_kind: { provider: INSURANCE_PROVIDER.MIC, kind: p.kind },
      },
      update: {},
      create: {
        id: seedId(`insurance-product:${INSURANCE_PROVIDER.MIC}:${p.kind}`),
        kind: p.kind,
        provider: INSURANCE_PROVIDER.MIC,
        partnerProductCode: p.partnerProductCode,
        nameVi: p.nameVi,
        nameEn: p.nameEn,
        coverageVi: p.coverageVi,
        coverageEn: p.coverageEn,
        summaryVi: p.summaryVi ?? null,
        summaryEn: p.summaryEn ?? null,
        deductibleCar: money(p.deductibleCar),
        deductibleMotorbike: money(p.deductibleMotorbike),
        maxPayoutCar: money(p.maxPayoutCar),
        maxPayoutMotorbike: money(p.maxPayoutMotorbike),
        maxPayoutNoteVi: p.maxPayoutNoteVi,
        maxPayoutNoteEn: p.maxPayoutNoteEn,
        certificateUrlTemplate: CERTIFICATE_URL_TEMPLATE,
        displayOrder: p.displayOrder,
        isActive: p.isActive ?? true,
        premiumBasis: basis,
        dailyAmountCar: daily ? new Prisma.Decimal(daily[VEHICLE_TYPE.CAR]) : null,
        dailyAmountMotorbike: daily ? new Prisma.Decimal(daily[VEHICLE_TYPE.MOTORBIKE]) : null,
        premiumTiersJson: p.premiumTiers
          ? (p.premiumTiers.map((t) => ({ ...t })) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        claimHotline: p.claimHotline ?? null,
      },
    });
  }
  return INSURANCE_PRODUCTS.length;
}
