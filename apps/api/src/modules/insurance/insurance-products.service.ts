import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type InsuranceProductRow } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  INSURANCE_PREMIUM_BASIS,
  INSURANCE_PRODUCT_KIND,
  insurancePremiumTiersProblem,
  readInsurancePremiumTiers,
  VEHICLE_TYPE,
  type InsuranceProductKind,
  type InsuranceProvider,
  type VehicleType,
} from '@xeprime/types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InsuranceOfferService } from './insurance-offer.service';
import type {
  InsuranceProductDto,
  PublicInsuranceProductDto,
  UpdateInsuranceProductDto,
} from './dto/insurance.dto';

type ProductRow = InsuranceProductRow;

const MONEY_FIELDS = [
  'deductibleCar',
  'deductibleMotorbike',
  'maxPayoutCar',
  'maxPayoutMotorbike',
] as const satisfies readonly (keyof UpdateInsuranceProductDto)[];

/** Bước giá của luồng tiền v2 — khấu trừ/bồi thường hiện cạnh phí ngày, không sinh số lẻ. */
const MONEY_STEP = 1000;

/**
 * DANH MỤC sản phẩm bảo hiểm — ADR 0064. Writer duy nhất của `insurance_products`.
 *
 * Bảng này mô tả sản phẩm (tên, quyền lợi, khấu trừ, mẫu URL GCN) và bật/tắt hiển thị. Biểu phí
 * NGÀY có phiên bản ở `fee_policies` và không bao giờ được sửa ở đây.
 *
 * Sửa danh mục KHÔNG viết lại hợp đồng đã bán: `reserveForBookingWithinTx` đóng băng một bản
 * snapshot vào từng hợp đồng lúc đơn ra đời.
 */
@Injectable()
export class InsuranceProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly offer: InsuranceOfferService,
  ) {}

  async listForPlatform(): Promise<InsuranceProductDto[]> {
    const rows = await this.prisma.insuranceProduct.findMany({
      orderBy: [{ displayOrder: 'asc' }, { kind: 'desc' }],
    });
    return rows.map(toAdminDto);
  }

  /**
   * Danh mục công khai cho đúng loại xe — chỉ sản phẩm nền tảng ĐANG BÁN.
   *
   * "Đang bật" chưa đủ: chưa cắm đối tác (`INSURANCE_PARTNER=none`, production hiện nay) thì báo
   * giá không chào ô tích nào, và một danh mục vẫn kể quyền lợi của sản phẩm không ai mua được là
   * nói với khách một điều server sẽ từ chối. Cùng MỘT câu trả lời với máy giá
   * (`InsuranceOfferService.offeredByKind`) — không có phép kiểm thứ hai.
   */
  async listPublic(vehicleType: VehicleType): Promise<PublicInsuranceProductDto[]> {
    const offered = await this.offer.offeredByKind();
    if (!offered.vehicleProtection && !offered.tripInsurance) return [];
    const rows = (
      await this.prisma.insuranceProduct.findMany({
        where: { isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { kind: 'desc' }],
      })
    ).filter((r) => InsuranceOfferService.offers(offered, r.kind as InsuranceProductKind));
    const isMoto = vehicleType === VEHICLE_TYPE.MOTORBIKE;
    return rows.map((r) => ({
      kind: r.kind as InsuranceProductKind,
      provider: r.provider as InsuranceProvider,
      nameVi: r.nameVi,
      nameEn: r.nameEn,
      coverageVi: r.coverageVi,
      coverageEn: r.coverageEn,
      deductibleAmount: money(isMoto ? r.deductibleMotorbike : r.deductibleCar),
      maxPayoutAmount: money(isMoto ? r.maxPayoutMotorbike : r.maxPayoutCar),
      maxPayoutNoteVi: r.maxPayoutNoteVi,
      maxPayoutNoteEn: r.maxPayoutNoteEn,
      mandatory: r.premiumBasis === INSURANCE_PREMIUM_BASIS.VALUE_TIER,
      claimHotline: r.claimHotline,
    }));
  }

  async update(
    id: string,
    dto: UpdateInsuranceProductDto,
    actorUserId: string,
  ): Promise<InsuranceProductDto> {
    for (const field of MONEY_FIELDS) {
      const value = dto[field];
      if (typeof value === 'string' && Number(value) % MONEY_STEP !== 0) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: 'Số tiền phải là bội số của 1.000đ',
          details: { field },
        });
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await tx.insuranceProduct.findUnique({ where: { id } });
      if (!before) {
        throw new NotFoundException({
          code: API_ERROR_CODE.NOT_FOUND,
          message: 'Không tìm thấy sản phẩm bảo hiểm',
        });
      }

      /*
       * Cách tính phí (ADR 0088): bậc chỉ cho vật chất xe, và luôn đi cùng một biểu phí hợp lệ —
       * kiểm ở đây để trả lỗi có nghĩa, CHECK `insurance_products_value_tier_check` là chốt sau.
       */
      const basis = dto.premiumBasis ?? before.premiumBasis;
      const tiers = dto.premiumTiers ?? readInsurancePremiumTiers(before.premiumTiersJson);
      if (basis === INSURANCE_PREMIUM_BASIS.VALUE_TIER) {
        if (before.kind !== INSURANCE_PRODUCT_KIND.VEHICLE_TRIP) {
          throw invalidProduct('Chỉ bảo hiểm vật chất xe được tính phí theo bậc giá trị xe');
        }
        const problem = tiers ? insurancePremiumTiersProblem(tiers) : 'Cần biểu phí bậc';
        if (problem) throw invalidProduct(problem, 'premiumTiers');
      }

      const data: Prisma.InsuranceProductUpdateInput = {};
      if (dto.premiumBasis !== undefined) data.premiumBasis = dto.premiumBasis;
      if (dto.premiumTiers !== undefined) {
        data.premiumTiersJson = dto.premiumTiers.map((t) => ({
          maxDays: t.maxDays,
          percent: t.percent,
        }));
      }
      if (dto.claimHotline !== undefined) data.claimHotline = dto.claimHotline?.trim() || null;
      /*
       * Phí thu hộ bảo hiểm của nền tảng (ADR 0091 điều 3): chỉ vật chất xe, bật thì % > 0 — nói rõ ở
       * đây; CHECK `insurance_products_service_fee_scope_check` là chốt sau.
       */
      const feeEnabled = dto.serviceFeeEnabled ?? before.serviceFeeEnabled;
      const feePercent = dto.serviceFeePercent ?? Number(before.serviceFeePercent);
      if (feeEnabled && before.kind !== INSURANCE_PRODUCT_KIND.VEHICLE_TRIP) {
        throw invalidProduct('Chỉ bảo hiểm vật chất xe có phí thu hộ', 'serviceFeeEnabled');
      }
      if (feeEnabled && !(feePercent > 0)) {
        throw invalidProduct('Bật phí thu hộ thì % phải lớn hơn 0', 'serviceFeePercent');
      }
      if (dto.serviceFeeEnabled !== undefined) data.serviceFeeEnabled = dto.serviceFeeEnabled;
      if (dto.serviceFeePercent !== undefined) {
        data.serviceFeePercent = new Prisma.Decimal(dto.serviceFeePercent);
      }
      const assign = <K extends keyof UpdateInsuranceProductDto>(key: K) => {
        if (dto[key] !== undefined) (data as Record<string, unknown>)[key] = dto[key];
      };
      (
        [
          'partnerProductCode',
          'nameVi',
          'nameEn',
          'coverageVi',
          'coverageEn',
          'maxPayoutNoteVi',
          'maxPayoutNoteEn',
          'certificateUrlTemplate',
          'displayOrder',
          'isActive',
        ] as const
      ).forEach(assign);
      for (const field of MONEY_FIELDS) {
        const value = dto[field];
        if (value !== undefined) data[field] = value === null ? null : new Prisma.Decimal(value);
      }
      // Ghi chú rỗng là "không có ghi chú", không phải một chuỗi rỗng hiện cho khách.
      if (data.maxPayoutNoteVi === '') data.maxPayoutNoteVi = null;
      if (data.maxPayoutNoteEn === '') data.maxPayoutNoteEn = null;

      const after = await tx.insuranceProduct.update({ where: { id }, data });
      await this.audit.record(
        {
          tenantId: null,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'insurance_product.update',
          targetType: 'insurance_product',
          targetId: id,
          before: toAdminDto(before),
          after: toAdminDto(after),
        },
        tx,
      );
      return toAdminDto(after);
    });
    // SAU commit: xoá trước commit là để một lượt đọc chen giữa nạp lại trạng thái CŨ vào cache.
    this.offer.invalidate();
    return updated;
  }
}

