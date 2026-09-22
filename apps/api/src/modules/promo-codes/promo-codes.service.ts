import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  normalizePromoCode,
  PROMO_CODE_STATE,
  PROMO_DISCOUNT_TYPE,
  PROMO_ENDING_SOON_DAYS,
  PROMO_LOCKED_FIELDS_AFTER_USE,
  PROMO_REDEMPTION_STATUS,
  promoCodeConfigBlockers,
  promoCodeState,
  type PromoCodeState,
  type PromoLockedField,
} from '@xeprime/types';
import { maskName } from '../../common/mask';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  PROMO_CODE_DEFAULT_LIMIT,
  PROMO_CODE_MAX_LIMIT,
  PromoCodeDto,
  PromoCodeListQueryDto,
  PromoCodePageDto,
  PromoCodeStatsDto,
  PromoRedemptionListQueryDto,
  PromoRedemptionPageDto,
  TogglePromoCodeDto,
  UpsertPromoCodeDto,
} from './dto/promo-code.dto';

const SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  discountType: true,
  discountAmount: true,
  discountPercent: true,
  maxDiscountAmount: true,
  minOrderAmount: true,
  audience: true,
  vehicleScope: true,
  serviceScope: true,
  provinceCodes: true,
  totalUsageLimit: true,
  perCustomerLimit: true,
  reservedCount: true,
  redeemedCount: true,
  startsAt: true,
  endsAt: true,
  isActive: true,
  listed: true,
  createdAt: true,
  updatedAt: true,
  creator: { select: { displayName: true } },
} as const;

type Row = Prisma.PromoCodeGetPayload<{ select: typeof SELECT }>;

const REDEMPTION_DEFAULT_LIMIT = 20;

/**
 * QUẢN TRỊ mã khuyến mãi nền tảng — ADR 0046.
 *
 * Chỉ nhân sự nền tảng đi tới đây (`@PlatformOnly()` + `platform.promo_codes.manage` ở
 * controller). Service KHÔNG nhận `tenantId` ở bất kỳ tham số nào, và đó là cách "gian hàng
 * không tạo được mã nền tảng" được thi hành ở tầng kiểu, không chỉ ở tầng guard.
 *
 * Ba việc service này làm mà không ai khác được làm: tạo/sửa cấu hình, bật/tắt, xoá mềm. Việc
 * ÁP mã vào một chuyến thuộc `PromoCodeEvaluatorService` — tách ra vì nó chạy trên đường tiền
 * và không được phụ thuộc vào bất cứ thứ gì của màn quản trị.
 */
