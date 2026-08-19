import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  BOOKING_STATUS,
  DEFAULT_TENANT_CUSTOMER_SORT,
  TENANT_CUSTOMER_FINANCE_RELATIONSHIPS,
  TENANT_CUSTOMER_FINANCE_SORTS,
  TENANT_CUSTOMER_RELATIONSHIP,
  TENANT_CUSTOMER_RETURNING_MIN_RENTALS,
  TENANT_CUSTOMER_RISK_LEVEL,
  TENANT_CUSTOMER_SORT,
  TENANT_CUSTOMER_SOURCE,
  requiresRiskReason,
  type PaginationMeta,
  type TenantCustomerRelationship,
  type TenantCustomerRiskLevel,
  type TenantCustomerSort,
} from '@xeprime/types';
import {
  BOOKING_MONEY_JOINS,
  SQL_AMOUNT_DUE,
  SQL_COLLECTED,
  SQL_DEBT,
} from '../../common/booking-money';
import { normalizePhone, toLocalPhone } from '../../common/phone';
import { resolvePaging, paginationMeta } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CUSTOMER_DEFAULT_LIMIT,
  CUSTOMER_HISTORY_DEFAULT_LIMIT,
  CUSTOMER_HISTORY_MAX_LIMIT,
  CUSTOMER_MAX_LIMIT,
  CreateCustomerNoteDto,
  CreateTenantCustomerDto,
  CustomerBookingItemDto,
  CustomerBookingListQueryDto,
  CustomerNoteDto,
  TenantCustomerDetailDto,
  TenantCustomerListItemDto,
  TenantCustomerListQueryDto,
  TenantCustomerSummaryDto,
  UpdateCustomerRiskDto,
  UpdateTenantCustomerDto,
} from './dto/customer.dto';

/** Số hoạt động gần đây hiện thẳng trên hồ sơ; lịch sử đầy đủ là endpoint phân trang riêng. */
const RECENT_BOOKINGS_LIMIT = 5;

/** Đơn còn "sống" — khách đang giữ chỗ hoặc đang cầm xe. */
const ACTIVE_BOOKING_STATUSES: readonly string[] = [
  BOOKING_STATUS.RESERVED,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.ACTIVE,
];

/** Nguồn tạo hồ sơ khi hồ sơ sinh ra từ một giao dịch, không phải do người nhập tay. */
export type AutoCustomerSource =
  typeof TENANT_CUSTOMER_SOURCE.BOOKING | typeof TENANT_CUSTOMER_SOURCE.MARKETPLACE;

export interface ResolveCustomerInput {
  fullName: string;
  /** SĐT như người dùng gõ. Thiếu hoặc không chuẩn hoá được → không gắn hồ sơ nào. */
  phone?: string | null;
  email?: string | null;
  customerUserId?: string | null;
  source: AutoCustomerSource;
  /** Người thao tác (nhân viên lập đơn). Null với yêu cầu gửi từ Marketplace. */
  actorUserId?: string | null;
  /**
   * `internal` — người trong gian hàng đang thao tác: khách bị chặn thì báo THẲNG lý do và
   * cách xử lý (đổi mức rủi ro trước).
   * `public`   — khách tự gửi yêu cầu: báo TRUNG TÍNH, tuyệt đối không lộ ra rằng gian hàng
   * đang giữ một danh sách nội bộ và họ có tên trong đó.
   */
  mode: 'internal' | 'public';
}

/** Một dòng thô của truy vấn danh sách (đã gộp số liệu tổng hợp). */
interface CustomerListRow {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  risk_level: string;
  source: string;
  archived_at: Date | null;
  has_account: boolean;
  completed_rental_count: bigint;
  active_booking_count: bigint;
  no_show_count: bigint;
  late_return_count: bigint;
  last_rental_at: Date | null;
  total_booking_amount: string;
  paid_amount: string;
  debt_amount: string;
}

/**
 * Sổ khách của GIAN HÀNG (gap S-01).
 *
 * Ba luật xuyên suốt file này:
 *
 *  1. **`tenantId` luôn từ scope phiên** (CLAUDE.md mục 5). Mọi truy vấn kẹp `tenant_id` NGAY
 *     TRONG câu WHERE — id của gian hàng khác là 404, không phải 403, để không xác nhận rằng
 *     bản ghi đó tồn tại ở đâu đó.
 *  2. **Số liệu tính động.** Không cột đếm/tổng tiền nào được lưu; mọi con số suy từ `bookings`
 *     theo đúng định nghĩa công nợ của Phase 6 (`common/money.ts`): bỏ đơn đã xoá và đơn huỷ,
 *     nợ = `max(total − paid, 0)`.
 *  3. **Tiền là quyền riêng.** Thiếu `finance.view` thì ba trường tiền trả `null` (KHÔNG phải
 *     `'0'`), và các bộ lọc/sắp xếp theo tiền bị TỪ CHỐI tường minh — nếu chỉ bỏ qua chúng,
 *     người dùng vẫn suy ra được thứ hạng công nợ từ thứ tự danh sách.
 */
