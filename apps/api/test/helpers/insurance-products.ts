import { newId, Prisma } from '@xeprime/prisma';
import { INSURANCE_PROVIDER } from '@xeprime/types';
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
}