@Injectable()
export class PromoCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Đọc
  // -------------------------------------------------------------------------

  /**
   * Danh sách + thẻ thống kê. Lọc/sắp/phân trang Ở SERVER (ADR 0004) — trang admin chỉ giữ bộ
   * lọc trên URL.
   *
   * `state` là trạng thái SUY RA, không phải cột, nên nó được dịch thành điều kiện ngày/bộ đếm
   * tương ứng ({@link stateWhere}). Dịch ở server chứ không lọc ở client: một bộ lọc lọc trên
   * trang hiện tại là bộ lọc nói dối về `total`.
   */
  async list(query: PromoCodeListQueryDto): Promise<PromoCodePageDto> {
    const now = new Date();
    const where: Prisma.PromoCodeWhereInput = {
      deletedAt: null,
      ...(query.discountType ? { discountType: query.discountType } : {}),
      ...searchWhere(query.q),
      ...(query.state ? await this.stateWhere(query.state as PromoCodeState, now) : {}),
      /*
       * Khoảng ngày lọc theo GIAO NHAU với thời gian áp dụng của chiến dịch, không theo `startsAt`
       * nằm trong khoảng: người dùng chọn "tháng 10" là đang hỏi "mã nào áp dụng trong tháng 10",
       * và một mã chạy từ tháng 9 tới tháng 12 là một câu trả lời đúng.
       */
      ...(query.dateFrom ? { endsAt: { gte: new Date(query.dateFrom) } } : {}),
      ...(query.dateTo ? { startsAt: { lte: new Date(query.dateTo) } } : {}),
    };

    const paging = resolvePaging(query, PROMO_CODE_DEFAULT_LIMIT, PROMO_CODE_MAX_LIMIT);
    const dir = query.dir === 'asc' ? 'asc' : 'desc';
    const orderBy: Prisma.PromoCodeOrderByWithRelationInput =
      query.sort === 'endsAt'
        ? { endsAt: dir }
        : query.sort === 'reservedCount'
          ? { reservedCount: dir }
          : { createdAt: dir };

    const [rows, total, stats] = await Promise.all([
      this.prisma.promoCode.findMany({
        where,
        select: SELECT,
        orderBy,
        skip: paging.skip,
        take: paging.take,
      }),
      this.prisma.promoCode.count({ where }),
      this.stats(now),
    ]);

    /*
     * Tổng tiền đã tài trợ, gom theo chiến dịch CHỈ cho các dòng đang xem — một lượt
     * `groupBy` cho cả trang thay vì một `sum` cho mỗi dòng.
     */
    const sponsored = await this.sponsoredByCode(rows.map((r) => r.id));

    return {
      data: rows.map((r) => toDto(r, now, sponsored.get(r.id) ?? '0')),
      meta: paginationMeta(paging, total),
      stats,
    };
  }

  async getOne(id: string): Promise<PromoCodeDto> {
    const row = await this.prisma.promoCode.findFirst({
      where: { id, deletedAt: null },
      select: SELECT,
    });
    if (!row) throw notFound();
    const sponsored = await this.sponsoredByCode([row.id]);
    return toDto(row, new Date(), sponsored.get(row.id) ?? '0');
  }

  /**
   * Bốn thẻ đầu trang — đếm trên TOÀN BỘ chiến dịch, không theo trang đang xem và không theo bộ
   * lọc đang bật: chúng là bức tranh toàn cảnh, và một thẻ "đang hoạt động: 1" chỉ vì người dùng
   * vừa gõ vào ô tìm kiếm là một con số vô nghĩa.
   */
  private async stats(now: Date): Promise<PromoCodeStatsDto> {
    const soon = new Date(now.getTime() + PROMO_ENDING_SOON_DAYS * 24 * 60 * 60 * 1000);
    const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const live: Prisma.PromoCodeWhereInput = {
      deletedAt: null,
      isActive: true,
      startsAt: { lte: now },
      endsAt: { gte: now },
    };
    const [total, createdLast30Days, active, endingSoon, expired] = await Promise.all([
      this.prisma.promoCode.count({ where: { deletedAt: null } }),
      this.prisma.promoCode.count({ where: { deletedAt: null, createdAt: { gte: last30 } } }),
      this.prisma.promoCode.count({ where: live }),
      this.prisma.promoCode.count({ where: { ...live, endsAt: { gte: now, lte: soon } } }),
      this.prisma.promoCode.count({ where: { deletedAt: null, endsAt: { lt: now } } }),
    ]);
    return { total, createdLast30Days, active, endingSoon, expired };
  }

  /** Lượt sử dụng của MỘT chiến dịch — tên khách ở dạng đã che (không cần PII để đối soát). */
  async listRedemptions(
    id: string,
    query: PromoRedemptionListQueryDto,
  ): Promise<PromoRedemptionPageDto> {
    const exists = await this.prisma.promoCode.findFirst({ where: { id }, select: { id: true } });
    if (!exists) throw notFound();

    const where: Prisma.PromoRedemptionWhereInput = {
      promoCodeId: id,
      ...(query.status ? { status: query.status } : {}),
    };
    const paging = resolvePaging(query, REDEMPTION_DEFAULT_LIMIT, PROMO_CODE_MAX_LIMIT);
    const [rows, total] = await Promise.all([
      this.prisma.promoRedemption.findMany({
        where,
        select: {
          id: true,
          status: true,
          releaseReason: true,
          discountAmount: true,
          bookingRequestId: true,
          bookingId: true,
          reservedAt: true,
          redeemedAt: true,
          releasedAt: true,
          customer: { select: { displayName: true } },
          booking: { select: { code: true } },
        },
        orderBy: { reservedAt: 'desc' },
        skip: paging.skip,
        take: paging.take,
      }),
      this.prisma.promoRedemption.count({ where }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        status: r.status,
        releaseReason: r.releaseReason,
        discountAmount: r.discountAmount.toFixed(0),
        bookingRequestId: r.bookingRequestId,
        bookingId: r.bookingId,
        bookingCode: r.booking?.code ?? null,
        customerNameMasked: maskName(r.customer.displayName),
        reservedAt: r.reservedAt.toISOString(),
        redeemedAt: r.redeemedAt?.toISOString() ?? null,
        releasedAt: r.releasedAt?.toISOString() ?? null,
      })),
      meta: paginationMeta(paging, total),
    };
  }

  // -------------------------------------------------------------------------
  // Ghi
  // -------------------------------------------------------------------------

  async create(actorUserId: string, dto: UpsertPromoCodeDto): Promise<PromoCodeDto> {
    const data = this.validated(dto);
    const id = newId();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.promoCode.create({ data: { id, ...data, createdBy: actorUserId } });
        await this.audit.record(
          {
            actorUserId,
            actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
            action: 'promo_code.create',
            targetType: 'promo_code',
            targetId: id,
            after: auditShape(data),
          },
          tx,
        );
      });
    } catch (err) {
      throw duplicateOr(err);
    }
    return this.getOne(id);
  }

  /**
   * Sửa cấu hình.
   *
   * Chiến dịch ĐÃ PHÁT SINH LƯỢT thì các trường ở `PROMO_LOCKED_FIELDS_AFTER_USE` bị khoá
   * (ADR 0046 điều 8): sửa mức giảm hay phạm vi của một chiến dịch đang chạy làm bảng lượt sử
   * dụng và báo cáo tài trợ mô tả hai thứ khác nhau. Nới thời gian, nới trần lượt, sửa tên/mô tả
   * và bật/tắt vẫn được — chúng không viết lại một lượt nào đã xảy ra.
   *
   * So sánh trước-sau để chỉ báo lỗi khi giá trị THỰC SỰ đổi: form admin gửi cả object, nên một
   * lượt "sửa mô tả" cũng mang theo `discountAmount` y như cũ, và từ chối nó là từ chối một việc
   * không có gì sai.
   */
  async update(id: string, actorUserId: string, dto: UpsertPromoCodeDto): Promise<PromoCodeDto> {
    const before = await this.prisma.promoCode.findFirst({
      where: { id, deletedAt: null },
      select: SELECT,
    });
    if (!before) throw notFound();

    const data = this.validated(dto);
    const hasUsage = before.reservedCount > 0;
    if (hasUsage) {
      const changed = lockedFieldsChanged(before, data);
      if (changed.length > 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.PROMO_CODE_LOCKED,
          message:
            'Mã đã phát sinh lượt sử dụng — không sửa được mức giảm, điều kiện hay phạm vi. ' +
            'Tạo mã mới (dùng nhân bản) nếu cần bộ điều kiện khác.',
          details: { fields: changed },
        });
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.promoCode.update({ where: { id }, data });
        await this.audit.record(
          {
            actorUserId,
            actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
            action: 'promo_code.update',
            targetType: 'promo_code',
            targetId: id,
            before: auditShape(toWriteShape(before)),
            after: auditShape(data),
          },
          tx,
        );
      });
    } catch (err) {
      throw duplicateOr(err);
    }
    return this.getOne(id);
  }

  /** Bật/tắt — thao tác riêng vì nó là thứ DUY NHẤT sửa được khi chiến dịch đã có lượt dùng. */
  async toggle(id: string, actorUserId: string, dto: TogglePromoCodeDto): Promise<PromoCodeDto> {
    const before = await this.prisma.promoCode.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, isActive: true },
    });
    if (!before) throw notFound();

    await this.prisma.$transaction(async (tx) => {
      await tx.promoCode.update({ where: { id }, data: { isActive: dto.isActive } });
      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: dto.isActive ? 'promo_code.enable' : 'promo_code.disable',
          targetType: 'promo_code',
          targetId: id,
          before: { isActive: before.isActive },
          after: { isActive: dto.isActive },
        },
        tx,
      );
    });
    return this.getOne(id);
  }

  /**
   * NHÂN BẢN — mã mới `<CODE>2`, `<CODE>3`… và TẮT sẵn.
   *
   * Tắt sẵn là chủ đích: nhân bản là bước đầu của "sửa một chiến dịch đã chạy" (đường duy nhất
   * còn lại khi các trường đã bị khoá), nên bản mới phải chờ người ta soát lại số rồi mới bật.
   * Bật ngay sẽ có hai chiến dịch giống nhau cùng chạy trong khoảng thời gian trùng nhau.
   */
  async duplicate(id: string, actorUserId: string): Promise<PromoCodeDto> {
    const source = await this.prisma.promoCode.findFirst({
      where: { id, deletedAt: null },
      select: SELECT,
    });
    if (!source) throw notFound();

    const code = await this.nextFreeCode(source.code);
    const newRowId = newId();
    await this.prisma.$transaction(async (tx) => {
      await tx.promoCode.create({
        data: {
          id: newRowId,
          ...toWriteShape(source),
          code,
          name: `${source.name} (bản sao)`,
          isActive: false,
          createdBy: actorUserId,
        },
      });
      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'promo_code.duplicate',
          targetType: 'promo_code',
          targetId: newRowId,
          after: { code, sourceId: id, sourceCode: source.code },
        },
        tx,
      );
    });
    return this.getOne(newRowId);
  }

  /**
   * XOÁ MỀM. Mã đã phát sinh lượt KHÔNG xoá cứng được — `promo_redemptions.promo_code_id` là
   * `RESTRICT` ở DB, nên kể cả một `deleteMany` viết sai cũng bị chặn chứ không làm mất khả năng
   * giải thích giá của những đơn cũ (ADR 0046 điều 8).
   *
   * Xoá mềm cũng tắt luôn công tắc: một mã đã xoá không được phép còn hiệu lực ở bất kỳ đường
   * đọc nào lỡ quên lọc `deleted_at`.
   */
  async remove(id: string, actorUserId: string): Promise<void> {
    const row = await this.prisma.promoCode.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, code: true, reservedCount: true },
    });
    if (!row) throw notFound();

    await this.prisma.$transaction(async (tx) => {
      await tx.promoCode.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });
      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'promo_code.delete',
          targetType: 'promo_code',
          targetId: id,
          after: { code: row.code, reservedCount: row.reservedCount, soft: true },
        },
        tx,
      );
    });
  }

  // -------------------------------------------------------------------------
  // Helper
  // -------------------------------------------------------------------------

  /**
   * DTO → dữ liệu ghi, sau khi chạy `promoCodeConfigBlockers`.
   *
   * Dùng CHÍNH hàm mà form admin dùng để báo sớm, nên hai bên không thể nói hai câu khác nhau về
   * cùng một cấu hình. Đây là lớp chặn THẬT; form chỉ là tiện lợi.
   */
  private validated(dto: UpsertPromoCodeDto) {
    const code = normalizePromoCode(dto.code);
    const isFixed = dto.discountType === PROMO_DISCOUNT_TYPE.FIXED;
    /*
     * Ép bộ số của hình thức KHÔNG được chọn về null ngay tại đây, thay vì tin client gửi đúng.
     * Nếu không, một form chuyển từ "%" sang "tiền" sẽ để lại `discountPercent` cũ và
     * `promo_codes_discount_shape_check` từ chối cả lượt lưu với một thông báo về ràng buộc DB —
     * lỗi thật nằm ở dữ liệu thừa, không ở thứ người dùng vừa gõ.
     */
    const discountAmount = isFixed ? (dto.discountAmount ?? null) : null;
    const discountPercent = isFixed ? null : (dto.discountPercent ?? null);
    const maxDiscountAmount = isFixed ? null : (dto.maxDiscountAmount ?? null);

    const blockers = promoCodeConfigBlockers({
      code,
      name: dto.name,
      discountType: dto.discountType as UpsertPromoCodeDto['discountType'] &
        Parameters<typeof promoCodeConfigBlockers>[0]['discountType'],
      discountAmount,
      discountPercent,
      maxDiscountAmount,
      minOrderAmount: dto.minOrderAmount,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      totalUsageLimit: dto.totalUsageLimit ?? null,
      perCustomerLimit: dto.perCustomerLimit ?? null,
    });
    if (blockers.length > 0) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Cấu hình mã khuyến mãi chưa hợp lệ',
        details: { blockers },
      });
    }

    return {
      code,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      discountType: dto.discountType,
      discountAmount: discountAmount == null ? null : new Prisma.Decimal(discountAmount),
      discountPercent,
      maxDiscountAmount:
        maxDiscountAmount == null ? null : new Prisma.Decimal(maxDiscountAmount),
      minOrderAmount: new Prisma.Decimal(dto.minOrderAmount),
      audience: dto.audience,
      vehicleScope: dto.vehicleScope,
      serviceScope: dto.serviceScope,
      provinceCodes: dto.provinceCodes,
      totalUsageLimit: dto.totalUsageLimit ?? null,
      perCustomerLimit: dto.perCustomerLimit ?? null,
      startsAt: new Date(dto.startsAt),
      endsAt: new Date(dto.endsAt),
      isActive: dto.isActive,
      listed: dto.listed,
    };
  }

  /**
   * Mã trống kế tiếp cho bản sao. Đếm tới `MAX_DUPLICATE_SUFFIX` rồi dừng: một chiến dịch được
   * nhân bản 20 lần là dấu hiệu của thao tác sai, không phải của một nhu cầu thật.
   */
  private async nextFreeCode(base: string): Promise<string> {
    const MAX_DUPLICATE_SUFFIX = 20;
    const root = base.slice(0, 18);
    for (let i = 2; i <= MAX_DUPLICATE_SUFFIX; i++) {
      const candidate = `${root}${i}`;
      const taken = await this.prisma.promoCode.findUnique({
        where: { code: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    throw new ConflictException({
      code: API_ERROR_CODE.PROMO_CODE_DUPLICATE,
      message: 'Không tìm được mã trống cho bản sao — đặt mã mới bằng tay',
      details: { base },
    });
  }

  /**
   * Trạng thái SUY RA → điều kiện DB tương ứng (ADR 0046: chỉ `is_active` là cột được lưu).
   *
   * `exhausted` là ca duy nhất phải so HAI CỘT với nhau (`reserved_count >= total_usage_limit`) —
   * thứ `where` của Prisma không diễn đạt được. Giải bằng một lượt đọc id qua SQL rồi lọc
   * `id IN (…)`: bảng chiến dịch có hàng chục tới hàng trăm dòng, nên một lượt quét nó rẻ hơn
   * hẳn việc bật `fieldReference` — một preview feature — cho đúng một bộ lọc.
   */
  private async stateWhere(
    state: PromoCodeState,
    now: Date,
  ): Promise<Prisma.PromoCodeWhereInput> {
    const soon = new Date(now.getTime() + PROMO_ENDING_SOON_DAYS * 24 * 60 * 60 * 1000);
    switch (state) {
      case PROMO_CODE_STATE.DISABLED:
        return { isActive: false };
      case PROMO_CODE_STATE.UPCOMING:
        return { isActive: true, startsAt: { gt: now } };
      case PROMO_CODE_STATE.EXPIRED:
        return { endsAt: { lt: now } };
      case PROMO_CODE_STATE.EXHAUSTED: {
        const rows = await this.prisma.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "promo_codes"
           WHERE "deleted_at" IS NULL
             AND "is_active" = true
             AND "total_usage_limit" IS NOT NULL
             AND "reserved_count" >= "total_usage_limit"
        `;
        return { id: { in: rows.map((r) => r.id) } };
      }
      case PROMO_CODE_STATE.ENDING_SOON:
        return { isActive: true, startsAt: { lte: now }, endsAt: { gte: now, lte: soon } };
      default:
        return { isActive: true, startsAt: { lte: now }, endsAt: { gt: soon } };
    }
  }

  /**
   * Tổng tiền XePrime đã tài trợ theo từng chiến dịch.
   *
   * Chỉ cộng lượt đã CHỐT: lượt đang giữ chưa tiêu đồng nào (yêu cầu có thể bị từ chối), và lượt
   * đã nhả thì không bao giờ tiêu. Cộng cả lượt giữ sẽ làm báo cáo ngân sách cao hơn thực tế
   * đúng bằng số yêu cầu đang chờ duyệt.
   */
  private async sponsoredByCode(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.promoRedemption.groupBy({
      by: ['promoCodeId'],
      where: { promoCodeId: { in: ids }, status: PROMO_REDEMPTION_STATUS.REDEEMED },
      _sum: { discountAmount: true },
    });
    return new Map(
      rows.map((r) => [r.promoCodeId, (r._sum.discountAmount ?? new Prisma.Decimal(0)).toFixed(0)]),
    );
  }
}

// ---------------------------------------------------------------------------
// Helper thuần
// ---------------------------------------------------------------------------

function toDto(row: Row, now: Date, sponsoredAmount: string): PromoCodeDto {
  const hasUsage = row.reservedCount > 0;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    discountType: row.discountType,
    discountAmount: row.discountAmount?.toFixed(0) ?? null,
    discountPercent: row.discountPercent,
    maxDiscountAmount: row.maxDiscountAmount?.toFixed(0) ?? null,
    minOrderAmount: row.minOrderAmount.toFixed(0),
    audience: row.audience,
    vehicleScope: row.vehicleScope,
    serviceScope: row.serviceScope,
    provinceCodes: row.provinceCodes,
    totalUsageLimit: row.totalUsageLimit,
    perCustomerLimit: row.perCustomerLimit,
    reservedCount: row.reservedCount,
    redeemedCount: row.redeemedCount,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    isActive: row.isActive,
    listed: row.listed,
    state: promoCodeState(
      {
        isActive: row.isActive,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        totalUsageLimit: row.totalUsageLimit,
        reservedCount: row.reservedCount,
      },
      now,
    ),
    hasUsage,
    // Chưa có lượt nào ⇒ chưa khoá gì. Trả mảng rỗng thay vì danh sách đầy đủ để form không
    // phải tự suy ra điều kiện khoá lần thứ hai.
    lockedFields: hasUsage ? [...PROMO_LOCKED_FIELDS_AFTER_USE] : [],
    sponsoredAmount,
    createdByName: row.creator?.displayName ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Hàng đã đọc → dạng GHI, để nhân bản và so sánh trước-sau dùng đúng một shape. */
function toWriteShape(row: Row) {
  return {
    code: row.code,
    name: row.name,
    description: row.description,
    discountType: row.discountType,
    discountAmount: row.discountAmount,
    discountPercent: row.discountPercent,
    maxDiscountAmount: row.maxDiscountAmount,
    minOrderAmount: row.minOrderAmount,
    audience: row.audience,
    vehicleScope: row.vehicleScope,
    serviceScope: row.serviceScope,
    provinceCodes: row.provinceCodes,
    totalUsageLimit: row.totalUsageLimit,
    perCustomerLimit: row.perCustomerLimit,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    isActive: row.isActive,
    listed: row.listed,
  };
}

type WriteShape = ReturnType<typeof toWriteShape>;

/**
 * Trường bị KHOÁ nào THỰC SỰ đổi giá trị.
 *
 * So bằng chuỗi/JSON thay vì `!==` vì `Decimal` và mảng không so sánh được bằng tham chiếu:
 * `new Decimal(100000) !== new Decimal(100000)` là true, và nếu tin nó thì mọi lượt lưu đều bị
 * từ chối ngay khi chiến dịch có lượt dùng đầu tiên.
 */
function lockedFieldsChanged(before: Row, after: WriteShape): PromoLockedField[] {
  const prev = toWriteShape(before);
  return PROMO_LOCKED_FIELDS_AFTER_USE.filter(
    (field) => normalizeForCompare(prev[field]) !== normalizeForCompare(after[field]),
  );
}

function normalizeForCompare(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Prisma.Decimal) return value.toFixed(0);
  if (Array.isArray(value)) return [...value].sort().join(',');
  return String(value);
}

function searchWhere(q: string | undefined): Prisma.PromoCodeWhereInput {
  const term = q?.trim();
  if (!term) return {};
  return {
    OR: [
      { code: { contains: term, mode: 'insensitive' } },
      { name: { contains: term, mode: 'insensitive' } },
    ],
  };
}

/** Giá trị đưa vào `audit_logs` — tiền về string để đọc lại không phụ thuộc kiểu Decimal. */
function auditShape(data: WriteShape) {
  return {
    code: data.code,
    name: data.name,
    discountType: data.discountType,
    discountAmount: data.discountAmount?.toString() ?? null,
    discountPercent: data.discountPercent,
    maxDiscountAmount: data.maxDiscountAmount?.toString() ?? null,
    minOrderAmount: data.minOrderAmount.toString(),
    audience: data.audience,
    vehicleScope: data.vehicleScope,
    serviceScope: data.serviceScope,
    provinceCodes: data.provinceCodes,
    totalUsageLimit: data.totalUsageLimit,
    perCustomerLimit: data.perCustomerLimit,
    startsAt: data.startsAt.toISOString(),
    endsAt: data.endsAt.toISOString(),
    isActive: data.isActive,
    listed: data.listed,
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy mã khuyến mãi',
  });
}

/** Unique `code` ⇒ 409 có mã riêng; lỗi khác đi tiếp nguyên trạng. */
function duplicateOr(err: unknown): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return new ConflictException({
      code: API_ERROR_CODE.PROMO_CODE_DUPLICATE,
      message: 'Mã khuyến mãi này đã tồn tại',
    });
  }
  return err;
}
