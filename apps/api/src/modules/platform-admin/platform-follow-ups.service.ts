import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  AUDIT_TARGET_TYPE,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  CANCELLATION_PARTY,
  FOLLOW_UP_AUDIT_ACTION,
  FOLLOW_UP_LOST_REASON,
  FOLLOW_UP_STATUS,
  MEMBERSHIP_STATUS,
  PERMISSION,
  USER_STATUS,
  type FollowUpLostReason,
  type FollowUpStatus,
  type PlatformRole,
  type PaginationMeta,
} from '@xeprime/types';
import { dayRangeFilter } from '../../common/day-range';
import { maskPhone } from '../../common/mask';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { phoneLookupVariants } from '../../common/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import {
  FollowUpAssigneeDto,
  FollowUpContactDto,
  PLATFORM_FOLLOW_UP_DEFAULT_LIMIT,
  PLATFORM_FOLLOW_UP_MAX_LIMIT,
  PlatformFollowUpDto,
  PlatformFollowUpListQueryDto,
  UpdateFollowUpDto,
} from './dto/platform-follow-up.dto';

/** Yêu cầu kết thúc mà không thành đơn — mỗi trạng thái ứng đúng một lý do. */
const LOST_REQUEST_REASON: Readonly<Record<string, FollowUpLostReason>> = {
  [BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER]: FOLLOW_UP_LOST_REASON.CUSTOMER_CANCELLED,
  [BOOKING_REQUEST_STATUS.HOLD_EXPIRED]: FOLLOW_UP_LOST_REASON.UNPAID,
  [BOOKING_REQUEST_STATUS.REJECTED_BY_HOST]: FOLLOW_UP_LOST_REASON.HOST_DECLINED,
  [BOOKING_REQUEST_STATUS.CANCELLED_BY_HOST]: FOLLOW_UP_LOST_REASON.HOST_DECLINED,
  [BOOKING_REQUEST_STATUS.EXPIRED]: FOLLOW_UP_LOST_REASON.NO_RESPONSE,
  [BOOKING_REQUEST_STATUS.SLOT_TAKEN]: FOLLOW_UP_LOST_REASON.SLOT_TAKEN,
};
const LOST_REQUEST_STATUSES = Object.keys(LOST_REQUEST_REASON);

/** Đã thành đơn rồi đơn bị huỷ. */
const CANCELLED_BOOKING: Prisma.BookingRequestWhereInput = {
  status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
  booking: { status: BOOKING_STATUS.CANCELLED },
};

const statusesFor = (reason: FollowUpLostReason) =>
  LOST_REQUEST_STATUSES.filter((s) => LOST_REQUEST_REASON[s] === reason);

/**
 * Mệnh đề "mất đơn" theo lý do — cùng quy tắc với `lostReasonOf`. Không lý do = mọi mục.
 */
function lostWhere(reason: FollowUpLostReason | undefined): Prisma.BookingRequestWhereInput {
  const byParty = (parties: string[]): Prisma.BookingRequestWhereInput => ({
    ...CANCELLED_BOOKING,
    cancellation: { is: { responsibleParty: { in: parties } } },
  });
  switch (reason) {
    case undefined:
      return { OR: [{ status: { in: LOST_REQUEST_STATUSES } }, CANCELLED_BOOKING] };
    case FOLLOW_UP_LOST_REASON.CUSTOMER_CANCELLED:
      return {
        OR: [{ status: { in: statusesFor(reason) } }, byParty([CANCELLATION_PARTY.CUSTOMER])],
      };
    case FOLLOW_UP_LOST_REASON.HOST_DECLINED:
      return { OR: [{ status: { in: statusesFor(reason) } }, byParty([CANCELLATION_PARTY.HOST])] };
    case FOLLOW_UP_LOST_REASON.OTHER_CANCELLED:
      return {
        ...CANCELLED_BOOKING,
        OR: [
          { cancellation: { is: null } },
          {
            cancellation: {
              is: {
                responsibleParty: {
                  in: [CANCELLATION_PARTY.PLATFORM, CANCELLATION_PARTY.FORCE_MAJEURE],
                },
              },
            },
          },
        ],
      };
    default:
      return { status: { in: statusesFor(reason) } };
  }
}

