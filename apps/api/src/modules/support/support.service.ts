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
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  SUPPORT_CASE_CATEGORY,
  SUPPORT_CASE_EVENT_KIND,
  SUPPORT_CASE_STATUS,
  SUPPORT_CASE_STATUS_OPEN,
  SUPPORT_EVENT_VISIBILITY,
  SUPPORT_PARTY,
  canTransitionSupportCase,
  isSupportCaseOpen,
  type PaginationMeta,
  type SupportCaseStatus,
  type SupportParty,
} from '@xeprime/types';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import {
  AssignSupportCaseDto,
  OpenSupportCaseDto,
  PostSupportEventDto,
  SUPPORT_DEFAULT_LIMIT,
  SUPPORT_MAX_LIMIT,
  SupportCaseDetailDto,
  SupportCaseDto,
  SupportCaseListQueryDto,
} from './dto/support.dto';

const SELECT = {
  id: true,
  code: true,
  category: true,
  status: true,
  priority: true,
  subject: true,
  description: true,
  tenantId: true,
  bookingId: true,
  bookingRequestId: true,
  openedByScope: true,
  resolution: true,
  resolvedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  tenant: { select: { name: true } },
  booking: { select: { code: true } },
  opener: { select: { displayName: true } },
  assignee: { select: { displayName: true } },
} satisfies Prisma.SupportCaseSelect;

type Row = Prisma.SupportCaseGetPayload<{ select: typeof SELECT }>;