function invalidProduct(message: string, field?: string): BadRequestException {
  return new BadRequestException({
    code: API_ERROR_CODE.VALIDATION_FAILED,
    message,
    ...(field ? { details: { field } } : {}),
  });
}

function money(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toFixed(0);
}

function toAdminDto(r: ProductRow): InsuranceProductDto {
  return {
    id: r.id,
    kind: r.kind as InsuranceProductKind,
    provider: r.provider as InsuranceProvider,
    partnerProductCode: r.partnerProductCode,
    nameVi: r.nameVi,
    nameEn: r.nameEn,
    coverageVi: r.coverageVi,
    coverageEn: r.coverageEn,
    deductibleCar: money(r.deductibleCar),
    deductibleMotorbike: money(r.deductibleMotorbike),
    maxPayoutCar: money(r.maxPayoutCar),
    maxPayoutMotorbike: money(r.maxPayoutMotorbike),
    maxPayoutNoteVi: r.maxPayoutNoteVi,
    maxPayoutNoteEn: r.maxPayoutNoteEn,
    certificateUrlTemplate: r.certificateUrlTemplate,
    displayOrder: r.displayOrder,
    isActive: r.isActive,
    updatedAt: r.updatedAt.toISOString(),
    premiumBasis:
      r.premiumBasis === INSURANCE_PREMIUM_BASIS.VALUE_TIER
        ? INSURANCE_PREMIUM_BASIS.VALUE_TIER
        : INSURANCE_PREMIUM_BASIS.DAILY,
    premiumTiers: readInsurancePremiumTiers(r.premiumTiersJson),
    claimHotline: r.claimHotline,
    serviceFeeEnabled: r.serviceFeeEnabled,
    serviceFeePercent: Number(r.serviceFeePercent),
  };
}