/** Mọi mục "mất đơn" — gác ghi/xem liên hệ: chỉ yêu cầu đã kết thúc mới có kết quả chăm sóc. */
const ANY_LOST = lostWhere(undefined);

function followUpWhere(
  status: FollowUpStatus | undefined,
  mine: boolean,
  actorUserId: string,
): Prisma.BookingRequestWhereInput[] {
  const out: Prisma.BookingRequestWhereInput[] = [];
  if (status === FOLLOW_UP_STATUS.NEW) {
    out.push({
      OR: [{ salesFollowUp: { is: null } }, { salesFollowUp: { is: { status } } }],
    });
  } else if (status) {
    out.push({ salesFollowUp: { is: { status } } });
  }
  if (mine) out.push({ salesFollowUp: { is: { assigneeUserId: actorUserId } } });
  return out;
}

const LIST_SELECT = {
  id: true,
  status: true,
  serviceType: true,
  customerName: true,
  customerPhone: true,
  customerUserId: true,
  pickupAt: true,
  returnAt: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
  tenant: { select: { name: true } },
  vehicle: { select: { name: true } },
  booking: { select: { code: true, status: true } },
  cancellation: {
    select: { responsibleParty: true, reasonCategory: true, reason: true, cancelledAt: true },
  },
  salesFollowUp: {
    select: {
      status: true,
      note: true,
      assigneeUserId: true,
      lastContactedAt: true,
      updatedAt: true,
      assignee: { select: { displayName: true } },
      updater: { select: { displayName: true } },
    },
  },
} satisfies Prisma.BookingRequestSelect;

type Row = Prisma.BookingRequestGetPayload<{ select: typeof LIST_SELECT }>;

/**
 * Chăm sóc khách MẤT ĐƠN — tab "Cần chăm sóc" (ADR 0070). Đọc yêu cầu thuê đã kết thúc mà không
 * thành chuyến; writer DUY NHẤT của `sales_follow_ups`. Không chạm trạng thái yêu cầu/đơn — đó vẫn
 * là việc của gian hàng (ADR 0006). SĐT khách luôn che; bản đầy đủ qua `revealContact` + audit.
 */
