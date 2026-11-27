import { newId, Prisma } from '@xeprime/prisma';
import {
  FEE_SCHEDULE_DEFAULTS,
  INSURANCE_PREMIUM_BASIS,
  INSURANCE_PRODUCT_KIND,
  INSURANCE_PROVIDER,
  VEHICLE_TYPE,
} from '@xeprime/types';
import {
  CERTIFICATE_URL_TEMPLATE,
  INSURANCE_PRODUCTS,
} from '../../../../prisma/src/seed/insurance-products.data';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Bảo đảm hai sản phẩm MIC của seed CÓ MẶT trong database test — gọi ở `beforeAll` của mọi spec
 * báo giá `IV`/`IP` (`InsuranceOfferService` chỉ chào loại có sản phẩm đang bật).
 *
 * Không có nó, spec phụ thuộc vào việc ai đó đã chạy `pnpm db:seed` trên `TEST_DATABASE_URL` —
 * CI dựng database trắng thì báo giá không có dòng bảo hiểm và spec đỏ vì một lý do không liên
 * quan tới code.
 *
 * `createMany({ skipDuplicates })` = `ON CONFLICT DO NOTHING` trên `(provider, kind)`: idempotent
 * và an toàn khi nhiều spec chạy SONG SONG cùng gọi. Không bao giờ ghi đè một dòng đã có — spec
 * KHÔNG được đổi trạng thái của hai dòng dùng chung này (xem `insurance-lifecycle.spec.ts`).
 */
export async function ensureInsuranceProducts(prisma: PrismaService): Promise<void> {
  const money = (v: number | null) => (v === null ? null : new Prisma.Decimal(v));
  await prisma.insuranceProduct.createMany({
    data: INSURANCE_PRODUCTS.map((p) => ({
      id: newId(),
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
      isActive: true,
    })),
    skipDuplicates: true,
  });
  /*
   * Spec báo giá `IV`/`IP` dựng kịch bản trên biểu phí NGÀY. Migration ADR 0088 đổi sản phẩm VCX
   * của MIC sang phí theo BẬC trên database đã có dòng — đưa về `daily` cho mọi spec (idempotent,
   * cùng một trạng thái mà mọi spec song song đều cần). Phí bậc có spec riêng, không qua dòng này.
   */
  await prisma.insuranceProduct.updateMany({
    where: {
      provider: INSURANCE_PROVIDER.MIC,
      premiumBasis: { not: INSURANCE_PREMIUM_BASIS.DAILY },
    },
    data: { premiumBasis: INSURANCE_PREMIUM_BASIS.DAILY },
  });
  /*
   * Migration ADR 0088 tắt sản phẩm tai nạn người (đợt này MIC chỉ bán vật chất xe). Spec báo giá
   * `IP` vẫn kiểm luồng chung của ADR 0064 qua adapter giả lập ⇒ bật lại, cùng lý do như trên.
   */
  await prisma.insuranceProduct.updateMany({
    where: { provider: INSURANCE_PROVIDER.MIC, isActive: false },
    data: { isActive: true },
  });
  /*
   * ADR 0098: biểu phí NGÀY sống ở chính sản phẩm (`daily_amount_*`), không còn ở chính sách phí.
   * Database trắng (CI: migrate → seed) có VCX theo bậc nên chưa có mức ngày — đặt mức mặc định
   * của luồng tiền v2 cho dòng còn trống, cùng số mà spec báo giá suy ra (50.000/15.000 · 20.000/5.000).
   */
  for (const [kind, daily] of Object.entries(DAILY_DEFAULTS)) {
    await prisma.insuranceProduct.updateMany({
      where: { provider: INSURANCE_PROVIDER.MIC, kind, dailyAmountCar: null },
      data: {
        dailyAmountCar: new Prisma.Decimal(daily[VEHICLE_TYPE.CAR]),
        dailyAmountMotorbike: new Prisma.Decimal(daily[VEHICLE_TYPE.MOTORBIKE]),
      },
    });
  }
}

const DAILY_DEFAULTS = {
  [INSURANCE_PRODUCT_KIND.VEHICLE_TRIP]: FEE_SCHEDULE_DEFAULTS.vehicleProtectionDailyAmount,
  [INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT]: FEE_SCHEDULE_DEFAULTS.tripInsuranceDailyAmount,
} as const;
