import {
  computeValueTierPremium,
  insuranceRemittanceCommission,
  percentOfVnd,
  type InsurancePremiumTier,
} from '@xeprime/types';

/**
 * Bảng phí bảo hiểm vật chất xe theo từng bậc cho MỘT giá trị xe — màn quản trị (ADR 0097).
 *
 * Không có công thức mới: phí bậc là `computeValueTierPremium` (cùng hàm báo giá), phí thu hộ là
 * `percentOfVnd` (cùng hàm bảng phí khách), hoa hồng là `insuranceRemittanceCommission` (cùng hàm
 * bảng kê). Hoa hồng ở đây tính theo TỪNG hợp đồng để ước tính; bảng kê tính một lần trên tổng tháng
 * nên có thể lệch vài đồng do làm tròn.
 */
export interface PremiumPlanRow {
  maxDays: number;
  percent: string;
  /** Phí bảo hiểm (= phí MIC theo bảng bậc). */
  premium: string;
  /** Phí thu hộ của nền tảng trên phí trên — "0" khi tắt. */
  serviceFee: string;
  /** Khách trả = phí + phí thu hộ. */
  customerPays: string;
  /** Hoa hồng đại lý MIC trả lại XePrime. */
  commission: string;
  /** XePrime chuyển MIC = phí - hoa hồng. */
  netToPartner: string;
  /** XePrime giữ lại = phí thu hộ + hoa hồng. */
  platformEarns: string;
}

export interface PremiumPlanConfig {
  tiers: readonly InsurancePremiumTier[];
  /** `null` / 0 = phí thu hộ đang tắt. */
  serviceFeePercent: number | null;
  /** % hoa hồng đại lý, 0..50, tối đa hai chữ số lẻ. */
  agencyCommissionPercent: number;
}

/** Chuẩn hoá một % về chuỗi `\d{1,2}(\.\d{1,2})?` mà hàm hoa hồng nhận. */
function percentString(value: number): string {
  const rounded = Math.round(Math.max(0, value) * 100) / 100;
  return String(rounded);
}

/** `null` khi giá trị xe không phải số nguyên đồng dương — ô nhập đang dở. */
export function premiumPlan(
  insuredValue: string,
  config: PremiumPlanConfig,
): PremiumPlanRow[] | null {
  if (!/^\d+$/.test(insuredValue) || BigInt(insuredValue) <= BigInt(0)) return null;
  const serviceFeePercent =
    config.serviceFeePercent != null && config.serviceFeePercent > 0 ? config.serviceFeePercent : 0;
  const commissionPercent = percentString(config.agencyCommissionPercent);
  return config.tiers.map((tier) => {
    const premium = computeValueTierPremium(insuredValue, tier.percent);
    const serviceFee =
      serviceFeePercent > 0 ? String(percentOfVnd(Number(premium), serviceFeePercent)) : '0';
    const commission = insuranceRemittanceCommission(premium, commissionPercent);
    return {
      maxDays: tier.maxDays,
      percent: tier.percent,
      premium,
      serviceFee,
      customerPays: (BigInt(premium) + BigInt(serviceFee)).toString(),
      commission,
      netToPartner: (BigInt(premium) - BigInt(commission)).toString(),
      platformEarns: (BigInt(serviceFee) + BigInt(commission)).toString(),
    };
  });
}

/** Bậc trước của một bậc — để hiện "từ X tới Y ngày". `0` với bậc đầu. */
export function previousTierDays(tiers: readonly InsurancePremiumTier[], index: number): number {
  return index > 0 ? (tiers[index - 1]?.maxDays ?? 0) : 0;
}

/**
 * Cấu hình bảng phí từ một sản phẩm (đang lưu hoặc đang sửa trên form) — `null` khi sản phẩm không có
 * biểu phí bậc hợp lệ.
 */
export function premiumConfigOf(product: {
  premiumTiers?: readonly InsurancePremiumTier[] | null;
  serviceFeeEnabled: boolean;
  serviceFeePercent: number;
  agencyCommissionPercent: number;
}): PremiumPlanConfig | null {
  const tiers = product.premiumTiers ?? [];
  if (tiers.length === 0) return null;
  return {
    tiers,
    serviceFeePercent: product.serviceFeeEnabled ? product.serviceFeePercent : null,
    agencyCommissionPercent: product.agencyCommissionPercent,
  };
}