@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Danh sách + KPI
  // ─────────────────────────────────────────────────────────────────────────

  async list(
    tenantId: string,
    query: TenantCustomerListQueryDto,
    canViewFinance: boolean,
  ): Promise<{ data: TenantCustomerListItemDto[]; meta: PaginationMeta }> {
    const relationship = (query.relationship ??
      TENANT_CUSTOMER_RELATIONSHIP.ALL) as TenantCustomerRelationship;
    const sort = (query.sort ?? DEFAULT_TENANT_CUSTOMER_SORT) as TenantCustomerSort;
    this.assertFinanceScope(relationship, sort, canViewFinance);

    const paging = resolvePaging(query, CUSTOMER_DEFAULT_LIMIT, CUSTOMER_MAX_LIMIT);
    const where = Prisma.join(
      [
        Prisma.sql`c.tenant_id = ${tenantId}`,
        Prisma.sql`c.deleted_at IS NULL`,
        searchSql(query.q),
        relationshipSql(relationship),
      ].filter((part): part is Prisma.Sql => part !== null),
      ' AND ',
    );

    const rows = await this.prisma.$queryRaw<CustomerListRow[]>(Prisma.sql`
      ${statsCte(tenantId)}
      SELECT c.id, c.full_name, c.phone, c.email, c.risk_level, c.source, c.archived_at,
             (c.customer_user_id IS NOT NULL) AS has_account,
             ${STATS_COLUMNS}
      FROM tenant_customers c
      LEFT JOIN customer_stats s ON s.tenant_customer_id = c.id
      WHERE ${where}
      ORDER BY ${orderSql(sort)}
      LIMIT ${paging.take} OFFSET ${paging.skip}
    `);

    const countRows = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      ${statsCte(tenantId)}
      SELECT COUNT(*)::bigint AS count
      FROM tenant_customers c
      LEFT JOIN customer_stats s ON s.tenant_customer_id = c.id
      WHERE ${where}
    `);

    return {
      data: rows.map((row) => toListItem(row, canViewFinance)),
      meta: paginationMeta(paging, Number(countRows[0]?.count ?? 0)),
    };
  }

  async summary(tenantId: string, canViewFinance: boolean): Promise<TenantCustomerSummaryDto> {
    const rows = await this.prisma.$queryRaw<
      {
        active_customers: bigint;
        returning_customers: bigint;
        watchlist_customers: bigint;
        blocked_customers: bigint;
        archived_customers: bigint;
        debt_customers: bigint;
        total_debt: string;
      }[]
    >(Prisma.sql`
      ${statsCte(tenantId)}
      SELECT
        COUNT(*) FILTER (WHERE c.archived_at IS NULL)::bigint AS active_customers,
        COUNT(*) FILTER (
          WHERE c.archived_at IS NULL
            AND COALESCE(s.completed_rental_count, 0) >= ${TENANT_CUSTOMER_RETURNING_MIN_RENTALS}
        )::bigint AS returning_customers,
        COUNT(*) FILTER (
          WHERE c.archived_at IS NULL AND c.risk_level = ${TENANT_CUSTOMER_RISK_LEVEL.WATCHLIST}
        )::bigint AS watchlist_customers,
        COUNT(*) FILTER (
          WHERE c.archived_at IS NULL AND c.risk_level = ${TENANT_CUSTOMER_RISK_LEVEL.BLOCKED}
        )::bigint AS blocked_customers,
        COUNT(*) FILTER (WHERE c.archived_at IS NOT NULL)::bigint AS archived_customers,
        COUNT(*) FILTER (WHERE COALESCE(s.debt_amount, 0) > 0)::bigint AS debt_customers,
        trim_scale(COALESCE(SUM(COALESCE(s.debt_amount, 0)), 0))::text AS total_debt
      FROM tenant_customers c
      LEFT JOIN customer_stats s ON s.tenant_customer_id = c.id
      WHERE c.tenant_id = ${tenantId} AND c.deleted_at IS NULL
    `);

    const row = rows[0];
    return {
      activeCustomers: Number(row?.active_customers ?? 0),
      returningCustomers: Number(row?.returning_customers ?? 0),
      watchlistCustomers: Number(row?.watchlist_customers ?? 0),
      blockedCustomers: Number(row?.blocked_customers ?? 0),
      archivedCustomers: Number(row?.archived_customers ?? 0),
      // Thiếu quyền tiền: cả hai đều `null` để FE ẩn HẲN ô. Một số 0 giả sẽ được đọc là
      // "không ai nợ gì" — đó là thông tin SAI, khác hẳn thông tin bị giấu.
      totalDebt: canViewFinance ? (row?.total_debt ?? '0') : null,
      debtCustomers: canViewFinance ? Number(row?.debt_customers ?? 0) : null,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Hồ sơ
  // ─────────────────────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    userId: string,
    dto: CreateTenantCustomerDto,
    canViewFinance: boolean,
    canViewBookings: boolean,
  ): Promise<TenantCustomerDetailDto> {
    const normalizedPhone = this.requireNormalizedPhone(dto.phone);
    await this.assertPhoneFree(tenantId, normalizedPhone, null);

    const id = newId();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.tenantCustomer.create({
          data: {
            id,
            tenantId,
            fullName: dto.fullName.trim(),
            phone: toLocalPhone(dto.phone),
            normalizedPhone,
            email: dto.email?.trim() || null,
            address: dto.address?.trim() || null,
            source: TENANT_CUSTOMER_SOURCE.MANUAL,
            createdBy: userId,
          },
        });
        await this.audit.record(
          {
            tenantId,
            actorUserId: userId,
            actorScope: AUDIT_ACTOR_SCOPE.TENANT,
            action: 'tenant_customer.create',
            targetType: 'tenant_customer',
            targetId: id,
            after: { fullName: dto.fullName, normalizedPhone },
          },
          tx,
        );
      });
    } catch (err) {
      // Chốt chặn cuối cho hai request tạo song song cùng một SĐT — unique index ở DB, không
      // phải câu SELECT ở trên (hai request đều đi qua được câu đó).
      throw (await this.asDuplicatePhone(err, tenantId, normalizedPhone)) ?? err;
    }

    return this.detail(tenantId, id, { canViewFinance, canViewBookings });
  }

  async detail(
    tenantId: string,
    id: string,
    scope: { canViewFinance: boolean; canViewBookings: boolean },
  ): Promise<TenantCustomerDetailDto> {
    const customer = await this.findOne(tenantId, id);
    const stats = await this.statsFor(tenantId, id);
    const recentBookings = scope.canViewBookings
      ? await this.recentBookings(tenantId, id, scope.canViewFinance)
      : [];

    return {
      id: customer.id,
      fullName: customer.fullName,
      phone: customer.phone,
      normalizedPhone: customer.normalizedPhone,
      email: customer.email,
      address: customer.address,
      source: customer.source,
      riskLevel: customer.riskLevel,
      riskReason: customer.riskReason,
      hasAccount: customer.customerUserId !== null,
      archivedAt: customer.archivedAt?.toISOString() ?? null,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
      ...toStats(stats, scope.canViewFinance),
      recentBookings,
    };
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateTenantCustomerDto,
    scope: { canViewFinance: boolean; canViewBookings: boolean },
  ): Promise<TenantCustomerDetailDto> {
    const current = await this.findOne(tenantId, id);
    this.assertNotArchived(current.archivedAt);

    /*
     * Đổi SĐT là đổi ĐỊNH DANH của khách trong gian hàng. Trùng với hồ sơ khác thì DỪNG với mã
     * riêng — tuyệt đối không gộp hai hồ sơ, vì gộp là thao tác không lùi lại được và phải do
     * người quyết định (gộp khách nằm ngoài phạm vi đợt này).
     */
    const normalizedPhone =
      dto.phone !== undefined ? this.requireNormalizedPhone(dto.phone) : current.normalizedPhone;
    if (normalizedPhone !== current.normalizedPhone) {
      await this.assertPhoneFree(tenantId, normalizedPhone, id);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.tenantCustomer.update({
          where: { id },
          data: {
            ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}),
            ...(dto.phone !== undefined ? { phone: toLocalPhone(dto.phone), normalizedPhone } : {}),
            ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
            ...(dto.address !== undefined ? { address: dto.address?.trim() || null } : {}),
          },
        });
        await this.audit.record(
          {
            tenantId,
            actorUserId: userId,
            actorScope: AUDIT_ACTOR_SCOPE.TENANT,
            action: 'tenant_customer.update',
            targetType: 'tenant_customer',
            targetId: id,
            before: { fullName: current.fullName, normalizedPhone: current.normalizedPhone },
            after: { fullName: dto.fullName ?? current.fullName, normalizedPhone },
          },
          tx,
        );
      });
    } catch (err) {
      throw (await this.asDuplicatePhone(err, tenantId, normalizedPhone)) ?? err;
    }

    // Snapshot `customer_name`/`customer_phone` trên đơn cũ KHÔNG bị đụng tới: chúng là sự thật
    // của giao dịch tại thời điểm ký, không phải một bản sao cần đồng bộ.
    return this.detail(tenantId, id, scope);
  }

  async setArchived(
    tenantId: string,
    userId: string,
    id: string,
    archived: boolean,
    scope: { canViewFinance: boolean; canViewBookings: boolean },
  ): Promise<TenantCustomerDetailDto> {
    const current = await this.findOne(tenantId, id);
    if (Boolean(current.archivedAt) === archived) return this.detail(tenantId, id, scope);

    await this.prisma.$transaction(async (tx) => {
      await tx.tenantCustomer.update({
        where: { id },
        data: { archivedAt: archived ? new Date() : null },
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: AUDIT_ACTOR_SCOPE.TENANT,
          action: archived ? 'tenant_customer.archive' : 'tenant_customer.restore',
          targetType: 'tenant_customer',
          targetId: id,
        },
        tx,
      );
    });
    return this.detail(tenantId, id, scope);
  }

  /**
   * Đổi mức rủi ro. Luôn có audit kèm giá trị CŨ, giá trị MỚI và lý do — đây là quyết định
   * chặn/không chặn khách của gian hàng, phải trả lời được "ai quyết, khi nào, vì sao".
   */
  async updateRisk(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateCustomerRiskDto,
    scope: { canViewFinance: boolean; canViewBookings: boolean },
  ): Promise<TenantCustomerDetailDto> {
    const current = await this.findOne(tenantId, id);
    const reason = dto.reason?.trim() || null;
    if (requiresRiskReason(dto.riskLevel as TenantCustomerRiskLevel) && !reason) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Nhập lý do khi đánh dấu khách cần lưu ý hoặc từ chối phục vụ',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tenantCustomer.update({
        where: { id },
        data: {
          riskLevel: dto.riskLevel,
          // Về `normal` thì lý do cũ không còn nghĩa (CHECK của DB cũng chỉ đòi khi khác normal);
          // vết của nó vẫn nằm nguyên trong audit.
          riskReason: dto.riskLevel === TENANT_CUSTOMER_RISK_LEVEL.NORMAL ? null : reason,
        },
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: AUDIT_ACTOR_SCOPE.TENANT,
          action: 'tenant_customer.risk_change',
          targetType: 'tenant_customer',
          targetId: id,
          before: { riskLevel: current.riskLevel, riskReason: current.riskReason },
          after: { riskLevel: dto.riskLevel, riskReason: reason },
        },
        tx,
      );
    });
    return this.detail(tenantId, id, scope);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lịch sử thuê
  // ─────────────────────────────────────────────────────────────────────────

  async bookings(
    tenantId: string,
    id: string,
    query: CustomerBookingListQueryDto,
    canViewFinance: boolean,
  ): Promise<{ data: CustomerBookingItemDto[]; meta: PaginationMeta }> {
    await this.findOne(tenantId, id);
    const paging = resolvePaging(query, CUSTOMER_HISTORY_DEFAULT_LIMIT, CUSTOMER_HISTORY_MAX_LIMIT);
    const where: Prisma.BookingWhereInput = { tenantId, tenantCustomerId: id, deletedAt: null };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy: [{ pickupAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: BOOKING_SELECT,
      }),
    ]);

    return {
      data: rows.map((row) => toBookingItem(row, canViewFinance)),
      meta: paginationMeta(paging, total),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Ghi chú nội bộ
  // ─────────────────────────────────────────────────────────────────────────

  async listNotes(
    tenantId: string,
    id: string,
    query: CustomerBookingListQueryDto,
  ): Promise<{ data: CustomerNoteDto[]; meta: PaginationMeta }> {
    await this.findOne(tenantId, id);
    const paging = resolvePaging(query, CUSTOMER_HISTORY_DEFAULT_LIMIT, CUSTOMER_HISTORY_MAX_LIMIT);
    const where: Prisma.TenantCustomerNoteWhereInput = {
      tenantId,
      tenantCustomerId: id,
      deletedAt: null,
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.tenantCustomerNote.count({ where }),
      this.prisma.tenantCustomerNote.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: NOTE_SELECT,
      }),
    ]);

    const authorNames = await this.actorNames(rows.map((row) => row.createdBy));
    return {
      data: rows.map((row) => toNote(row, authorNames)),
      meta: paginationMeta(paging, total),
    };
  }

  /**
   * Tên người thao tác theo lô — một truy vấn cho cả trang, không N+1 và không FK.
   *
   * Cùng cách làm với bàn giao/KM (Wave 6–7): `created_by` là con trỏ mềm tới `users`; tài
   * khoản bị xoá thì bản ghi vẫn còn nguyên và chỉ mất tên hiển thị.
   */
  private async actorNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, displayName: true },
    });
    return new Map(users.map((user) => [user.id, user.displayName]));
  }

  async addNote(
    tenantId: string,
    userId: string,
    id: string,
    dto: CreateCustomerNoteDto,
  ): Promise<CustomerNoteDto> {
    const customer = await this.findOne(tenantId, id);
    this.assertNotArchived(customer.archivedAt);

    const row = await this.prisma.tenantCustomerNote.create({
      data: {
        id: newId(),
        tenantId,
        tenantCustomerId: id,
        noteType: dto.noteType,
        body: dto.body.trim(),
        createdBy: userId,
      },
      select: NOTE_SELECT,
    });

    return toNote(row, await this.actorNames([row.createdBy]));
  }

  /** Xoá ghi chú là SOFT — ghi chú từng ảnh hưởng quyết định vận hành thì không bốc hơi. */
  async removeNote(tenantId: string, userId: string, id: string, noteId: string): Promise<void> {
    await this.findOne(tenantId, id);
    // Điều kiện tenant + khách nằm TRONG câu update: note của gian hàng khác là 404.
    const result = await this.prisma.tenantCustomerNote.updateMany({
      where: { id: noteId, tenantId, tenantCustomerId: id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy ghi chú',
      });
    }
    await this.audit.record({
      tenantId,
      actorUserId: userId,
      actorScope: AUDIT_ACTOR_SCOPE.TENANT,
      action: 'tenant_customer.note_delete',
      targetType: 'tenant_customer',
      targetId: id,
      after: { noteId },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Điểm nối với đơn thuê / yêu cầu thuê
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Tìm-hoặc-tạo hồ sơ khách theo SĐT, TRONG transaction của bên gọi — nên đơn và hồ sơ khách
   * cùng sống cùng chết. Trả `null` khi không có SĐT dùng được: đơn cũ/không SĐT vẫn hợp lệ,
   * chỉ là không gắn được vào ai (và tuyệt đối không đoán theo tên).
   *
   * Ba điểm tinh tế:
   *
   *  - **Chặn trước, ghi sau.** Khách `blocked` bị từ chối TRƯỚC khi có bất kỳ thay đổi nào;
   *    thông điệp khác nhau giữa `internal` và `public` (xem `ResolveCustomerInput.mode`).
   *  - **Upsert một câu.** `INSERT … ON CONFLICT DO UPDATE` thay cho "select rồi create": trong
   *    một transaction, một P2002 sẽ HUỶ CẢ transaction và không bắt lại được — hai khách cùng
   *    SĐT gửi yêu cầu đúng một lúc sẽ làm hỏng cả đơn, không chỉ phần hồ sơ.
   *  - **Không ghi đè dữ liệu đã có.** Tên trên hồ sơ giữ nguyên (một lần khách gõ tắt tên mình
   *    không được phép đổi hồ sơ chuẩn); email/tài khoản chỉ ĐIỀN VÀO CHỖ TRỐNG.
   */
  async resolveWithinTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: ResolveCustomerInput,
  ): Promise<string | null> {
    const normalizedPhone = normalizeVnPhoneOrNull(input.phone);
    if (!normalizedPhone) return null;

    const existing = await tx.tenantCustomer.findFirst({
      where: { tenantId, normalizedPhone, deletedAt: null },
      select: { id: true, riskLevel: true, archivedAt: true },
    });
    if (existing && existing.riskLevel === TENANT_CUSTOMER_RISK_LEVEL.BLOCKED) {
      throw blockedCustomer(input.mode);
    }

    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO tenant_customers (
        id, tenant_id, customer_user_id, full_name, phone, normalized_phone, email,
        source, risk_level, created_by, created_at, updated_at
      )
      VALUES (
        ${newId()}, ${tenantId}, ${input.customerUserId ?? null}, ${input.fullName.trim()},
        ${toLocalPhone(input.phone ?? '')}, ${normalizedPhone}, ${input.email?.trim() || null},
        ${input.source}, ${TENANT_CUSTOMER_RISK_LEVEL.NORMAL}, ${input.actorUserId ?? null},
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (tenant_id, normalized_phone) DO UPDATE SET
        email = COALESCE(tenant_customers.email, EXCLUDED.email),
        customer_user_id = COALESCE(tenant_customers.customer_user_id, EXCLUDED.customer_user_id),
        -- Khách quay lại thì hồ sơ quay lại danh sách đang hoạt động: một hồ sơ vừa phát sinh
        -- giao dịch mà vẫn nằm trong "đã lưu trữ" là chỗ nhân viên sẽ không bao giờ nhìn tới.
        archived_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id
    `);
    const id = rows[0]?.id;
    if (!id) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: 'Không gắn được hồ sơ khách cho giao dịch này — thử lại',
      });
    }

    if (existing?.archivedAt) {
      await this.audit.record(
        {
          tenantId,
          actorUserId: input.actorUserId ?? null,
          actorScope: AUDIT_ACTOR_SCOPE.TENANT,
          action: 'tenant_customer.restore',
          targetType: 'tenant_customer',
          targetId: id,
          after: { reason: 'auto_restore_on_new_activity', source: input.source },
        },
        tx,
      );
    }
    return id;
  }

  /**
   * Khách này có bị gian hàng từ chối phục vụ không — kiểm TRƯỚC khi luồng công khai làm bất
   * cứ việc gì có tác dụng phụ (tạo tài khoản theo SĐT, gửi thông báo).
   */
  async assertNotBlocked(
    tenantId: string,
    phone: string | null | undefined,
    mode: 'internal' | 'public',
  ): Promise<void> {
    const normalizedPhone = normalizeVnPhoneOrNull(phone);
    if (!normalizedPhone) return;
    const found = await this.prisma.tenantCustomer.findFirst({
      where: {
        tenantId,
        normalizedPhone,
        deletedAt: null,
        riskLevel: TENANT_CUSTOMER_RISK_LEVEL.BLOCKED,
      },
      select: { id: true },
    });
    if (found) throw blockedCustomer(mode);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Nội bộ
  // ─────────────────────────────────────────────────────────────────────────

  /** Bản ghi khách trong ĐÚNG gian hàng này. Id của gian hàng khác → 404, không lộ tồn tại. */
  async findOne(tenantId: string, id: string) {
    const row = await this.prisma.tenantCustomer.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        phone: true,
        normalizedPhone: true,
        email: true,
        address: true,
        source: true,
        riskLevel: true,
        riskReason: true,
        customerUserId: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!row) throw customerNotFound();
    return row;
  }

  private assertNotArchived(archivedAt: Date | null): void {
    if (archivedAt) {
      throw new ConflictException({
        code: API_ERROR_CODE.CUSTOMER_ARCHIVED,
        message: 'Hồ sơ khách đang lưu trữ — khôi phục trước khi chỉnh sửa',
      });
    }
  }

  private requireNormalizedPhone(raw: string): string {
    const normalized = normalizeVnPhoneOrNull(raw);
    if (!normalized) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Số điện thoại không hợp lệ',
      });
    }
    return normalized;
  }

  /** Báo trùng SĐT kèm id hồ sơ đang giữ số đó, để FE mở thẳng hồ sơ ấy thay vì bắt đi tìm. */
  private async assertPhoneFree(
    tenantId: string,
    normalizedPhone: string,
    exceptId: string | null,
  ): Promise<void> {
    const found = await this.prisma.tenantCustomer.findFirst({
      where: {
        tenantId,
        normalizedPhone,
        deletedAt: null,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true, fullName: true },
    });
    if (found) throw duplicatePhone(found);
  }

  private async asDuplicatePhone(
    err: unknown,
    tenantId: string,
    normalizedPhone: string,
  ): Promise<ConflictException | null> {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return null;
    const found = await this.prisma.tenantCustomer.findFirst({
      where: { tenantId, normalizedPhone, deletedAt: null },
      select: { id: true, fullName: true },
    });
    return duplicatePhone(found);
  }

  /**
   * Bộ lọc/sắp xếp theo TIỀN bị từ chối tường minh khi thiếu `finance.view`.
   *
   * Bỏ qua trong im lặng thì tệ hơn: danh sách vẫn sắp theo công nợ, và người không được xem
   * tiền vẫn đọc ra được ai nợ nhiều nhất chỉ từ thứ tự các dòng.
   */
  private assertFinanceScope(
    relationship: TenantCustomerRelationship,
    sort: TenantCustomerSort,
    canViewFinance: boolean,
  ): void {
    if (canViewFinance) return;
    if (
      TENANT_CUSTOMER_FINANCE_RELATIONSHIPS.includes(relationship) ||
      TENANT_CUSTOMER_FINANCE_SORTS.includes(sort)
    ) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.MISSING_PERMISSION,
        message: 'Bộ lọc và sắp xếp theo công nợ cần quyền xem tài chính',
        details: { missing: ['finance.view'] },
      });
    }
  }

  private async statsFor(tenantId: string, id: string): Promise<StatsRow> {
    const rows = await this.prisma.$queryRaw<StatsRow[]>(Prisma.sql`
      ${statsCte(tenantId)}
      SELECT ${STATS_COLUMNS}
      FROM tenant_customers c
      LEFT JOIN customer_stats s ON s.tenant_customer_id = c.id
      WHERE c.id = ${id} AND c.tenant_id = ${tenantId}
    `);
    return (
      rows[0] ?? {
        completed_rental_count: 0n,
        active_booking_count: 0n,
        no_show_count: 0n,
        late_return_count: 0n,
        last_rental_at: null,
        total_booking_amount: '0',
        paid_amount: '0',
        debt_amount: '0',
      }
    );
  }

  private async recentBookings(
    tenantId: string,
    id: string,
    canViewFinance: boolean,
  ): Promise<CustomerBookingItemDto[]> {
    const rows = await this.prisma.booking.findMany({
      where: { tenantId, tenantCustomerId: id, deletedAt: null },
      orderBy: [{ pickupAt: 'desc' }, { id: 'desc' }],
      take: RECENT_BOOKINGS_LIMIT,
      select: BOOKING_SELECT,
    });
    return rows.map((row) => toBookingItem(row, canViewFinance));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SQL dùng chung
// ─────────────────────────────────────────────────────────────────────────────

interface StatsRow {
  completed_rental_count: bigint | number;
  active_booking_count: bigint | number;
  no_show_count: bigint | number;
  late_return_count: bigint | number;
  last_rental_at: Date | null;
  total_booking_amount: string;
  paid_amount: string;
  debt_amount: string;
}

/**
 * Số liệu tổng hợp theo khách, gom TRONG một lần quét `bookings` của gian hàng.
 *
 * Cùng định nghĩa với module Finance (`common/money.ts` + `finance-overview.service`): bỏ đơn đã
 * xoá mềm và đơn HUỶ khỏi mọi con số tiền; nợ kẹp sàn 0 để khách trả dư không thành nợ âm.
 * `no_show` KHÔNG bị loại: nó không phát sinh doanh thu nhưng là dữ kiện rủi ro phải đếm.
 *
 * Trả muộn chỉ đếm khi có `actual_return_at` THẬT — không suy từ "quá giờ mà chưa đóng đơn",
 * vì một đơn quên đóng sẽ biến khách tử tế thành khách hay trả muộn.
 */
function statsCte(tenantId: string): Prisma.Sql {
  return Prisma.sql`
    WITH customer_stats AS (
      SELECT b.tenant_customer_id,
             COUNT(*) FILTER (WHERE b.status = ${BOOKING_STATUS.COMPLETED})::bigint
               AS completed_rental_count,
             COUNT(*) FILTER (WHERE b.status IN (${Prisma.join(ACTIVE_BOOKING_STATUSES)}))::bigint
               AS active_booking_count,
             COUNT(*) FILTER (WHERE b.status = ${BOOKING_STATUS.NO_SHOW})::bigint
               AS no_show_count,
             COUNT(*) FILTER (
               WHERE b.actual_return_at IS NOT NULL AND b.actual_return_at > b.return_at
             )::bigint AS late_return_count,
             MAX(b.pickup_at) AS last_rental_at,
             -- Ba con số tiền dùng CHUNG công thức với chi tiết đơn và /manage/debts
             -- (common/booking-money.ts): phụ phí vào phải-thu, phiếu thu tay vào đã-thu, phần
             -- phụ phí cọc đã gánh không bị đòi lần hai. Tự viết lại total - paid ở đây là cách
             -- sổ khách và màn công nợ nói hai con số cho cùng một khách.
             COALESCE(SUM(${SQL_AMOUNT_DUE}) FILTER (
               WHERE b.status <> ${BOOKING_STATUS.CANCELLED}
             ), 0) AS total_booking_amount,
             COALESCE(SUM(${SQL_COLLECTED}) FILTER (
               WHERE b.status <> ${BOOKING_STATUS.CANCELLED}
             ), 0) AS paid_amount,
             COALESCE(SUM(${SQL_DEBT}) FILTER (
               WHERE b.status <> ${BOOKING_STATUS.CANCELLED}
             ), 0) AS debt_amount
      FROM bookings b
      ${BOOKING_MONEY_JOINS}
      WHERE b.tenant_id = ${tenantId}
        AND b.deleted_at IS NULL
        AND b.tenant_customer_id IS NOT NULL
      GROUP BY b.tenant_customer_id
    )
  `;
}

/** Cột số liệu — cùng một danh sách cho list và detail, để hai bề mặt không nói hai số. */
const STATS_COLUMNS = Prisma.sql`
  COALESCE(s.completed_rental_count, 0) AS completed_rental_count,
  COALESCE(s.active_booking_count, 0)   AS active_booking_count,
  COALESCE(s.no_show_count, 0)          AS no_show_count,
  COALESCE(s.late_return_count, 0)      AS late_return_count,
  s.last_rental_at                      AS last_rental_at,
  trim_scale(COALESCE(s.total_booking_amount, 0))::text AS total_booking_amount,
  trim_scale(COALESCE(s.paid_amount, 0))::text          AS paid_amount,
  trim_scale(COALESCE(s.debt_amount, 0))::text          AS debt_amount
`;

/**
 * Ô tìm kiếm: tên (gần đúng, index trigram) · SĐT · email.
 *
 * SĐT so trên cột ĐÃ CHUẨN HOÁ và người dùng gõ kiểu gì cũng được: `0901`, `+84901`, `84901`
 * đều quy về cùng một chuỗi trước khi so. Không làm bước này thì ô tìm kiếm trả rỗng đúng
 * những lúc người ta cần nó nhất.
 */
function searchSql(raw: string | undefined): Prisma.Sql | null {
  const q = raw?.trim();
  if (!q) return null;
  const like = `%${q}%`;
  const digits = q.replace(/\D/g, '');
  const phoneParts: Prisma.Sql[] = [];
  if (digits.length >= 3) {
    // Cả dạng đã chuẩn hoá (gõ `0901…`) lẫn dãy số thô (gõ đuôi số `234567`).
    for (const pattern of new Set([`%${normalizePhone(digits)}%`, `%${digits}%`])) {
      phoneParts.push(Prisma.sql`c.normalized_phone LIKE ${pattern}`);
    }
  }
  return Prisma.sql`(${Prisma.join(
    [Prisma.sql`c.full_name ILIKE ${like}`, Prisma.sql`c.email ILIKE ${like}`, ...phoneParts],
    ' OR ',
  )})`;
}

function relationshipSql(relationship: TenantCustomerRelationship): Prisma.Sql | null {
  switch (relationship) {
    case TENANT_CUSTOMER_RELATIONSHIP.RETURNING:
      return Prisma.sql`c.archived_at IS NULL AND COALESCE(s.completed_rental_count, 0) >= ${TENANT_CUSTOMER_RETURNING_MIN_RENTALS}`;
    case TENANT_CUSTOMER_RELATIONSHIP.HAS_DEBT:
      return Prisma.sql`COALESCE(s.debt_amount, 0) > 0`;
    case TENANT_CUSTOMER_RELATIONSHIP.WATCHLIST:
      return Prisma.sql`c.archived_at IS NULL AND c.risk_level = ${TENANT_CUSTOMER_RISK_LEVEL.WATCHLIST}`;
    case TENANT_CUSTOMER_RELATIONSHIP.BLOCKED:
      return Prisma.sql`c.archived_at IS NULL AND c.risk_level = ${TENANT_CUSTOMER_RISK_LEVEL.BLOCKED}`;
    case TENANT_CUSTOMER_RELATIONSHIP.ARCHIVED:
      return Prisma.sql`c.archived_at IS NOT NULL`;
    default:
      // "Tất cả khách" nghĩa là tất cả khách ĐANG HOẠT ĐỘNG — hồ sơ đã lưu trữ có nhóm riêng.
      return Prisma.sql`c.archived_at IS NULL`;
  }
}

/** `id` luôn là khoá phụ cuối cùng: thiếu nó, hai trang liền nhau có thể trả về cùng một dòng. */
function orderSql(sort: TenantCustomerSort): Prisma.Sql {
  switch (sort) {
    case TENANT_CUSTOMER_SORT.RENTAL_COUNT:
      return Prisma.sql`COALESCE(s.completed_rental_count, 0) DESC, c.id DESC`;
    case TENANT_CUSTOMER_SORT.TOTAL_VALUE:
      return Prisma.sql`COALESCE(s.total_booking_amount, 0) DESC, c.id DESC`;
    case TENANT_CUSTOMER_SORT.DEBT:
      return Prisma.sql`COALESCE(s.debt_amount, 0) DESC, c.id DESC`;
    case TENANT_CUSTOMER_SORT.NAME:
      return Prisma.sql`c.full_name ASC, c.id DESC`;
    default:
      // Khách chưa thuê lần nào xuống cuối, không lẫn lên đầu vì NULL.
      return Prisma.sql`s.last_rental_at DESC NULLS LAST, c.id DESC`;
  }
}

const NOTE_SELECT = {
  id: true,
  noteType: true,
  body: true,
  createdBy: true,
  createdAt: true,
} satisfies Prisma.TenantCustomerNoteSelect;

type NoteRow = Prisma.TenantCustomerNoteGetPayload<{ select: typeof NOTE_SELECT }>;

function toNote(row: NoteRow, authorNames: Map<string, string>): CustomerNoteDto {
  return {
    id: row.id,
    noteType: row.noteType,
    body: row.body,
    authorName: row.createdBy ? (authorNames.get(row.createdBy) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
  };
}

const BOOKING_SELECT = {
  id: true,
  code: true,
  status: true,
  serviceType: true,
  pickupAt: true,
  returnAt: true,
  totalAmount: true,
  paidAmount: true,
  vehicle: { select: { name: true, plateNumber: true } },
} satisfies Prisma.BookingSelect;

type BookingRow = Prisma.BookingGetPayload<{ select: typeof BOOKING_SELECT }>;

function toBookingItem(row: BookingRow, canViewFinance: boolean): CustomerBookingItemDto {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    serviceType: row.serviceType,
    vehicleName: row.vehicle.name,
    vehiclePlate: row.vehicle.plateNumber,
    pickupAt: row.pickupAt.toISOString(),
    returnAt: row.returnAt.toISOString(),
    totalAmount: canViewFinance ? row.totalAmount.toString() : null,
    paidAmount: canViewFinance ? row.paidAmount.toString() : null,
    debtAmount: canViewFinance
      ? Prisma.Decimal.max(0, row.totalAmount.minus(row.paidAmount)).toString()
      : null,
  };
}

function toStats(row: StatsRow, canViewFinance: boolean) {
  return {
    completedRentalCount: Number(row.completed_rental_count),
    activeBookingCount: Number(row.active_booking_count),
    noShowCount: Number(row.no_show_count),
    lateReturnCount: Number(row.late_return_count),
    lastRentalAt: row.last_rental_at?.toISOString() ?? null,
    totalBookingAmount: canViewFinance ? row.total_booking_amount : null,
    paidAmount: canViewFinance ? row.paid_amount : null,
    debtAmount: canViewFinance ? row.debt_amount : null,
  };
}

function toListItem(row: CustomerListRow, canViewFinance: boolean): TenantCustomerListItemDto {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    riskLevel: row.risk_level,
    source: row.source,
    hasAccount: row.has_account,
    archivedAt: row.archived_at?.toISOString() ?? null,
    ...toStats(row, canViewFinance),
  };
}

