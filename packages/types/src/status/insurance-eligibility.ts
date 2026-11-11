import {
  INSURANCE_ELIGIBILITY_GAP,
  insurancePremiumTierFor,
  computeValueTierPremium,
  type InsuranceEligibilityGap,
  type InsurancePremiumTier,
  type VehicleProtectionTierQuote,
} from './insurance';
import { SERVICE_TYPE, VEHICLE_TYPE } from './vehicle';
import { requiredVehicleImageTypes } from './vehicle-settings';

/**
 * Điều kiện XE để được bán kèm bảo hiểm vật chất xe theo bậc (ADR 0088 điều 2) — một hàm thuần
 * cho cả ba nơi đọc: báo giá (API), cổng cấp đơn (worker), và màn chủ xe (web hiện việc còn thiếu).
 *
 * Mỗi điều kiện là một thứ MIC đòi lúc cấp hợp đồng hoặc là mẫu số của phí:
 *
 *  - ô tô — MIC chưa có sản phẩm theo chuyến cho xe máy;
 *  - giá trị xe — mẫu số của phí;
 *  - đủ ảnh bắt buộc của thư viện xe — gửi nguyên bộ đó sang MIC, chủ xe không chụp lại;
 *  - cà vẹt có số khung + tên chủ đăng ký — trường bắt buộc của hợp đồng MIC;
 *  - hãng, mẫu, năm sản xuất, số chỗ — trường bắt buộc của biểu phí và hợp đồng.
 */
export interface InsuranceEligibilityInput {
  vehicleType: string;
  insuredValue: string | null;
  brand: string | null;
  model: string | null;
  manufactureYear: number | null;
  seatCount: number | null;
  /** `image_type` của các ảnh đang có trong thư viện xe. */
  imageTypes: readonly (string | null)[];
  /** Cà vẹt CÒN HIỆU LỰC (chưa lưu trữ) — `null` khi chưa có. */
  registration: { chassisNumber: string | null; holderName: string | null } | null;
}

const filled = (value: string | null | undefined): boolean => (value ?? '').trim().length > 0;

/** Các điều kiện còn thiếu — rỗng = xe đủ điều kiện. Thứ tự cố định để giao diện liệt kê ổn định. */
export function insuranceEligibilityGaps(
  input: InsuranceEligibilityInput,
): InsuranceEligibilityGap[] {
  if (input.vehicleType !== VEHICLE_TYPE.CAR) return [INSURANCE_ELIGIBILITY_GAP.NOT_CAR];
  const gaps: InsuranceEligibilityGap[] = [];
  if (!filled(input.insuredValue) || !(Number(input.insuredValue) > 0)) {
    gaps.push(INSURANCE_ELIGIBILITY_GAP.INSURED_VALUE_MISSING);
  }
  const present = new Set(input.imageTypes.filter((t): t is string => t != null));
  if (requiredVehicleImageTypes(input.vehicleType).some((slot) => !present.has(slot))) {
    gaps.push(INSURANCE_ELIGIBILITY_GAP.PHOTOS_MISSING);
  }
  if (
    !input.registration ||
    !filled(input.registration.chassisNumber) ||
    !filled(input.registration.holderName)
  ) {
    gaps.push(INSURANCE_ELIGIBILITY_GAP.REGISTRATION_MISSING);
  }
  if (!filled(input.brand) || !filled(input.model) || !input.manufactureYear || !input.seatCount) {
    gaps.push(INSURANCE_ELIGIBILITY_GAP.VEHICLE_INFO_MISSING);
  }
  return gaps;
}

/**
 * Báo giá bảo hiểm theo bậc cho MỘT chuyến — `null` khi không bán kèm được: xe chưa đủ điều kiện,
 * không phải tự lái, hoặc chuyến dài hơn bậc cuối của biểu phí.
 */
export function vehicleProtectionTierQuote(input: {
  eligibility: InsuranceEligibilityInput;
  serviceType: string;
  tiers: readonly InsurancePremiumTier[];
  pickupAt: Date;
  returnAt: Date;
}): VehicleProtectionTierQuote | null {
  if (input.serviceType !== SERVICE_TYPE.SELF_DRIVE) return null;
  if (insuranceEligibilityGaps(input.eligibility).length > 0) return null;
  const tier = insurancePremiumTierFor(input.tiers, input.pickupAt, input.returnAt);
  if (!tier) return null;
  // Đủ điều kiện ⇒ `insuredValue` là chuỗi số dương; bỏ phần thập phân của Decimal (`…00.00`).
  const insuredValue = String(Math.trunc(Number(input.eligibility.insuredValue)));
  return {
    amount: computeValueTierPremium(insuredValue, tier.percent),
    insuredValue,
    maxDays: tier.maxDays,
    percent: tier.percent,
  };
}
