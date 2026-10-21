import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  type InsuranceProductRow,
} from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
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

      const data: Prisma.InsuranceProductUpdateInput = {};
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
  };
}