/** `normalizePhone` nhưng trả `null` khi kết quả không phải một SĐT Việt Nam dùng được. */
function normalizeVnPhoneOrNull(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const normalized = normalizePhone(raw);
  return /^84\d{8,12}$/.test(normalized) ? normalized : null;
}

function customerNotFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy khách hàng',
  });
}

function duplicatePhone(found: { id: string; fullName: string } | null): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.CUSTOMER_PHONE_DUPLICATE,
    message: found
      ? `Số điện thoại này đã thuộc hồ sơ "${found.fullName}" trong sổ khách`
      : 'Số điện thoại này đã thuộc một hồ sơ khác trong sổ khách',
    details: found ? { customerId: found.id } : undefined,
  });
}

/**
 * Hai thông điệp cho cùng một sự thật.
 *
 * `internal`: người trong gian hàng cần biết CHÍNH XÁC chuyện gì và làm gì tiếp.
 * `public`  : khách chỉ được biết yêu cầu không nhận được — không mã riêng, không gợi ý rằng
 * có một danh sách nội bộ, không cách nào dò xem SĐT nào đang bị chặn ở gian hàng nào.
 */
function blockedCustomer(mode: 'internal' | 'public'): ConflictException {
  return mode === 'internal'
    ? new ConflictException({
        code: API_ERROR_CODE.CUSTOMER_BLOCKED,
        message:
          'Khách đang bị đánh dấu từ chối phục vụ — chủ hoặc quản lý gian hàng cần đổi mức rủi ro trước',
      })
    : new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message:
          'Gian hàng hiện chưa thể tiếp nhận yêu cầu này. Vui lòng liên hệ gian hàng để được hỗ trợ.',
      });
}
