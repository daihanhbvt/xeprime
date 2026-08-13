import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  POLICY_SOURCE,
  PRICE_ROW,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  type BookingPriceSnapshot,
  type DeliveryTier,
  type DiscountTier,
  type PolicySource,
} from '@xeprime/types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DeliverySummaryDto,
  PriceBreakdownRowDto,
  PublicQuoteDto,
  QuoteBreakdownDto,
  RentalPolicyValuesDto,
  SaveRentalPolicyDto,
  ShopRentalPolicyDto,
} from './dto/pricing.dto';

const POLICY_SELECT = {
  id: true,
  vehicleId: true,
  depositAmount: true,
  deliveryEnabled: true,
  deliveryMaxRadiusKm: true,
  deliveryTiers: true,
  overtimeFeePerHour: true,
  overtimeGraceMinutes: true,
  overtimeRoundingMinutes: true,
  discountEnabled: true,
  discountTiers: true,
  updatedAt: true,
} satisfies Prisma.RentalPolicySelect;

type PolicyRow = Prisma.RentalPolicyGetPayload<{ select: typeof POLICY_SELECT }>;

/** Chính sách hiệu lực của một xe: bản ghi đè thắng mặc định gian hàng. */
export interface EffectivePolicy {
  values: RentalPolicyValuesDto;
  source: PolicySource;
}

/** Kết quả tra phí giao nhận theo khoảng cách. */
export type DeliveryFeeResult =
  { kind: 'auto'; fee: string } | { kind: 'manual_required' } | { kind: 'disabled' };

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Asia/Ho_Chi_Minh = UTC+7 cố định (không DST) — đủ để phân loại ngày cuối tuần. */
const TZ_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Nguồn tính giá DUY NHẤT của hệ thống (Wave 2 — B2).
 *
 * Public quote (marketplace), preview báo giá giao nhận và duyệt yêu cầu → tạo đơn đều đi qua
 * đây — không nơi nào tự cộng trừ tiền thuê. Quy tắc đã chốt:
 *
 *   - Cọc là số CỐ ĐỊNH, không nằm trong tổng khách trả, không chịu giảm giá.
 *   - Giảm giá theo mốc ngày thuê CHỈ áp lên tiền thuê cơ bản.
 *   - Phí giao nhận tính MỘT CHIỀU theo bậc khoảng cách; ngoài bán kính → báo giá thủ công.
 *   - Phí quá giờ chỉ là cấu hình ở Wave 2 (tính tiền thật ở luồng trả xe sau).
 *
 * Toàn bộ số học chạy trên Prisma.Decimal — không bao giờ dùng float cho tiền.
 */
