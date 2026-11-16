/**
 * Dữ liệu THUẦN của danh mục sản phẩm bảo hiểm — không side effect (không mở PrismaClient), để
 * spec API dựng đúng hai sản phẩm seed nạp (`apps/api/test/helpers/insurance-products.ts`) mà
 * không kéo `seed/context` vào. Seed (`insurance-products.ts`) đọc chính bảng này.
 */
import {
  INSURANCE_PREMIUM_BASIS,
  INSURANCE_PRODUCT_KIND,
  MIC_VCX_TRIP_DEFAULT_TIERS,
  type InsurancePremiumBasis,
  type InsurancePremiumTier,
  type InsuranceProductKind,
} from '@xeprime/types';

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
  /** ADR 0088 — vắng = `daily`. */
  premiumBasis?: InsurancePremiumBasis;
  premiumTiers?: readonly InsurancePremiumTier[];
  claimHotline?: string | null;
  /**
   * Trạng thái lúc TẠO dòng (vắng = bật). Tai nạn người tắt: đợt này MIC chỉ bán vật chất xe (ADR 0088
   * điều 1); admin bật lại ở màn "Bảo hiểm".
   */
  isActive?: boolean;
}

/** Hotline bồi thường 24/7 của MIC. */
export const MIC_CLAIM_HOTLINE = '1900 558 891';

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
    // ADR 0088: VCX theo chuyến MIC (M1.11) — phí theo bậc giá trị xe, bắt buộc với xe đủ điều kiện.
    premiumBasis: INSURANCE_PREMIUM_BASIS.VALUE_TIER,
    premiumTiers: MIC_VCX_TRIP_DEFAULT_TIERS,
    claimHotline: MIC_CLAIM_HOTLINE,
  },
  {
    kind: INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT,
    partnerProductCode: 'MIC-NNTX',
    nameVi: 'Bảo hiểm tai nạn người trên xe MIC',
    nameEn: 'MIC Personal Accident Protection',
    coverageVi: 'Tử vong, thương tật thân thể do tai nạn trong thời gian lưu hành trên xe thuê.',
    coverageEn: 'Death or bodily injury from an accident while travelling in the rented vehicle.',
    deductibleCar: null,
    deductibleMotorbike: null,
    maxPayoutCar: 50_000_000,
    maxPayoutMotorbike: 20_000_000,
    maxPayoutNoteVi: 'Mỗi người, mỗi vụ',
    maxPayoutNoteEn: 'Per person, per incident',
    displayOrder: 1,
    claimHotline: MIC_CLAIM_HOTLINE,
    isActive: false,
  },
];
