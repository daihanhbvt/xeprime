import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type InsuranceProductRow } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  INSURANCE_PREMIUM_BASIS,
  INSURANCE_PREMIUM_SYNC_STATUS,
  INSURANCE_PRODUCT_KIND,
  insurancePremiumTiersProblem,
  insurancePremiumYearBandsProblem,
  readInsurancePremiumTiers,
  readInsurancePremiumYearBands,
  VEHICLE_TYPE,
  type InsurancePremiumSyncStatus,
  type InsurancePremiumTier,
  type InsurancePremiumYearBand,
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
  'dailyAmountCar',
  'dailyAmountMotorbike',
] as const satisfies readonly (keyof UpdateInsuranceProductDto)[];

/** Bước giá của luồng tiền v2 — khấu trừ/bồi thường hiện cạnh phí ngày, không sinh số lẻ. */
const MONEY_STEP = 1000;

/** Sản phẩm vật chất xe tính theo bậc — đích của đồng bộ biểu phí và của đánh dấu lệch (ADR 0106). */
const VEHICLE_TRIP_TIER_PRODUCT = {
  where: {
    kind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
    premiumBasis: INSURANCE_PREMIUM_BASIS.VALUE_TIER,
  },
  orderBy: [{ isActive: 'desc' }, { displayOrder: 'asc' }],
} satisfies Prisma.InsuranceProductFindFirstArgs;

