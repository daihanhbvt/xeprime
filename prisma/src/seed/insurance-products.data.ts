/**
 * Dữ liệu THUẦN của danh mục sản phẩm bảo hiểm — không side effect (không mở PrismaClient), để
 * spec API dựng đúng hai sản phẩm seed nạp (`apps/api/test/helpers/insurance-products.ts`) mà
 * không kéo `seed/context` vào. Seed (`insurance-products.ts`) đọc chính bảng này.
 */
import { INSURANCE_PRODUCT_KIND, type InsuranceProductKind } from '@xeprime/types';

export interface ProductSeed {
  kind: InsuranceProductKind;
  partnerProductCode: string;
  nameVi: string;
  nameEn: string;
  coverageVi: string;
  coverageEn: string;
  deductibleCar: number | null;
  deductibleMotorbike: number | null;
  maxPayoutCar: number | null;
  maxPayoutMotorbike: number | null;
  maxPayoutNoteVi: string | null;
  maxPayoutNoteEn: string | null;
  displayOrder: number;
}

export const CERTIFICATE_URL_TEMPLATE = 'https://staging-cert.mic.vn/view/{certCode}';

export const INSURANCE_PRODUCTS: readonly ProductSeed[] = [
  {
    kind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
    partnerProductCode: 'MIC-VCX',
    nameVi: 'Bảo hiểm vật chất xe MIC',
    nameEn: 'MIC Auto/Moto Damage Protection',
    coverageVi:
      'Đâm va, lật đổ, chìm, rơi, hoả hoạn, ngập nước (thuỷ kích), mất cắp bộ phận trong thời gian thuê.',
    coverageEn:
      'Collision, overturning, sinking, falling, fire, flooding (hydrolock) and theft of parts during the rental.',
    deductibleCar: 2_000_000,
    deductibleMotorbike: 500_000,
    maxPayoutCar: null,
    maxPayoutMotorbike: null,
    maxPayoutNoteVi: 'Theo giá trị thực tế của xe',
    maxPayoutNoteEn: "Up to the vehicle's actual value",
    displayOrder: 0,
  },
  {
    kind: INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT,
    partnerProductCode: 'MIC-NNTX',
    nameVi: 'Bảo hiểm tai nạn người trên xe MIC',
    nameEn: 'MIC Personal Accident Protection',
    coverageVi:
      'Tử vong, thương tật thân thể do tai nạn trong thời gian lưu hành trên xe thuê.',
    coverageEn: 'Death or bodily injury from an accident while travelling in the rented vehicle.',
    deductibleCar: null,
    deductibleMotorbike: null,
    maxPayoutCar: 50_000_000,
    maxPayoutMotorbike: 20_000_000,
    maxPayoutNoteVi: 'Mỗi người, mỗi vụ',
    maxPayoutNoteEn: 'Per person, per incident',
    displayOrder: 1,
  },
];