@Injectable()
export class PlatformFollowUpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
  ) {}

  /**
   * Người giao được làm phụ trách: nhân sự nền tảng đang hoạt động CÓ quyền ghi kết quả chăm sóc.
   * Đọc quyền qua `RbacService` (cùng nguồn với guard, có cache) — không suy từ tên vai, vì quyền
   * của một vai sửa được trong DB.
   */
  async listAssignees(): Promise<FollowUpAssigneeDto[]> {
    const members = await this.prisma.platformMembership.findMany({
      where: {
        status: MEMBERSHIP_STATUS.ACTIVE,
        user: { realm: ACCOUNT_REALM.PLATFORM, status: USER_STATUS.ACTIVE, deletedAt: null },
      },
      select: {
        roleKey: true,
        roleId: true,
        user: { select: { id: true, displayName: true, email: true } },
      },
      orderBy: { user: { displayName: 'asc' } },
    });
    const out: FollowUpAssigneeDto[] = [];
    for (const m of members) {
      const permissions = await this.rbac.permissionsForPlatformMember(
        m.roleKey as PlatformRole,
        m.roleId,
      );
      if (permissions.includes(PERMISSION.PLATFORM_SALES_FOLLOWUP_MANAGE)) {
        out.push({
          id: m.user.id,
          displayName: m.user.displayName,
          email: m.user.email,
          roleKey: m.roleKey,
        });
      }
    }
    return out;
  }

  async list(
    query: PlatformFollowUpListQueryDto,
    actorUserId: string,
  ): Promise<{ data: PlatformFollowUpDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(
      query,
      PLATFORM_FOLLOW_UP_DEFAULT_LIMIT,
      PLATFORM_FOLLOW_UP_MAX_LIMIT,
    );
    const q = query.q?.trim();
    const phone = query.phone?.trim();
    const range = dayRangeFilter(query.dateFrom, query.dateTo);

    const where: Prisma.BookingRequestWhereInput = {
      AND: [
        lostWhere(query.reason as FollowUpLostReason | undefined),
        ...followUpWhere(
          query.followUpStatus as FollowUpStatus | undefined,
          query.mine === true,
          actorUserId,
        ),
        ...(phone ? [{ customerPhone: { in: phoneLookupVariants(phone) } }] : []),
        ...(range ? [{ updatedAt: range }] : []),
        ...(q
          ? [
              {
                OR: [
                  { customerName: { contains: q, mode: 'insensitive' as const } },
                  { vehicle: { name: { contains: q, mode: 'insensitive' as const } } },
                  { booking: { code: { contains: q, mode: 'insensitive' as const } } },
                ],
              },
            ]
          : []),
      ],
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.bookingRequest.count({ where }),
      this.prisma.bookingRequest.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: LIST_SELECT,
      }),
    ]);
    const rebooked = await this.rebookedLater(rows);
    return {
      data: rows.map((r) => toDto(r, rebooked.has(r.id))),
      meta: paginationMeta(paging, total),
    };
  }

  /** Ghi kết quả chăm sóc — tạo dòng ở lần ghi đầu; mỗi lần ghi một dòng audit cùng transaction. */
  async update(
    requestId: string,
    actorUserId: string,
    dto: UpdateFollowUpDto,
  ): Promise<PlatformFollowUpDto> {
    const request = await this.prisma.bookingRequest.findFirst({
      where: { AND: [{ id: requestId }, ANY_LOST] },
      select: { id: true, salesFollowUp: true },
    });
    if (!request) throw notFound();

    const assigneeUserId = dto.assigneeUserId === undefined ? undefined : dto.assigneeUserId;
    if (assigneeUserId) await this.assertAssignable(assigneeUserId);

    const before = request.salesFollowUp;
    const now = new Date();
    const status = dto.status as FollowUpStatus;
    const note = dto.note === undefined ? undefined : dto.note || null;
    // "Đã gọi cho khách" là TRẠNG THÁI: true ghi mốc (giữ mốc cũ nếu đã có), false xoá, bỏ trống = giữ nguyên.
    const lastContactedAt: Date | null | undefined =
      dto.markContacted === undefined
        ? undefined
        : dto.markContacted
          ? (before?.lastContactedAt ?? now)
          : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.salesFollowUp.upsert({
        where: { bookingRequestId: requestId },
        create: {
          id: newId(),
          bookingRequestId: requestId,
          status,
          note: note ?? null,
          assigneeUserId: assigneeUserId ?? null,
          lastContactedAt: lastContactedAt ?? null,
          updatedBy: actorUserId,
        },
        update: {
          status,
          ...(note !== undefined ? { note } : {}),
          ...(assigneeUserId !== undefined ? { assigneeUserId } : {}),
          ...(lastContactedAt !== undefined ? { lastContactedAt } : {}),
          updatedBy: actorUserId,
        },
      });
      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: FOLLOW_UP_AUDIT_ACTION.UPDATE,
          targetType: AUDIT_TARGET_TYPE.BOOKING_REQUEST,
          targetId: requestId,
          before: before
            ? { status: before.status, assigneeUserId: before.assigneeUserId }
            : { status: FOLLOW_UP_STATUS.NEW },
          after: {
            status,
            ...(assigneeUserId !== undefined ? { assigneeUserId } : {}),
            ...(note !== undefined ? { noteChanged: true } : {}),
            ...(lastContactedAt !== undefined ? { contacted: lastContactedAt !== null } : {}),
          },
        },
        tx,
      );
    });

    const row = await this.prisma.bookingRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: LIST_SELECT,
    });
    const rebooked = await this.rebookedLater([row]);
    return toDto(row, rebooked.has(row.id));
  }

  /** SĐT/email khách đầy đủ để gọi lại — mỗi lần xem một dòng audit, không chép PII vào log. */
  async revealContact(requestId: string, actorUserId: string): Promise<FollowUpContactDto> {
    const row = await this.prisma.bookingRequest.findFirst({
      where: { AND: [{ id: requestId }, ANY_LOST] },
      select: { id: true, customerPhone: true, customerEmail: true },
    });
    if (!row) throw notFound();
    await this.audit.record({
      actorUserId,
      actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
      action: FOLLOW_UP_AUDIT_ACTION.CONTACT_REVEAL,
      targetType: AUDIT_TARGET_TYPE.BOOKING_REQUEST,
      targetId: requestId,
      after: { revealed: ['phone', 'email'] },
    });
    return { id: row.id, customerPhone: row.customerPhone, customerEmail: row.customerEmail };
  }

  /** Người phụ trách phải nằm trong danh sách giao được — cùng phép lọc với `listAssignees`. */
  private async assertAssignable(userId: string): Promise<void> {
    const assignees = await this.listAssignees();
    if (!assignees.some((a) => a.id === userId)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Người phụ trách phải là nhân sự nền tảng đang hoạt động có quyền chăm sóc khách',
      });
    }
  }

  /**
   * Khách đã có ĐƠN khác (chưa huỷ) gửi SAU mục này chưa — một truy vấn cho cả trang. Chỉ xét
   * tài khoản khách: SĐT tự khai trên yêu cầu cũ không phải danh tính (ADR 0060).
   */
  private async rebookedLater(rows: Row[]): Promise<Set<string>> {
    const userIds = [...new Set(rows.map((r) => r.customerUserId).filter((v): v is string => !!v))];
    if (userIds.length === 0) return new Set();
    const earliest = new Date(Math.min(...rows.map((r) => r.createdAt.getTime())));
    const later = await this.prisma.bookingRequest.findMany({
      where: {
        customerUserId: { in: userIds },
        status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        createdAt: { gt: earliest },
        booking: { status: { not: BOOKING_STATUS.CANCELLED } },
      },
      select: { customerUserId: true, createdAt: true },
    });
    const out = new Set<string>();
    for (const r of rows) {
      if (!r.customerUserId) continue;
      const hit = later.some(
        (l) => l.customerUserId === r.customerUserId && l.createdAt > r.createdAt,
      );
      if (hit) out.add(r.id);
    }
    return out;
  }
}