/**
 * DANH MỤC sản phẩm bảo hiểm — ADR 0064. Writer duy nhất của `insurance_products`.
 *
 * Bảng này mô tả sản phẩm (tên, quyền lợi, khấu trừ, mẫu URL GCN) và bật/tắt hiển thị. Biểu phí
 * NGÀY của sản phẩm tính theo ngày cũng sống ở đây (ADR 0098 chuyển từ `fee_policies`): sửa chỉ
 * áp cho báo giá từ lúc lưu — đơn đã có giữ số trong snapshot của nó.
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
      const beforeTiers = readInsurancePremiumTiers(before.premiumTiersJson);
      const beforeBands = readInsurancePremiumYearBands(before.premiumYearBandsJson, beforeTiers);
      /*
       * Biểu phí ĐANG ĐỒNG BỘ từ hãng thì khoá (ADR 0106 điều 2) — đồng bộ hỏng hay lượt duyệt thấy hãng
       * báo khác (`failed` / `drifted`) mới mở cho sửa tay. Gửi lại đúng số đang có (client cũ gửi
       * cả form) không phải là sửa.
       */
      // `yearFrom`/`yearTo` vắng trên dây = `null` (mở về một phía).
      const dtoBands: InsurancePremiumYearBand[] | null | undefined =
        dto.premiumYearBands === undefined
          ? undefined
          : dto.premiumYearBands === null || dto.premiumYearBands.length === 0
            ? null
            : dto.premiumYearBands.map((b) => ({
                yearFrom: b.yearFrom ?? null,
                yearTo: b.yearTo ?? null,
                percents: [...b.percents],
              }));
      const tiersChanged =
        dto.premiumTiers !== undefined &&
        !sameJson(
          dto.premiumTiers.map((t) => ({ maxDays: t.maxDays, percent: t.percent })),
          beforeTiers,
        );
      const bandsChanged = dtoBands !== undefined && !sameJson(dtoBands, beforeBands);
      if (
        before.premiumSyncStatus === INSURANCE_PREMIUM_SYNC_STATUS.SYNCED &&
        (tiersChanged ||
          bandsChanged ||
          (dto.premiumBasis !== undefined && basis !== before.premiumBasis))
      ) {
        throw new ConflictException({
          code: API_ERROR_CODE.INSURANCE_PREMIUM_SYNCED_LOCKED,
          message: 'Biểu phí đang đồng bộ từ hãng - không sửa tay được',
        });
      }
      const tiers = dto.premiumTiers ?? beforeTiers;
      const bands = dtoBands !== undefined ? dtoBands : beforeBands;
      if (basis === INSURANCE_PREMIUM_BASIS.VALUE_TIER) {
        if (before.kind !== INSURANCE_PRODUCT_KIND.VEHICLE_TRIP) {
          throw invalidProduct('Chỉ bảo hiểm vật chất xe được tính phí theo bậc giá trị xe');
        }
        const problem = tiers ? insurancePremiumTiersProblem(tiers) : 'Cần biểu phí bậc';
        if (problem) throw invalidProduct(problem, 'premiumTiers');
        // Đổi số bậc mà giữ nhóm năm cũ ⇒ % của nhóm không còn khớp bậc: phải gửi kèm nhóm năm mới.
        const bandProblem =
          bands && bands.length > 0 && tiers
            ? insurancePremiumYearBandsProblem(bands, tiers)
            : null;
        if (bandProblem) throw invalidProduct(bandProblem, 'premiumYearBands');
      }

      const data: Prisma.InsuranceProductUpdateInput = {};
      if (dto.premiumBasis !== undefined) data.premiumBasis = dto.premiumBasis;
      if (dto.premiumTiers !== undefined) {
        data.premiumTiersJson = dto.premiumTiers.map((t) => ({
          maxDays: t.maxDays,
          percent: t.percent,
        }));
      }
      if (basis !== INSURANCE_PREMIUM_BASIS.VALUE_TIER) {
        // Nhóm năm chỉ có nghĩa với phí theo bậc (CHECK `insurance_products_premium_year_bands_check`).
        if (before.premiumYearBandsJson !== null) data.premiumYearBandsJson = Prisma.DbNull;
      } else if (dtoBands !== undefined) {
        data.premiumYearBandsJson = dtoBands ? dtoBands.map(bandJson) : Prisma.DbNull;
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
      // % hoa hồng đại lý (ADR 0097) — mặc định cho bảng kê; CHECK 0..100 ở DB là chốt sau.
      if (dto.agencyCommissionPercent !== undefined) {
        data.agencyCommissionPercent = new Prisma.Decimal(dto.agencyCommissionPercent);
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

  /**
   * Sản phẩm vật chất xe tính theo bậc — đích của đồng bộ biểu phí (ADR 0106). `null` khi danh mục
   * chưa có (môi trường chưa seed) hoặc sản phẩm đang tính theo ngày.
   */
  async vehicleTripTierProduct(): Promise<ProductRow | null> {
    return this.prisma.insuranceProduct.findFirst(VEHICLE_TRIP_TIER_PRODUCT);
  }

  /**
   * Ghi KẾT QUẢ một lần đồng bộ biểu phí với hãng (ADR 0106 điều 1) — writer duy nhất của bảng này
   * nên đồng bộ cũng đi qua đây. Chỉ admin bấm mới đồng bộ, nên mọi lượt đều có người làm và có audit.
   *
   *  - thành công ⇒ thay mốc bậc + nhóm năm, KHOÁ biểu phí (`synced`);
   *  - hỏng ⇒ GIỮ biểu phí đang chạy, ghi lý do, MỞ cho sửa tay (`failed`).
   */
  async applyPremiumSync(
    productId: string,
    outcome:
      | { ok: true; tiers: InsurancePremiumTier[]; bands: InsurancePremiumYearBand[] }
      | { ok: false; reason: string },
    actorUserId: string,
    now: Date = new Date(),
  ): Promise<InsuranceProductDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await tx.insuranceProduct.findUnique({ where: { id: productId } });
      if (!before) {
        throw new NotFoundException({
          code: API_ERROR_CODE.NOT_FOUND,
          message: 'Không tìm thấy sản phẩm bảo hiểm',
        });
      }
      const data: Prisma.InsuranceProductUpdateInput = outcome.ok
        ? {
            premiumTiersJson: outcome.tiers.map((t) => ({
              maxDays: t.maxDays,
              percent: t.percent,
            })),
            premiumYearBandsJson: outcome.bands.map(bandJson),
            premiumSyncStatus: INSURANCE_PREMIUM_SYNC_STATUS.SYNCED,
            premiumSyncedAt: now,
            premiumSyncStatusAt: now,
            premiumSyncError: null,
          }
        : {
            premiumSyncStatus: INSURANCE_PREMIUM_SYNC_STATUS.FAILED,
            premiumSyncStatusAt: now,
            premiumSyncError: outcome.reason.slice(0, PREMIUM_SYNC_ERROR_MAX),
          };
      const after = await tx.insuranceProduct.update({ where: { id: productId }, data });
      await this.audit.record(
        {
          tenantId: null,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: outcome.ok
            ? 'insurance_product.premium_sync'
            : 'insurance_product.premium_sync_failed',
          targetType: 'insurance_product',
          targetId: productId,
          before: toAdminDto(before),
          after: toAdminDto(after),
        },
        tx,
      );
      return toAdminDto(after);
    });
    this.offer.invalidate();
    return updated;
  }

  /**
   * Lượt DUYỆT đơn hỏi hãng ra phí KHÁC biểu phí đang lưu (ADR 0106 điều 2) ⇒ đánh dấu `drifted`: mở
   * cho sửa tay và nhắc admin đồng bộ lại. Không tốn lượt hỏi nào — lượt duyệt vốn đã hỏi hãng.
   *
   * Chỉ ghi khi biểu phí đang `synced` hoặc chưa từng đồng bộ: đã `failed`/`drifted` thì admin đã được
   * nhắc, giữ lý do đầu tiên thay vì ghi đè ở mỗi lượt duyệt. Không đổi số của biểu phí — giá khách
   * thấy đổi khi admin đồng bộ lại hoặc sửa tay. Trả `true` khi vừa đánh dấu.
   */
  async markPremiumDrift(reason: string, now: Date = new Date()): Promise<boolean> {
    const marked = await this.prisma.$transaction(async (tx) => {
      const before = await tx.insuranceProduct.findFirst(VEHICLE_TRIP_TIER_PRODUCT);
      if (!before) return false;
      // Điều kiện nằm TRONG lệnh ghi: hai lượt duyệt cùng thấy lệch thì chỉ một lượt ghi.
      const { count } = await tx.insuranceProduct.updateMany({
        where: {
          id: before.id,
          OR: [
            { premiumSyncStatus: null },
            { premiumSyncStatus: INSURANCE_PREMIUM_SYNC_STATUS.SYNCED },
          ],
        },
        data: {
          premiumSyncStatus: INSURANCE_PREMIUM_SYNC_STATUS.DRIFTED,
          premiumSyncStatusAt: now,
          premiumSyncError: reason.slice(0, PREMIUM_SYNC_ERROR_MAX),
        },
      });
      if (count === 0) return false;
      const after = await tx.insuranceProduct.findUniqueOrThrow({ where: { id: before.id } });
      await this.audit.record(
        {
          tenantId: null,
          actorUserId: null,
          actorScope: AUDIT_ACTOR_SCOPE.SYSTEM,
          action: 'insurance_product.premium_drift',
          targetType: 'insurance_product',
          targetId: before.id,
          before: toAdminDto(before),
          after: toAdminDto(after),
        },
        tx,
      );
      return true;
    });
    if (marked) this.offer.invalidate();
    return marked;
  }
}

