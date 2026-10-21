/**
 * Danh mục sản phẩm bảo hiểm chuyến — dữ liệu NỀN (SEED_MODE=system), ADR 0064.
 *
 * Hai sản phẩm MIC theo `docs/financial-system-architecture.md` §8.1. Biểu phí NGÀY không nằm
 * ở đây — nó có phiên bản ở `fee_policies`. Ở đây là phần mô tả hiện cho khách: tên, quyền lợi,
 * mức khấu trừ, mức bồi thường tối đa, mẫu URL tra cứu GCN.
 *
 * Seed chỉ TẠO MỚI (`update: {}`): admin sửa quyền lợi/bật tắt ở màn "Bảo hiểm", và chạy lại seed
 * không được ghi đè chỉnh sửa đó. Khoá tự nhiên `(provider, kind)` nên chạy lại bao nhiêu lần cũng
 * chỉ có hai dòng.
 *
 * Mẫu URL trỏ về trang tra cứu THỬ NGHIỆM: chưa có hợp đồng MIC thật, và GCN duy nhất phát hành
 * được hiện nay là GCN `TEST-…` của adapter giả lập (`INSURANCE_PARTNER=mic_mock`).
 */
import { INSURANCE_PROVIDER } from '@xeprime/types';
import { Prisma } from '../index';
import { prisma, seedId } from './context';
import { CERTIFICATE_URL_TEMPLATE, INSURANCE_PRODUCTS } from './insurance-products.data';

const money = (v: number | null) => (v === null ? null : new Prisma.Decimal(v));

export async function seedInsuranceProducts(): Promise<number> {
  for (const p of INSURANCE_PRODUCTS) {
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
        deductibleCar: money(p.deductibleCar),
        deductibleMotorbike: money(p.deductibleMotorbike),
        maxPayoutCar: money(p.maxPayoutCar),
        maxPayoutMotorbike: money(p.maxPayoutMotorbike),
        maxPayoutNoteVi: p.maxPayoutNoteVi,
        maxPayoutNoteEn: p.maxPayoutNoteEn,
        certificateUrlTemplate: CERTIFICATE_URL_TEMPLATE,
        displayOrder: p.displayOrder,
        isActive: true,
      },
    });
  }
  return INSURANCE_PRODUCTS.length;
}
