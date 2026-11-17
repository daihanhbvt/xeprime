import { Injectable } from '@nestjs/common';
import {
  INSURANCE_ELIGIBILITY_VEHICLE_SELECT,
  insuranceEligibilityInputOf,
  type Prisma,
} from '@xeprime/prisma';
import {
  insuranceEligibilityGaps,
  vehicleProtectionTierQuote,
  type InsuranceEligibilityGap,
  type InsuranceEligibilityInput,
  type VehicleProtectionTierQuote,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { InsuranceOfferService } from './insurance-offer.service';

type Db = PrismaService | Prisma.TransactionClient;

/** Tình trạng bảo hiểm của MỘT xe — cho màn chủ xe (việc còn thiếu) và trang xe công khai. */
export interface VehicleInsuranceStatus {
  /** Nền tảng đang bán bảo hiểm vật chất xe theo bậc (ADR 0088). `false` ⇒ ẩn hẳn khối này. */
  applies: boolean;
  eligible: boolean;
  gaps: InsuranceEligibilityGap[];
}

/**
 * Điều kiện XE + báo giá bảo hiểm vật chất xe THEO BẬC giá trị xe — ADR 0088 điều 2, 4.
 *
 * Đọc dữ liệu xe (giá trị xe, ảnh bắt buộc, cà vẹt, hãng/mẫu/năm/số chỗ) rồi giao cho hàm thuần
 * `insuranceEligibilityGaps` / `vehicleProtectionTierQuote` ở `@xeprime/types` — cùng hàm worker và
 * web dùng, nên "xe đủ điều kiện" có đúng một định nghĩa.
 */
@Injectable()
export class InsuranceEligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offer: InsuranceOfferService,
  ) {}

  /**
   * Báo giá bậc cho một chuyến — ba nghĩa, đúng đầu vào `vehicleProtectionTier` của
   * `computeCustomerFees`:
   *
   *  - `undefined` — sản phẩm đang bán tính theo NGÀY (hoặc không bán): đi đường cũ;
   *  - `null` — sản phẩm theo bậc nhưng xe/chuyến không đủ điều kiện ⇒ không có dòng `IV`;
   *  - báo giá — xe MUA ĐƯỢC; thu hay không do chế độ chủ xe + lựa chọn khách (ADR 0091).
   */
  async tierQuoteFor(
    input: { vehicleId: string; serviceType: string; pickupAt: Date; returnAt: Date },
    db: Db = this.prisma,
  ): Promise<VehicleProtectionTierQuote | null | undefined> {
    const tiers = await this.offer.vehicleTripTiers();
    if (!tiers) return undefined;
    const eligibility = await this.eligibilityInput(input.vehicleId, db);
    if (!eligibility) return null;
    return vehicleProtectionTierQuote({
      eligibility,
      serviceType: input.serviceType,
      tiers,
      pickupAt: input.pickupAt,
      returnAt: input.returnAt,
    });
  }

  /** Sản phẩm bậc có đang bán không — `true` ⇒ mọi báo giá phải có xe + lịch để tính `IV`. */
  async tierPricingActive(): Promise<boolean> {
    return (await this.offer.vehicleTripTiers()) !== null;
  }

  /** Tình trạng của một xe — caller đã kiểm phạm vi gian hàng. */
  async statusFor(vehicleId: string, db: Db = this.prisma): Promise<VehicleInsuranceStatus> {
    if (!(await this.tierPricingActive())) return { applies: false, eligible: false, gaps: [] };
    const input = await this.eligibilityInput(vehicleId, db);
    const gaps = input ? insuranceEligibilityGaps(input) : [];
    return { applies: true, eligible: input !== null && gaps.length === 0, gaps };
  }

  /** Dữ liệu xe cho phép kiểm điều kiện — `null` khi xe không tồn tại / đã xoá. */
  async eligibilityInput(
    vehicleId: string,
    db: Db = this.prisma,
  ): Promise<InsuranceEligibilityInput | null> {
    const vehicle = await db.vehicle.findFirst({
      where: { id: vehicleId, deletedAt: null },
      select: INSURANCE_ELIGIBILITY_VEHICLE_SELECT,
    });
    return vehicle ? insuranceEligibilityInputOf(vehicle) : null;
  }
}