/** Độ dài tối đa lý do hỏng — cùng `VARCHAR(500)` của cột. */
const PREMIUM_SYNC_ERROR_MAX = 500;

function bandJson(b: InsurancePremiumYearBand): Prisma.InputJsonObject {
  return { yearFrom: b.yearFrom ?? null, yearTo: b.yearTo ?? null, percents: [...b.percents] };
}

/** So hai giá trị JSON (biểu phí) — thứ tự khoá cố định vì cả hai đều do chính service này dựng. */
function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
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
    dailyAmountCar: money(r.dailyAmountCar),
    dailyAmountMotorbike: money(r.dailyAmountMotorbike),
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
    premiumYearBands: readInsurancePremiumYearBands(
      r.premiumYearBandsJson,
      readInsurancePremiumTiers(r.premiumTiersJson),
    ),
    premiumSyncStatus: (r.premiumSyncStatus as InsurancePremiumSyncStatus | null) ?? null,
    premiumSyncedAt: r.premiumSyncedAt?.toISOString() ?? null,
    premiumSyncStatusAt: r.premiumSyncStatusAt?.toISOString() ?? null,
    premiumSyncError: r.premiumSyncError,
    claimHotline: r.claimHotline,
    serviceFeeEnabled: r.serviceFeeEnabled,
    serviceFeePercent: Number(r.serviceFeePercent),
    agencyCommissionPercent: Number(r.agencyCommissionPercent),
  };
}