@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Chính sách mặc định của gian hàng
  // -------------------------------------------------------------------------

  async getShopPolicy(tenantId: string): Promise<ShopRentalPolicyDto> {
    const [row, totalVehicles, overridden] = await this.prisma.$transaction([
      this.prisma.rentalPolicy.findFirst({
        where: { tenantId, vehicleId: null },
        select: POLICY_SELECT,
      }),
      this.prisma.vehicle.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.rentalPolicy.count({
        where: { tenantId, vehicleId: { not: null }, vehicle: { deletedAt: null } },
      }),
    ]);

    return {
      policy: row ? toValues(row) : null,
      inheritingVehicles: Math.max(0, totalVehicles - overridden),
      overriddenVehicles: overridden,
    };
  }

  /** Upsert chính sách mặc định + audit before/after trong một transaction. */
  async saveShopPolicy(
    tenantId: string,
    userId: string,
    dto: SaveRentalPolicyDto,
  ): Promise<ShopRentalPolicyDto> {
    this.validatePolicy(dto);

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.rentalPolicy.findFirst({
        where: { tenantId, vehicleId: null },
        select: POLICY_SELECT,
      });

      const data = policyData(dto);
      if (current) {
        await tx.rentalPolicy.update({ where: { id: current.id }, data });
      } else {
        // Partial unique `rental_policies_shop_default_key` là chốt chặn nếu hai request đua.
        await tx.rentalPolicy.create({ data: { id: newId(), tenantId, vehicleId: null, ...data } });
      }

      // Thay đổi nhạy cảm (ảnh hưởng giá mọi lượt đặt mới của cả gian hàng) → audit đầy đủ.
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'rental_policy.update',
          targetType: 'rental_policy',
          targetId: current?.id ?? null,
          before: current ? auditShape(current) : null,
          after: auditShape(data),
        },
        tx,
      );
    });

    return this.getShopPolicy(tenantId);
  }

  // -------------------------------------------------------------------------
  // Chính sách hiệu lực + tra cứu
  // -------------------------------------------------------------------------

  /** Bản ghi đè của xe thắng mặc định gian hàng; null khi cả hai đều chưa có. */
  async effectivePolicy(
    tenantId: string,
    vehicleId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<EffectivePolicy | null> {
    const db = tx ?? this.prisma;
    const rows = await db.rentalPolicy.findMany({
      where: { tenantId, OR: [{ vehicleId }, { vehicleId: null }] },
      select: POLICY_SELECT,
    });
    const override = rows.find((r) => r.vehicleId === vehicleId);
    const shop = rows.find((r) => r.vehicleId === null);
    if (override) return { values: toValues(override), source: POLICY_SOURCE.VEHICLE };
    if (shop) return { values: toValues(shop), source: POLICY_SOURCE.SHOP };
    return null;
  }

  /** Chính sách mặc định gian hàng (đối chiếu trên màn giá theo xe). */
  async shopPolicyValues(tenantId: string): Promise<RentalPolicyValuesDto | null> {
    const row = await this.prisma.rentalPolicy.findFirst({
      where: { tenantId, vehicleId: null },
      select: POLICY_SELECT,
    });
    return row ? toValues(row) : null;
  }

  // -------------------------------------------------------------------------
  // Hợp lệ hoá cấu hình (ràng buộc chéo — class-validator không mô tả được)
  // -------------------------------------------------------------------------

  /**
   * Ném VALIDATION_FAILED với thông điệp CỤ THỂ (thiết kế State C hiển thị đích danh lỗi):
   * bậc trùng/không tăng dần, bán kính hở khoảng so với mốc cuối, mốc ưu đãi trùng.
   */
  validatePolicy(dto: SaveRentalPolicyDto): void {
    if (dto.deliveryEnabled) {
      if (dto.deliveryTiers.length === 0) {
        throw invalid('Bật giao nhận thì phải có ít nhất một bậc khoảng cách');
      }
      if (dto.deliveryMaxRadiusKm == null) {
        throw invalid('Bật giao nhận thì phải nhập bán kính hỗ trợ tối đa');
      }
      for (let i = 1; i < dto.deliveryTiers.length; i++) {
        const prev = dto.deliveryTiers[i - 1]!.toKm;
        const curr = dto.deliveryTiers[i]!.toKm;
        if (curr <= prev) {
          throw invalid(
            `Các mốc khoảng cách phải tăng dần — mốc ${formatKm(curr)} km đứng sau mốc ${formatKm(prev)} km`,
          );
        }
      }
      const last = dto.deliveryTiers[dto.deliveryTiers.length - 1]!.toKm;
      if (dto.deliveryMaxRadiusKm !== last) {
        // Bán kính lệch mốc cuối = có đoạn không bậc nào phủ (hở khoảng) hoặc bậc vượt bán kính.
        throw invalid(
          dto.deliveryMaxRadiusKm > last
            ? `Có khoảng trống cấu hình giữa mốc ${formatKm(last)} km và ${formatKm(dto.deliveryMaxRadiusKm)} km`
            : `Bậc ${formatKm(last)} km vượt quá bán kính hỗ trợ ${formatKm(dto.deliveryMaxRadiusKm)} km`,
        );
      }
    }

    if (dto.discountEnabled && dto.discountTiers.length === 0) {
      throw invalid('Bật ưu đãi thì phải có ít nhất một mốc giảm giá');
    }
    for (let i = 1; i < dto.discountTiers.length; i++) {
      const prev = dto.discountTiers[i - 1]!.minDays;
      const curr = dto.discountTiers[i]!.minDays;
      if (curr <= prev) {
        throw invalid(
          curr === prev
            ? `Trùng mốc ưu đãi "từ ${curr} ngày"`
            : 'Các mốc ưu đãi phải theo số ngày tăng dần',
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Tính giá
  // -------------------------------------------------------------------------

  /**
   * Số ngày tính tiền: mỗi 24h (kể cả lẻ) là một ngày, tối thiểu 1 — đúng thông lệ thuê xe
   * tự lái theo ngày của tài liệu nghiệp vụ.
   */
  chargedDays(pickupAt: Date, returnAt: Date): number {
    return Math.max(1, Math.ceil((returnAt.getTime() - pickupAt.getTime()) / MS_PER_DAY));
  }

  /**
   * Tra phí giao nhận theo khoảng cách một chiều. Mốc biên thuộc về bậc đó (≤ toKm).
   *
   * **Wave 9: KHÔNG còn đường gọi nào trong luồng nghiệp vụ.** Vòng "báo giá theo khoảng cách
   * rồi mới duyệt" đã bỏ — giao nhận miễn phí lúc duyệt, chủ xe chốt phí đã thoả thuận trên đơn
   * (`BookingsService.updateDeliveryFee`). Giữ lại hàm cùng cấu hình bậc phí trong chính sách
   * gian hàng vì cấu hình đó vẫn sửa được và vẫn là dữ liệu của shop; nó chỉ đang không nuôi
   * quyết định nào. Đừng nối lại vào luồng duyệt mà không có quyết định sản phẩm mới.
   */
  deliveryFeeFor(policy: RentalPolicyValuesDto | null, distanceKm: number): DeliveryFeeResult {
    if (!policy?.deliveryEnabled) return { kind: 'disabled' };
    if (policy.deliveryMaxRadiusKm == null || distanceKm > policy.deliveryMaxRadiusKm) {
      return { kind: 'manual_required' };
    }
    const tier = policy.deliveryTiers.find((t) => distanceKm <= t.toKm);
    if (!tier) return { kind: 'manual_required' };
    return { kind: 'auto', fee: tier.fee };
  }

  /**
   * Breakdown giá đầy đủ cho một khoảng thuê. Giao nhận truyền vào dạng đã-biết-phí
   * (từ bậc tự động hoặc báo giá thủ công) — hàm này không tự quyết phí ngoài bán kính.
   */
  buildQuote(input: {
    weekdayPrice: string | null;
    weekendPrice: string | null;
    pickupAt: Date;
    returnAt: Date;
    policy: EffectivePolicy | null;
    delivery?: { fee: string; label: string } | null;
  }): QuoteBreakdownDto {
    if (!input.weekdayPrice) {
      throw invalid('Xe chưa có giá thuê theo ngày — cấu hình giá trước khi báo giá');
    }
    if (!(input.returnAt.getTime() > input.pickupAt.getTime())) {
      throw invalid('Thời điểm trả xe phải sau thời điểm nhận xe');
    }

    const days = this.chargedDays(input.pickupAt, input.returnAt);
    const weekday = new Prisma.Decimal(input.weekdayPrice);
    const weekend = input.weekendPrice ? new Prisma.Decimal(input.weekendPrice) : weekday;

    // Phân loại từng ngày tính tiền theo ngày bắt đầu của nó (giờ Việt Nam).
    let weekendDays = 0;
    for (let i = 0; i < days; i++) {
      const dow = new Date(input.pickupAt.getTime() + i * MS_PER_DAY + TZ_OFFSET_MS).getUTCDay();
      if (dow === 0 || dow === 6) weekendDays += 1;
    }
    const weekdayDays = days - weekendDays;
    const splitRates = weekendDays > 0 && !weekend.equals(weekday);

    const base = weekday.mul(weekdayDays).plus(weekend.mul(weekendDays));

    const rows: PriceBreakdownRowDto[] = [
      {
        key: PRICE_ROW.BASE,
        label: 'Tiền thuê gốc',
        sublabel: splitRates
          ? `${weekdayDays} ngày thường × ${vnd(weekday)} · ${weekendDays} ngày cuối tuần × ${vnd(weekend)}`
          : `${days} ngày × ${vnd(weekday)}/ngày`,
        amount: base.toFixed(0),
      },
    ];

    // Giảm giá CHỈ áp lên tiền thuê cơ bản (quy tắc 6–7): mốc cao nhất mà days đạt tới.
    const policy = input.policy?.values ?? null;
    let discount = new Prisma.Decimal(0);
    if (policy?.discountEnabled) {
      const tier = [...policy.discountTiers]
        .filter((t) => days >= t.minDays)
        .sort((a, b) => b.minDays - a.minDays)[0];
      if (tier) {
        discount = base.mul(tier.percent).div(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
        rows.push({
          key: PRICE_ROW.DISCOUNT,
          label: `Ưu đãi giảm giá (${tier.percent}%)`,
          sublabel: tier.note ?? `Mốc thuê từ ${tier.minDays} ngày`,
          amount: discount.negated().toFixed(0),
        });
        rows.push({
          key: PRICE_ROW.SUBTOTAL,
          label: 'Giá sau chiết khấu',
          sublabel: null,
          amount: base.minus(discount).toFixed(0),
        });
      }
    }

    let deliveryFee = new Prisma.Decimal(0);
    if (input.delivery) {
      deliveryFee = new Prisma.Decimal(input.delivery.fee);
      rows.push({
        key: PRICE_ROW.DELIVERY,
        label: 'Phí giao nhận xe',
        sublabel: input.delivery.label,
        amount: deliveryFee.toFixed(0),
      });
    }

    // Hai dòng 0đ có chủ đích (thiết kế breakdown): tại thời điểm chốt đơn chưa phát sinh.
    rows.push({
      key: PRICE_ROW.OVERTIME,
      label: 'Phí phát sinh ngoài giờ',
      sublabel: null,
      amount: '0',
    });
    rows.push({ key: PRICE_ROW.EXTRAS, label: 'Dịch vụ cộng thêm', sublabel: null, amount: '0' });

    const total = base.minus(discount).plus(deliveryFee);

    return {
      days,
      rows,
      totalAmount: total.toFixed(0),
      depositAmount: policy ? new Prisma.Decimal(policy.depositAmount).toFixed(0) : '0',
      policySource: input.policy?.source ?? null,
      policyUpdatedAt: policy?.updatedAt ?? null,
    };
  }

  /** Snapshot bất biến ghi vào `bookings.price_snapshot_json` lúc tạo đơn từ báo giá. */
  buildSnapshot(
    breakdown: QuoteBreakdownDto,
    policy: EffectivePolicy | null,
  ): BookingPriceSnapshot {
    return {
      calculatedAt: new Date().toISOString(),
      source: 'quote',
      currency: 'VND',
      days: breakdown.days,
      rows: breakdown.rows.map((r) => ({
        key: r.key as BookingPriceSnapshot['rows'][number]['key'],
        label: r.label,
        ...(r.sublabel ? { sublabel: r.sublabel } : {}),
        amount: r.amount,
      })),
      totalAmount: breakdown.totalAmount,
      depositAmount: breakdown.depositAmount,
      policy: policy
        ? {
            source: policy.source,
            updatedAt: policy.values.updatedAt,
            depositAmount: policy.values.depositAmount,
            deliveryEnabled: policy.values.deliveryEnabled,
            deliveryMaxRadiusKm: policy.values.deliveryMaxRadiusKm,
            deliveryTiers: policy.values.deliveryTiers,
            overtimeFeePerHour: policy.values.overtimeFeePerHour,
            overtimeGraceMinutes: policy.values.overtimeGraceMinutes,
            overtimeRoundingMinutes: policy.values.overtimeRoundingMinutes,
            discountEnabled: policy.values.discountEnabled,
            discountTiers: policy.values.discountTiers,
          }
        : null,
    };
  }

  // -------------------------------------------------------------------------
  // Public quote (marketplace)
  // -------------------------------------------------------------------------

  /** Báo giá công khai cho một xe đã duyệt — CHƯA gồm phí giao nhận (phụ thuộc khoảng cách). */
  async publicQuote(
    vehicleId: string,
    pickupAt: string,
    returnAt: string,
  ): Promise<PublicQuoteDto> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        deletedAt: null,
        publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
        tenant: { status: TENANT_STATUS.ACTIVE, deletedAt: null },
      },
      select: { id: true, tenantId: true, weekdayPrice: true, weekendPrice: true },
    });
    if (!vehicle) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Xe không khả dụng để báo giá',
      });
    }

    const policy = await this.effectivePolicy(vehicle.tenantId, vehicle.id);
    const breakdown = this.buildQuote({
      weekdayPrice: decimalToString(vehicle.weekdayPrice),
      weekendPrice: decimalToString(vehicle.weekendPrice),
      pickupAt: new Date(pickupAt),
      returnAt: new Date(returnAt),
      policy,
      delivery: null,
    });

    const delivery: DeliverySummaryDto = policy?.values.deliveryEnabled
      ? {
          enabled: true,
          maxRadiusKm: policy.values.deliveryMaxRadiusKm,
          tiers: policy.values.deliveryTiers,
        }
      : { enabled: false, maxRadiusKm: null, tiers: [] };

    return { breakdown, delivery };
  }
}