/**
 * SUPPORT CASE / TRANH CHẤP gắn đơn — Gap Analysis §3.D, ADR 0028 release gate 7 (R3).
 *
 * Ba bề mặt, MỘT service: khách mở case về chuyến của mình, gian hàng mở/trả lời case của gian
 * hàng mình, nhân sự nền tảng thấy tất cả và là bên duy nhất kết luận. Tách ba service là ba
 * chỗ để quên một điều kiện quyền.
 *
 * Hai điều đáng nói:
 *
 *  1. **Tranh chấp GIỮ TIỀN.** Case `dispute` còn mở trên một đơn ⇒ `HoldSettlementService` không
 *     chốt kết cục khoản giữ chỗ của đơn đó. Ràng buộc nằm ở phía kia (nó đọc bảng này); ở đây
 *     chỉ cần đảm bảo `dispute` luôn gắn một `bookingId` — tranh chấp không gắn chuyến thì không
 *     có tiền nào để giữ và cũng không ai phân xử được.
 *  2. **Dòng thời gian APPEND-ONLY.** Đổi trạng thái, phân công, kết luận đều là một sự kiện;
 *     không có UPDATE nào lên `support_case_events`. Ghi chú `internal` nằm cùng dòng thời gian
 *     nhưng bị lọc ở tầng đọc — hai sổ song song là hai chỗ để lệch nhau.
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  // ── Mở case ───────────────────────────────────────────────────────────────

  async open(
    actor: { userId: string; scope: SupportParty; tenantId: string | null },
    dto: OpenSupportCaseDto,
  ): Promise<SupportCaseDetailDto> {
    if (dto.category === SUPPORT_CASE_CATEGORY.DISPUTE && !dto.bookingId) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Tranh chấp phải gắn với một đơn thuê',
        details: { field: 'bookingId' },
      });
    }

    /*
     * Quyền trên ĐƠN được kiểm ở đây, không tin `bookingId` client gửi: khách chỉ gắn được đơn
     * của chính mình (qua `booking_requests.customer_user_id`), gian hàng chỉ gắn đơn của mình.
     * Không kiểm thì bất kỳ ai cũng mở được tranh chấp trên chuyến của người khác — và tranh
     * chấp GIỮ TIỀN, nên đó là một đường phá hoại có hậu quả tài chính.
     */
    let tenantId = actor.tenantId;
    if (dto.bookingId) {
      const booking = await this.prisma.booking.findFirst({
        where: {
          id: dto.bookingId,
          deletedAt: null,
          ...(actor.scope === SUPPORT_PARTY.TENANT ? { tenantId: actor.tenantId ?? '' } : {}),
          ...(actor.scope === SUPPORT_PARTY.CUSTOMER
            ? { bookingRequest: { customerUserId: actor.userId } }
            : {}),
        },
        select: { id: true, tenantId: true },
      });
      if (!booking) {
        throw new NotFoundException({
          code: API_ERROR_CODE.NOT_FOUND,
          message: 'Không tìm thấy đơn thuê này trong phạm vi của bạn',
        });
      }
      tenantId = booking.tenantId;
    }

    const id = newId();
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportCase.create({
        data: {
          id,
          code: `SC${id.slice(-6).toUpperCase()}`,
          tenantId,
          bookingId: dto.bookingId ?? null,
          bookingRequestId: dto.bookingRequestId ?? null,
          openedByUserId: actor.userId,
          openedByScope: actor.scope,
          category: dto.category,
          status: SUPPORT_CASE_STATUS.OPEN,
          subject: dto.subject.trim(),
          description: dto.description.trim(),
        },
        select: SELECT,
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId: actor.userId,
          actorScope: scopeToAudit(actor.scope),
          action: 'support_case.open',
          targetType: 'support_case',
          targetId: id,
          after: { code: created.code, category: dto.category, bookingId: dto.bookingId ?? null },
        },
        tx,
      );
      // Gian hàng phải biết ngay khi khách mở tranh chấp trên chuyến của họ.
      if (tenantId && actor.scope !== SUPPORT_PARTY.TENANT) {
        await this.notifications.emitToTenantMembers(
          tenantId,
          {
            type: NOTIFICATION_TYPE.SUPPORT_CASE_UPDATED,
            title: `Yêu cầu hỗ trợ mới ${created.code}`,
            body: created.subject,
            tenantId,
            targetType: NOTIFICATION_TARGET_TYPE.SUPPORT_CASE,
            targetId: id,
          },
          tx,
        );
      }
      return created;
    });
    return this.detail(row.id, actor);
  }

  // ── Đọc ───────────────────────────────────────────────────────────────────

  async list(
    actor: { userId: string; scope: SupportParty; tenantId: string | null },
    query: SupportCaseListQueryDto,
  ): Promise<{ data: SupportCaseDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, SUPPORT_DEFAULT_LIMIT, SUPPORT_MAX_LIMIT);
    const where: Prisma.SupportCaseWhereInput = {
      ...this.scopeWhere(actor),
      // Không lọc = case còn MỞ (việc cần làm), không phải toàn bộ lịch sử.
      ...(query.status ? { status: query.status } : { status: { in: [...SUPPORT_CASE_STATUS_OPEN] } }),
      ...(query.category ? { category: query.category } : {}),
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q, mode: 'insensitive' } },
              { subject: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.supportCase.count({ where }),
      this.prisma.supportCase.findMany({
        where,
        // Ưu tiên cao trước, rồi cũ nhất trước — hàng đợi đọc theo mức độ cấp thiết.
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        skip: paging.skip,
        take: paging.take,
        select: SELECT,
      }),
    ]);
    return { data: rows.map(toDto), meta: paginationMeta(paging, total) };
  }

  async detail(
    id: string,
    actor: { userId: string; scope: SupportParty; tenantId: string | null },
  ): Promise<SupportCaseDetailDto> {
    const row = await this.prisma.supportCase.findFirst({
      where: { id, ...this.scopeWhere(actor) },
      select: SELECT,
    });
    if (!row) throw notFound();

    const events = await this.prisma.supportCaseEvent.findMany({
      where: {
        caseId: id,
        // Ghi chú nội bộ CHỈ nhân sự nền tảng thấy — lọc ở truy vấn, không lọc ở tầng hiển thị.
        ...(actor.scope === SUPPORT_PARTY.PLATFORM
          ? {}
          : { visibility: SUPPORT_EVENT_VISIBILITY.PUBLIC }),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        kind: true,
        actorScope: true,
        visibility: true,
        body: true,
        fromStatus: true,
        toStatus: true,
        attachmentName: true,
        createdAt: true,
        actor: { select: { displayName: true } },
      },
    });

    return {
      ...toDto(row),
      events: events.map((e) => ({
        id: e.id,
        kind: e.kind,
        actorScope: e.actorScope,
        actorName: e.actor.displayName,
        visibility: e.visibility,
        body: e.body,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        attachmentName: e.attachmentName,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  // ── Ghi ───────────────────────────────────────────────────────────────────

  async postMessage(
    id: string,
    actor: { userId: string; scope: SupportParty; tenantId: string | null },
    dto: PostSupportEventDto,
  ): Promise<SupportCaseDetailDto> {
    const row = await this.requireOpen(id, actor);
    // Ghi chú nội bộ là đặc quyền của nền tảng; cờ từ client khác bị BỎ QUA, không phải bị từ chối
    // — người dùng không cần biết một chế độ họ không có.
    const internal =
      actor.scope === SUPPORT_PARTY.PLATFORM && dto.internal === 'true'
        ? SUPPORT_EVENT_VISIBILITY.INTERNAL
        : SUPPORT_EVENT_VISIBILITY.PUBLIC;

    await this.prisma.$transaction(async (tx) => {
      await tx.supportCaseEvent.create({
        data: {
          id: newId(),
          caseId: id,
          actorUserId: actor.userId,
          actorScope: actor.scope,
          kind: SUPPORT_CASE_EVENT_KIND.MESSAGE,
          visibility: internal,
          body: dto.body.trim(),
        },
      });
      // Chạm `updated_at` để hàng đợi sắp theo "vừa có người trả lời".
      await tx.supportCase.update({ where: { id }, data: { updatedAt: new Date() } });

      if (internal === SUPPORT_EVENT_VISIBILITY.PUBLIC) {
        await this.notifyOtherParties(tx, row, actor, `Trả lời mới ở ${row.code}`);
      }
    });
    return this.detail(id, actor);
  }

  /** Đổi trạng thái — nền tảng làm; gian hàng/khách chỉ đóng case do CHÍNH họ mở. */
  async transition(
    id: string,
    actor: { userId: string; scope: SupportParty; tenantId: string | null },
    to: SupportCaseStatus,
    note: string | null,
  ): Promise<SupportCaseDetailDto> {
    const row = await this.prisma.supportCase.findFirst({
      where: { id, ...this.scopeWhere(actor) },
      select: { ...SELECT, openedByUserId: true },
    });
    if (!row) throw notFound();

    if (actor.scope !== SUPPORT_PARTY.PLATFORM) {
      const ownCase = row.openedByUserId === actor.userId;
      if (!ownCase || to !== SUPPORT_CASE_STATUS.CLOSED) {
        throw new ForbiddenException({
          code: API_ERROR_CODE.FORBIDDEN,
          message: 'Chỉ nhân sự XePrime đổi được trạng thái; bạn chỉ đóng được case của chính mình',
        });
      }
    }
    if (!canTransitionSupportCase(row.status as SupportCaseStatus, to)) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: `Không chuyển được case từ "${row.status}" sang "${to}"`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.supportCase.updateMany({
        where: { id, status: row.status },
        data: {
          status: to,
          ...(to === SUPPORT_CASE_STATUS.RESOLVED ? { resolvedAt: new Date() } : {}),
          ...(to === SUPPORT_CASE_STATUS.CLOSED ? { closedAt: new Date() } : {}),
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.CONFLICT,
          message: 'Case vừa được người khác cập nhật',
        });
      }
      await tx.supportCaseEvent.create({
        data: {
          id: newId(),
          caseId: id,
          actorUserId: actor.userId,
          actorScope: actor.scope,
          kind: SUPPORT_CASE_EVENT_KIND.STATUS_CHANGE,
          visibility: SUPPORT_EVENT_VISIBILITY.PUBLIC,
          body: note?.trim() || null,
          fromStatus: row.status,
          toStatus: to,
        },
      });
      await this.audit.record(
        {
          tenantId: row.tenantId,
          actorUserId: actor.userId,
          actorScope: scopeToAudit(actor.scope),
          action: 'support_case.transition',
          targetType: 'support_case',
          targetId: id,
          before: { status: row.status },
          after: { status: to, ...(note ? { note } : {}) },
        },
        tx,
      );
      await this.notifyOtherParties(tx, row, actor, `${row.code} chuyển sang "${to}"`);
    });
    return this.detail(id, actor);
  }

  /** Kết luận của nền tảng — ghi vào case VÀ vào dòng thời gian, hai bên đều đọc được. */
  async resolve(
    id: string,
    actorUserId: string,
    resolution: string,
  ): Promise<SupportCaseDetailDto> {
    const actor = { userId: actorUserId, scope: SUPPORT_PARTY.PLATFORM, tenantId: null } as const;
    const row = await this.requireOpen(id, actor);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.supportCase.updateMany({
        where: { id, status: { in: [...SUPPORT_CASE_STATUS_OPEN] } },
        data: {
          status: SUPPORT_CASE_STATUS.RESOLVED,
          resolution: resolution.trim(),
          resolvedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.CONFLICT,
          message: 'Case vừa được người khác xử lý',
        });
      }
      await tx.supportCaseEvent.create({
        data: {
          id: newId(),
          caseId: id,
          actorUserId,
          actorScope: SUPPORT_PARTY.PLATFORM,
          kind: SUPPORT_CASE_EVENT_KIND.RESOLUTION,
          visibility: SUPPORT_EVENT_VISIBILITY.PUBLIC,
          body: resolution.trim(),
          fromStatus: row.status,
          toStatus: SUPPORT_CASE_STATUS.RESOLVED,
        },
      });
      await this.audit.record(
        {
          tenantId: row.tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'support_case.resolve',
          targetType: 'support_case',
          targetId: id,
          after: { resolution: resolution.trim() },
        },
        tx,
      );
      await this.notifyOtherParties(tx, row, actor, `${row.code} đã có kết luận`);
    });
    return this.detail(id, actor);
  }

  async assign(
    id: string,
    actorUserId: string,
    dto: AssignSupportCaseDto,
  ): Promise<SupportCaseDetailDto> {
    const actor = { userId: actorUserId, scope: SUPPORT_PARTY.PLATFORM, tenantId: null } as const;
    const row = await this.requireOpen(id, actor);

    await this.prisma.$transaction(async (tx) => {
      await tx.supportCase.update({
        where: { id },
        data: {
          ...(dto.assigneeUserId !== undefined ? { assigneeUserId: dto.assigneeUserId } : {}),
          ...(dto.priority ? { priority: dto.priority } : {}),
          // Nhận việc = bắt đầu xử lý; không bắt admin bấm thêm một nút nữa.
          ...(dto.assigneeUserId && row.status === SUPPORT_CASE_STATUS.OPEN
            ? { status: SUPPORT_CASE_STATUS.IN_PROGRESS }
            : {}),
        },
      });
      await tx.supportCaseEvent.create({
        data: {
          id: newId(),
          caseId: id,
          actorUserId,
          actorScope: SUPPORT_PARTY.PLATFORM,
          kind: SUPPORT_CASE_EVENT_KIND.ASSIGNMENT,
          visibility: SUPPORT_EVENT_VISIBILITY.INTERNAL,
          body: dto.assigneeUserId ? 'Đã phân công' : 'Bỏ phân công',
        },
      });
      await this.audit.record(
        {
          tenantId: row.tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'support_case.assign',
          targetType: 'support_case',
          targetId: id,
          after: { assigneeUserId: dto.assigneeUserId ?? null, priority: dto.priority ?? null },
        },
        tx,
      );
    });
    return this.detail(id, actor);
  }

  // ── Nội bộ ────────────────────────────────────────────────────────────────

  /**
   * Phạm vi ĐỌC theo vai — nền tảng thấy tất cả, gian hàng thấy case của mình, khách thấy case
   * mình mở. Trả về mảnh `where` để nó nằm TRONG truy vấn, không phải một câu `if` sau khi đọc.
   */
  private scopeWhere(actor: {
    userId: string;
    scope: SupportParty;
    tenantId: string | null;
  }): Prisma.SupportCaseWhereInput {
    if (actor.scope === SUPPORT_PARTY.PLATFORM) return {};
    if (actor.scope === SUPPORT_PARTY.TENANT) return { tenantId: actor.tenantId ?? '' };
    return { openedByUserId: actor.userId };
  }

  private async requireOpen(
    id: string,
    actor: { userId: string; scope: SupportParty; tenantId: string | null },
  ): Promise<Row> {
    const row = await this.prisma.supportCase.findFirst({
      where: { id, ...this.scopeWhere(actor) },
      select: SELECT,
    });
    if (!row) throw notFound();
    if (!isSupportCaseOpen(row.status as SupportCaseStatus)) {
      throw new ConflictException({
        code: API_ERROR_CODE.SUPPORT_CASE_CLOSED,
        message: 'Case đã đóng — mở case mới thay vì viết tiếp vào lịch sử',
        details: { status: row.status },
      });
    }
    return row;
  }

  /** Báo cho bên KHÔNG phải người vừa thao tác. Khách và gian hàng đều là "bên còn lại". */
  private async notifyOtherParties(
    tx: Prisma.TransactionClient,
    row: Row,
    actor: { userId: string; scope: SupportParty },
    title: string,
  ): Promise<void> {
    if (row.tenantId && actor.scope !== SUPPORT_PARTY.TENANT) {
      await this.notifications.emitToTenantMembers(
        row.tenantId,
        {
          type: NOTIFICATION_TYPE.SUPPORT_CASE_UPDATED,
          title,
          body: row.subject,
          tenantId: row.tenantId,
          targetType: NOTIFICATION_TARGET_TYPE.SUPPORT_CASE,
          targetId: row.id,
        },
        tx,
      );
    }
    const opener = await tx.supportCase.findUnique({
      where: { id: row.id },
      select: { openedByUserId: true },
    });
    if (opener && opener.openedByUserId !== actor.userId) {
      await this.notifications.emitToUser(
        opener.openedByUserId,
        {
          type: NOTIFICATION_TYPE.SUPPORT_CASE_UPDATED,
          title,
          body: row.subject,
          ...(row.tenantId ? { tenantId: row.tenantId } : {}),
          targetType: NOTIFICATION_TARGET_TYPE.SUPPORT_CASE,
          targetId: row.id,
        },
        tx,
      );
    }
  }
}

function toDto(row: Row): SupportCaseDto {
  return {
    id: row.id,
    code: row.code,
    category: row.category,
    status: row.status,
    priority: row.priority,
    subject: row.subject,
    description: row.description,
    tenantId: row.tenantId,
    tenantName: row.tenant?.name ?? null,
    bookingId: row.bookingId,
    bookingCode: row.booking?.code ?? null,
    bookingRequestId: row.bookingRequestId,
    openedByScope: row.openedByScope,
    openedByName: row.opener.displayName,
    assigneeName: row.assignee?.displayName ?? null,
    resolution: row.resolution,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function scopeToAudit(scope: SupportParty) {
  if (scope === SUPPORT_PARTY.PLATFORM) return AUDIT_ACTOR_SCOPE.PLATFORM;
  if (scope === SUPPORT_PARTY.TENANT) return AUDIT_ACTOR_SCOPE.TENANT;
  return AUDIT_ACTOR_SCOPE.CUSTOMER;
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy yêu cầu hỗ trợ',
  });
}
