import { Inject, Injectable } from '@nestjs/common';
import {
  INSURANCE_PREMIUM_BASIS,
  INSURANCE_PRODUCT_KIND,
  VEHICLE_TYPE,
  readInsurancePremiumTiers,
  readInsurancePremiumYearBands,
  type FeePolicySnapshot,
  type InsuranceOfferedByKind,
  type InsurancePremiumTier,
  type InsurancePremiumYearBand,
  type InsuranceProductKind,
  type PerVehicleTypeAmount,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { INSURANCE_PARTNER, type InsurancePartner } from './partner/insurance-partner.port';

/**
 * Biểu phí bậc ĐANG BÁN của bảo hiểm vật chất xe (ADR 0088 · ADR 0106): mốc ngày + % chung, và các
 * nhóm năm sản xuất khi đã đồng bộ từ hãng. Chọn % cho một xe bằng `insurancePremiumTiersForYear`.
 */
export interface VehicleTripPremiumSchedule {
  tiers: InsurancePremiumTier[];
  /** `null` = một biểu phí cho mọi năm sản xuất. */
  bands: InsurancePremiumYearBand[] | null;
}

const NOTHING_OFFERED: InsuranceOfferedByKind = { vehicleProtection: false, tripInsurance: false };

const NO_DAILY_RATE: PerVehicleTypeAmount = {
  [VEHICLE_TYPE.CAR]: '0',
  [VEHICLE_TYPE.MOTORBIKE]: '0',
};

/**
 * Phần bảo hiểm của chính sách phí khi tính tiền (ADR 0098): công tắc bán, biểu phí NGÀY và tên đối
 * tác — đọc từ sản phẩm bảo hiểm + đối tác đang chạy, không còn từ `fee_policies`.
 */
export type InsuranceFeePolicyOverlay = Pick<
  FeePolicySnapshot,
  | 'vehicleProtectionEnabled'
  | 'vehicleProtectionDailyAmount'
  | 'tripInsuranceEnabled'
  | 'tripInsuranceDailyAmount'
  | 'insurancePartnerName'
>;

/**
 * Bao lâu một câu trả lời "sản phẩm nào đang bật" được dùng lại trong CÙNG tiến trình.
 *
 * Câu hỏi này chạy ở mọi báo giá công khai và mọi thẻ của hộp thư gian hàng — một lượt đọc DB cho
 * một bảng hai dòng đổi vài lần một năm. Admin sửa sản phẩm ở CHÍNH tiến trình này thì bộ nhớ đệm
 * bị xoá ngay (`invalidate`); tiến trình API khác (deploy nhiều bản) thấy thay đổi chậm nhất sau
 * chừng này. Lượt duyệt vẫn đóng băng sản phẩm từ DB trong transaction của nó
 * (`freezeInsuranceProducts`), không từ bộ nhớ đệm này.
 */
export const INSURANCE_OFFER_CACHE_TTL_MS = 30_000;

/** Nguồn sản phẩm đang bật — chỉ phần `PrismaService` mà service này đọc (spec cắm bản giả). */
export type InsuranceProductSource = Pick<PrismaService, 'insuranceProduct'>;

/**
 * Nền tảng ĐANG bán bảo hiểm chuyến nào — MỘT câu trả lời cho mọi đường tính tiền (ADR 0028 điều
 * 5, ADR 0032 điều 4, ADR 0064): báo giá công khai, xem trước mã, duyệt yêu cầu (`commitDecision`
 * báo giá lại qua `PricingService`), dựng khoản giữ chỗ — và danh mục sản phẩm công khai.
 *
 * Một sản phẩm được bán khi đủ HAI điều:
 *   1. có đối tác phát hành — `configured` của CHÍNH adapter mà `InsuranceModule` chọn (cùng hàm
 *      `createInsurancePartner` worker dùng để phát hành). Không tự đọc lại `INSURANCE_PARTNER`:
 *      hai phép kiểm độc lập là hai câu trả lời có thể lệch nhau;
 *   2. sản phẩm loại đó đang BẬT trong danh mục `insurance_products` — admin tắt sản phẩm là thôi
 *      THU ở server, không chỉ ẩn ô chọn: client cũ gửi `selected = true` vẫn không có dòng `IV`/`IP`.
 *
 * Cổng của chính sách phí (`*Enabled`) và lựa chọn của khách là hai cổng KẾ TIẾP, xét trong
 * `computeCustomerFees`.
 *
 * Sống ở `InsuranceModule` (không ở `PricingModule`) vì `InsuranceProductsService` cần nó — để lọc
 * danh mục công khai và xoá bộ nhớ đệm khi admin sửa — và `PricingModule` đã import module này.
 */
@Injectable()
export class InsuranceOfferService {
  private cache: {
    kinds: ReadonlySet<string>;
    /** Biểu phí bậc của sản phẩm `IV` đang bật — `null` = sản phẩm tính theo ngày (ADR 0088). */
    vehicleTripTiers: InsurancePremiumTier[] | null;
    /** Nhóm năm sản xuất của biểu phí bậc (ADR 0106) — `null` = một biểu phí cho mọi năm. */
    vehicleTripYearBands: InsurancePremiumYearBand[] | null;
    /** % phí thu hộ của sản phẩm `IV` đang bật — `null` khi công tắc tắt (ADR 0091 điều 3). */
    vehicleTripServiceFeePercent: number | null;
    /** Biểu phí NGÀY của sản phẩm tính theo ngày đang bật, theo loại sản phẩm (ADR 0098). */
    dailyRates: Partial<Record<InsuranceProductKind, PerVehicleTypeAmount>>;
    at: number;
  } | null = null;
  /** Tăng mỗi lần `invalidate` — một lượt đọc bắt đầu TRƯỚC lần xoá không được ghi đè cache mới. */
  private generation = 0;

  constructor(
    @Inject(INSURANCE_PARTNER) private readonly partner: InsurancePartner,
    @Inject(PrismaService) private readonly products: InsuranceProductSource,
  ) {}

  async offeredByKind(): Promise<InsuranceOfferedByKind> {
    if (!this.partner.configured) return NOTHING_OFFERED;
    const { kinds } = await this.active();
    /*
     * Đối tác thật có thể chỉ phát hành MỘT loại (MIC: chỉ vật chất xe — ADR 0088). Bán một loại
     * không ai phát hành là thu tiền của một hợp đồng sẽ `failed` mãi mãi.
     */
    const supports = (kind: InsuranceProductKind) =>
      kinds.has(kind) && (this.partner.supportsKind?.(kind) ?? true);
    return {
      vehicleProtection: supports(INSURANCE_PRODUCT_KIND.VEHICLE_TRIP),
      tripInsurance: supports(INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT),
    };
  }

  /**
   * Biểu phí BẬC của bảo hiểm vật chất xe đang bán (ADR 0088) — `null` khi sản phẩm đang bán tính
   * theo NGÀY, hoặc không bán vật chất xe. Có giá trị ⇒ phí bắt buộc theo giá trị xe, thay biểu phí
   * ngày của `fee_policies`.
   */
  async vehicleTripTiers(): Promise<InsurancePremiumTier[] | null> {
    const offered = await this.offeredByKind();
    if (!offered.vehicleProtection) return null;
    return (await this.active()).vehicleTripTiers;
  }

  /**
   * Biểu phí bậc ĐẦY ĐỦ (mốc ngày + nhóm năm sản xuất — ADR 0106) của bảo hiểm vật chất xe đang bán.
   * `null` cùng nghĩa với `vehicleTripTiers`.
   */
  async vehicleTripSchedule(): Promise<VehicleTripPremiumSchedule | null> {
    const tiers = await this.vehicleTripTiers();
    if (!tiers) return null;
    return { tiers, bands: (await this.active()).vehicleTripYearBands };
  }

  /**
   * % phí thu hộ bảo hiểm của nền tảng trên `IV` (ADR 0091 điều 3) — `null` khi vật chất xe không
   * được bán hoặc công tắc của sản phẩm đang tắt. Một nguồn cho mọi đường tính tiền, cùng cổng với
   * `vehicleTripTiers`.
   */
  async vehicleTripServiceFeePercent(): Promise<number | null> {
    const offered = await this.offeredByKind();
    if (!offered.vehicleProtection) return null;
    return (await this.active()).vehicleTripServiceFeePercent;
  }

  /**
   * Phần bảo hiểm phủ lên chính sách phí trước khi tính tiền (ADR 0098) — một nguồn cho báo giá và
   * lượt duyệt. Loại không được bán ⇒ tắt và biểu phí 0; sản phẩm theo bậc ⇒ biểu phí ngày 0 (phí đi
   * qua `vehicleProtectionTier`). Tên đối tác lấy từ adapter đang chạy.
   */
  async feePolicyOverlay(): Promise<InsuranceFeePolicyOverlay> {
    const offered = await this.offeredByKind();
    const { dailyRates } = await this.active();
    return {
      vehicleProtectionEnabled: offered.vehicleProtection,
      vehicleProtectionDailyAmount: offered.vehicleProtection
        ? (dailyRates[INSURANCE_PRODUCT_KIND.VEHICLE_TRIP] ?? NO_DAILY_RATE)
        : NO_DAILY_RATE,
      tripInsuranceEnabled: offered.tripInsurance,
      tripInsuranceDailyAmount: offered.tripInsurance
        ? (dailyRates[INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT] ?? NO_DAILY_RATE)
        : NO_DAILY_RATE,
      insurancePartnerName:
        offered.vehicleProtection || offered.tripInsurance ? this.partner.partnerName : null,
    };
  }

  /** Một loại sản phẩm có đang được bán không — đọc cùng câu trả lời với `offeredByKind`. */
  static offers(offered: InsuranceOfferedByKind, kind: InsuranceProductKind): boolean {
    return kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP
      ? offered.vehicleProtection
      : offered.tripInsurance;
  }

  /** Xoá bộ nhớ đệm — `InsuranceProductsService.update` gọi SAU khi transaction sửa đã commit. */
  invalidate(): void {
    this.cache = null;
    this.generation += 1;
  }

  private async active(): Promise<{
    kinds: ReadonlySet<string>;
    vehicleTripTiers: InsurancePremiumTier[] | null;
    vehicleTripYearBands: InsurancePremiumYearBand[] | null;
    vehicleTripServiceFeePercent: number | null;
    dailyRates: Partial<Record<InsuranceProductKind, PerVehicleTypeAmount>>;
  }> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < INSURANCE_OFFER_CACHE_TTL_MS) return this.cache;
    const generation = this.generation;
    const active = await this.products.insuranceProduct.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      select: {
        kind: true,
        premiumBasis: true,
        premiumTiersJson: true,
        premiumYearBandsJson: true,
        serviceFeeEnabled: true,
        serviceFeePercent: true,
        dailyAmountCar: true,
        dailyAmountMotorbike: true,
      },
    });
    const dailyRates: Partial<Record<InsuranceProductKind, PerVehicleTypeAmount>> = {};
    for (const p of active) {
      if (p.premiumBasis !== INSURANCE_PREMIUM_BASIS.DAILY) continue;
      dailyRates[p.kind as InsuranceProductKind] = {
        [VEHICLE_TYPE.CAR]: p.dailyAmountCar?.toFixed(0) ?? '0',
        [VEHICLE_TYPE.MOTORBIKE]: p.dailyAmountMotorbike?.toFixed(0) ?? '0',
      };
    }
    const kinds = new Set(active.map((p) => p.kind));
    const vehicleTrip = active.find((p) => p.kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP);
    const isTier = vehicleTrip?.premiumBasis === INSURANCE_PREMIUM_BASIS.VALUE_TIER;
    const vehicleTripTiers = isTier
      ? readInsurancePremiumTiers(vehicleTrip.premiumTiersJson)
      : null;
    // Nhóm năm hỏng hình dạng ⇒ `null` = biểu phí chung (đường ghi đã kiểm, đây chỉ là phòng hờ).
    const vehicleTripYearBands = isTier
      ? readInsurancePremiumYearBands(vehicleTrip.premiumYearBandsJson, vehicleTripTiers)
      : null;
    // Sản phẩm bậc mà biểu phí hỏng ⇒ KHÔNG bán (không lặng lẽ rơi về biểu phí ngày).
    if (isTier && !vehicleTripTiers) kinds.delete(INSURANCE_PRODUCT_KIND.VEHICLE_TRIP);
    const serviceFeePercent = vehicleTrip?.serviceFeeEnabled
      ? Number(vehicleTrip.serviceFeePercent)
      : 0;
    const fresh = {
      kinds: kinds as ReadonlySet<string>,
      vehicleTripTiers,
      vehicleTripYearBands,
      vehicleTripServiceFeePercent: serviceFeePercent > 0 ? serviceFeePercent : null,
      dailyRates,
      at: now,
    };
    if (generation === this.generation) this.cache = fresh;
    return fresh;
  }
}
