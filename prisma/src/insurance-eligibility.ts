import {
  INSURANCE_MODE,
  VEHICLE_DOCUMENT_TYPE,
  insuranceEligibilityGaps,
  isInsuranceMode,
  type InsuranceEligibilityInput,
  type InsuranceMode,
} from '@xeprime/types';
import type { Prisma } from '../generated/client';

/**
 * Cột của MỘT xe đủ để kiểm điều kiện bảo hiểm vật chất xe theo bậc (ADR 0088 điều 2) — một chỗ cho
 * báo giá (`InsuranceEligibilityService`) và snapshot chợ (`ListingsService`, ADR 0091 điều 1), để
 * "xe đủ điều kiện" có đúng một định nghĩa dữ liệu, như nó có đúng một hàm thuần.
 */
export const INSURANCE_ELIGIBILITY_VEHICLE_SELECT = {
  vehicleType: true,
  insuredValue: true,
  brand: true,
  model: true,
  manufactureYear: true,
  seatCount: true,
  images: { select: { imageType: true } },
  documents: {
    where: { type: VEHICLE_DOCUMENT_TYPE.REGISTRATION, archivedAt: null },
    orderBy: { updatedAt: 'desc' },
    take: 1,
    select: { chassisNumber: true, holderName: true },
  },
} satisfies Prisma.VehicleSelect;

export type InsuranceEligibilityVehicleRow = Prisma.VehicleGetPayload<{
  select: typeof INSURANCE_ELIGIBILITY_VEHICLE_SELECT;
}>;

/** Hàng DB → đầu vào của `insuranceEligibilityGaps`. */
export function insuranceEligibilityInputOf(
  row: InsuranceEligibilityVehicleRow,
): InsuranceEligibilityInput {
  return {
    vehicleType: row.vehicleType,
    insuredValue: row.insuredValue?.toFixed(0) ?? null,
    brand: row.brand,
    model: row.model,
    manufactureYear: row.manufactureYear,
    seatCount: row.seatCount,
    imageTypes: row.images.map((image) => image.imageType),
    registration: row.documents[0] ?? null,
  };
}

/**
 * Thứ tự ưu tiên chế độ bảo hiểm của một xe (ADR 0091 điều 1): bản ghi đè của xe → mặc định theo loại
 * xe → mặc định chung (`vehicle_type` NULL) → Tuỳ chọn. Cùng thứ tự với `PricingService.effectivePolicy`.
 */
export function resolveInsuranceMode(input: {
  override: string | null | undefined;
  typedDefault: string | null | undefined;
  legacyDefault: string | null | undefined;
}): InsuranceMode {
  for (const value of [input.override, input.typedDefault, input.legacyDefault]) {
    if (value != null) return isInsuranceMode(value) ? value : INSURANCE_MODE.OPTIONAL;
  }
  return INSURANCE_MODE.OPTIONAL;
}

/**
 * Xe Bắt buộc mà chưa đủ điều kiện bảo hiểm ⇒ không nhận đặt tự lái (ADR 0091 điều 1). Không xét
 * cổng của nền tảng: chỗ ĐỌC (tìm xe) mới hỏi nền tảng có đang bán bảo hiểm theo bậc không, nên đổi
 * đối tác/sản phẩm không làm snapshot sai.
 */
export function selfDriveInsuranceBlockedOf(
  mode: InsuranceMode,
  row: InsuranceEligibilityVehicleRow,
): boolean {
  return (
    mode === INSURANCE_MODE.REQUIRED &&
    insuranceEligibilityGaps(insuranceEligibilityInputOf(row)).length > 0
  );
}