function lostReasonOf(row: Row): FollowUpLostReason {
  const direct = LOST_REQUEST_REASON[row.status];
  if (direct) return direct;
  switch (row.cancellation?.responsibleParty) {
    case CANCELLATION_PARTY.CUSTOMER:
      return FOLLOW_UP_LOST_REASON.CUSTOMER_CANCELLED;
    case CANCELLATION_PARTY.HOST:
      return FOLLOW_UP_LOST_REASON.HOST_DECLINED;
    default:
      return FOLLOW_UP_LOST_REASON.OTHER_CANCELLED;
  }
}

function toDto(row: Row, rebookedLater: boolean): PlatformFollowUpDto {
  const f = row.salesFollowUp;
  return {
    id: row.id,
    lostReason: lostReasonOf(row),
    requestStatus: row.status,
    serviceType: row.serviceType,
    customerName: row.customerName,
    customerPhoneMasked: maskPhone(row.customerPhone),
    customerUserId: row.customerUserId,
    tenantId: row.tenantId,
    tenantName: row.tenant.name,
    vehicleName: row.vehicle.name,
    bookingCode: row.booking?.code ?? null,
    pickupAt: row.pickupAt?.toISOString() ?? null,
    returnAt: row.returnAt?.toISOString() ?? null,
    requestedAt: row.createdAt.toISOString(),
    closedAt: (row.cancellation?.cancelledAt ?? row.updatedAt).toISOString(),
    cancellation: row.cancellation
      ? {
          responsibleParty: row.cancellation.responsibleParty,
          reasonCategory: row.cancellation.reasonCategory,
          reason: row.cancellation.reason,
          cancelledAt: row.cancellation.cancelledAt.toISOString(),
        }
      : null,
    rebookedLater,
    followUpStatus: f?.status ?? FOLLOW_UP_STATUS.NEW,
    note: f?.note ?? null,
    assigneeUserId: f?.assigneeUserId ?? null,
    assigneeName: f?.assignee?.displayName ?? null,
    lastContactedAt: f?.lastContactedAt?.toISOString() ?? null,
    followUpUpdatedAt: f?.updatedAt.toISOString() ?? null,
    followUpUpdatedByName: f?.updater.displayName ?? null,
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy yêu cầu thuê cần chăm sóc',
  });
}