// ---------------------------------------------------------------------------
// Helpers thuần
// ---------------------------------------------------------------------------

function toValues(row: PolicyRow): RentalPolicyValuesDto {
  return {
    depositAmount: row.depositAmount.toFixed(0),
    deliveryEnabled: row.deliveryEnabled,
    deliveryMaxRadiusKm: row.deliveryMaxRadiusKm ? Number(row.deliveryMaxRadiusKm) : null,
    deliveryTiers: (row.deliveryTiers as unknown as DeliveryTier[]) ?? [],
    overtimeFeePerHour: row.overtimeFeePerHour ? row.overtimeFeePerHour.toFixed(0) : null,
    overtimeGraceMinutes: row.overtimeGraceMinutes,
    overtimeRoundingMinutes: row.overtimeRoundingMinutes,
    discountEnabled: row.discountEnabled,
    discountTiers: (row.discountTiers as unknown as DiscountTier[]) ?? [],
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Payload Prisma từ DTO đã validate — tiers ghi nguyên trạng (đã qua class-validator + chéo).
 * Export cho VehiclesService (writer của bản ghi đè theo xe) dùng chung mapping, không chép tay.
 */
export function policyData(dto: SaveRentalPolicyDto) {
  return {
    depositAmount: new Prisma.Decimal(dto.depositAmount),
    deliveryEnabled: dto.deliveryEnabled,
    deliveryMaxRadiusKm: dto.deliveryEnabled ? new Prisma.Decimal(dto.deliveryMaxRadiusKm!) : null,
    deliveryTiers: dto.deliveryTiers as unknown as Prisma.InputJsonValue,
    overtimeFeePerHour:
      dto.overtimeFeePerHour != null ? new Prisma.Decimal(dto.overtimeFeePerHour) : null,
    overtimeGraceMinutes: dto.overtimeGraceMinutes ?? null,
    overtimeRoundingMinutes: dto.overtimeRoundingMinutes ?? null,
    discountEnabled: dto.discountEnabled,
    discountTiers: dto.discountTiers as unknown as Prisma.InputJsonValue,
  };
}

/** Bản ghi audit gọn — Decimal → string để jsonb không mang object lạ. */
function auditShape(data: {
  depositAmount: Prisma.Decimal;
  deliveryEnabled: boolean;
  deliveryMaxRadiusKm: Prisma.Decimal | null;
  deliveryTiers: unknown;
  overtimeFeePerHour: Prisma.Decimal | null;
  overtimeGraceMinutes: number | null;
  overtimeRoundingMinutes: number | null;
  discountEnabled: boolean;
  discountTiers: unknown;
}): Record<string, unknown> {
  return {
    depositAmount: data.depositAmount.toFixed(0),
    deliveryEnabled: data.deliveryEnabled,
    deliveryMaxRadiusKm: data.deliveryMaxRadiusKm ? Number(data.deliveryMaxRadiusKm) : null,
    deliveryTiers: data.deliveryTiers,
    overtimeFeePerHour: data.overtimeFeePerHour ? data.overtimeFeePerHour.toFixed(0) : null,
    overtimeGraceMinutes: data.overtimeGraceMinutes,
    overtimeRoundingMinutes: data.overtimeRoundingMinutes,
    discountEnabled: data.discountEnabled,
    discountTiers: data.discountTiers,
  };
}

function decimalToString(value: Prisma.Decimal | null): string | null {
  return value ? value.toFixed(0) : null;
}

/** '800000' → '800.000đ' — chỉ dùng cho sublabel của snapshot/breakdown (tài liệu tự đọc). */
function vnd(value: Prisma.Decimal): string {
  return `${new Intl.NumberFormat('vi-VN').format(BigInt(value.toFixed(0)))}đ`;
}

function formatKm(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ code: API_ERROR_CODE.VALIDATION_FAILED, message });
}
