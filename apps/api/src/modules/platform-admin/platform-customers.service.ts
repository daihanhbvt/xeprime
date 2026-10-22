import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  CUSTOMER_LICENCE_STATE,
  DRIVER_LICENCE_STATUS,
  type CustomerLicenceState,
  type PaginationMeta,
} from '@xeprime/types';
import { fromDateOnly } from '../../common/date-only';
import { maskEmail, maskPhone } from '../../common/mask';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { phoneLookupVariants } from '../../common/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CustomerContactDto,
  PLATFORM_CUSTOMER_DEFAULT_LIMIT,
  PLATFORM_CUSTOMER_MAX_LIMIT,
  PlatformCustomerDetailDto,
  PlatformCustomerDto,
  PlatformCustomerListQueryDto,
} from './dto/platform-customer.dto';

/** Lượt nộp bằng lái có ý nghĩa với hồ sơ khách: đang đọc hoặc đã có kết quả (bỏ lượt dở/huỷ/bị thay). */
const LICENCE_RESULT_STATUSES = [
  DRIVER_LICENCE_STATUS.PROCESSING,
  DRIVER_LICENCE_STATUS.VERIFIED,
  DRIVER_LICENCE_STATUS.REJECTED,
] as const;

const LIST_SELECT = {
  id: true,
  displayName: true,
  phone: true,
  email: true,
  status: true,
  phoneVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  _count: { select: { customerBookingRequests: true, reviews: true } },
  // Bằng đang dùng (tối đa một — partial unique) + lượt nộp gần nhất có kết quả hoặc đang đọc.
  driverLicences: {
    where: {
      status: {
        in: [...LICENCE_RESULT_STATUSES],
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
    select: { status: true, expiresOn: true },
  },
} satisfies Prisma.UserSelect;

const LICENCE_VERIFIED: Prisma.CustomerDriverLicenceListRelationFilter = {
  some: { status: DRIVER_LICENCE_STATUS.VERIFIED },
};

/**
 * Lọc theo tình trạng bằng lái — cùng quy tắc với `licenceStateOf`: có bằng đang dùng là
 * `verified`; không thì theo lượt nộp gần nhất. "Gần nhất là X" diễn đạt bằng "có X và không có
 * lượt nào mới hơn X" — không cần cột suy diễn, và dùng index `(user_id, created_at)` sẵn có.
 */
function licenceWhere(state: CustomerLicenceState | undefined): Prisma.UserWhereInput {
  switch (state) {
    case CUSTOMER_LICENCE_STATE.VERIFIED:
      return { driverLicences: LICENCE_VERIFIED };
    case CUSTOMER_LICENCE_STATE.NONE:
      return {
        driverLicences: {
          none: {
            status: {
              in: [...LICENCE_RESULT_STATUSES],
            },
          },
        },
      };
    case CUSTOMER_LICENCE_STATE.PROCESSING:
      return {
        NOT: { driverLicences: LICENCE_VERIFIED },
        driverLicences: { some: { status: DRIVER_LICENCE_STATUS.PROCESSING } },
      };
    case CUSTOMER_LICENCE_STATE.REJECTED:
      return {
        NOT: { driverLicences: LICENCE_VERIFIED },
        AND: [
          { driverLicences: { some: { status: DRIVER_LICENCE_STATUS.REJECTED } } },
          { driverLicences: { none: { status: DRIVER_LICENCE_STATUS.PROCESSING } } },
        ],
      };
    default:
      return {};
  }
}

/**
 * "Khách thuê" là các tài khoản realm `customer` (ADR 0053) — một cột, không còn suy từ "không
 * thuộc gian hàng nào". Chủ shop và nhân sự nền tảng là tài khoản của realm khác, kể cả khi trùng
 * số điện thoại với một khách; muốn thấy mọi tài khoản của một số thì dùng tra cứu xuyên realm
 * (`GET /platform/accounts/lookup`).
 */
const CUSTOMER_ONLY: Prisma.UserWhereInput = {
  deletedAt: null,
  realm: ACCOUNT_REALM.CUSTOMER,
};

/**
 * Tra cứu khách thuê toàn hệ thống cho admin nền tảng (build plan §11.1) — CHỈ ĐỌC, và mọi
 * thông tin liên hệ trả ra đều đã che. Bỏ che là `revealContact`: quyền riêng + ghi audit.
 */
@Injectable()
export class PlatformCustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: PlatformCustomerListQueryDto,
  ): Promise<{ data: PlatformCustomerDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(
      query,
      PLATFORM_CUSTOMER_DEFAULT_LIMIT,
      PLATFORM_CUSTOMER_MAX_LIMIT,
    );

    const q = query.q?.trim();
    const phone = query.phone?.trim();
    const email = query.email?.trim().toLowerCase();

    const where: Prisma.UserWhereInput = {
      ...CUSTOMER_ONLY,
      ...(query.status ? { status: query.status } : {}),
      ...(query.hasRequests ? { customerBookingRequests: { some: {} } } : {}),
      ...licenceWhere(query.licence as CustomerLicenceState | undefined),
      // SĐT/email khớp CHÍNH XÁC (unique trong realm khách): hỗ trợ đã có sẵn giá trị khách đọc cho.
      // Cho tìm gần đúng ở đây là biến ô tra cứu thành công cụ quét danh bạ khách hàng.
      // `users.phone` lưu dạng `84…`, còn hỗ trợ gõ `09…` — so khớp mọi dạng lưu (common/phone).
      ...(phone ? { phone: { in: phoneLookupVariants(phone) } } : {}),
      ...(email ? { email } : {}),
      ...(q ? { displayName: { contains: q, mode: 'insensitive' } } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: LIST_SELECT,
      }),
    ]);

    // Số yêu cầu đã thành đơn + bằng đang dùng: một truy vấn cho cả trang, không N truy vấn con.
    const ids = rows.map((r) => r.id);
    const [bookedByUser, verifiedByUser] = await Promise.all([
      this.countBooked(ids),
      this.verifiedLicences(ids),
    ]);

    return {
      data: rows.map((r) => toListItem(r, bookedByUser.get(r.id) ?? 0, verifiedByUser.get(r.id))),
      meta: paginationMeta(paging, total),
    };
  }

  async getOne(id: string): Promise<PlatformCustomerDetailDto> {
    const row = await this.prisma.user.findFirst({
      where: { id, ...CUSTOMER_ONLY },
      select: {
        ...LIST_SELECT,
        emailVerifiedAt: true,
        updatedAt: true,
        _count: {
          select: {
            customerBookingRequests: true,
            reviews: true,
            customerConversations: true,
          },
        },
      },
    });
    if (!row) throw notFound();

    const [bookedByUser, verifiedByUser, recentRequests] = await Promise.all([
      this.countBooked([id]),
      this.verifiedLicences([id]),
      this.prisma.bookingRequest.findMany({
        where: { customerUserId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 10,
        select: {
          id: true,
          status: true,
          pickupAt: true,
          returnAt: true,
          bookingId: true,
          createdAt: true,
          tenant: { select: { name: true } },
          vehicle: { select: { name: true } },
          booking: { select: { code: true } },
        },
      }),
    ]);

    return {
      ...toListItem(row, bookedByUser.get(id) ?? 0, verifiedByUser.get(id)),
      emailVerifiedAt: row.emailVerifiedAt ? (row.emailVerifiedAt as Date).toISOString() : null,
      conversationCount: row._count.customerConversations,
      recentRequests: recentRequests.map((r) => ({
        id: r.id,
        status: r.status,
        tenantName: r.tenant.name,
        vehicleName: r.vehicle.name,
        pickupAt: (r.pickupAt as Date).toISOString(),
        returnAt: (r.returnAt as Date).toISOString(),
        bookingId: r.bookingId,
        bookingCode: r.booking?.code ?? null,
        createdAt: (r.createdAt as Date).toISOString(),
      })),
      updatedAt: (row.updatedAt as Date).toISOString(),
    };
  }

  /**
   * SĐT/email đầy đủ của khách. Ghi `audit_logs` ngay cả khi không đổi gì trong DB — "ai đã
   * xem thông tin liên hệ của khách nào, lúc nào" phải trả lời được (CLAUDE.md §6).
   */
  async revealContact(id: string, actorUserId: string): Promise<CustomerContactDto> {
    const row = await this.prisma.user.findFirst({
      where: { id, ...CUSTOMER_ONLY },
      select: { id: true, phone: true, email: true },
    });
    if (!row) throw notFound();

    await this.audit.record({
      actorUserId,
      actorScope: 'platform',
      action: 'customer.contact_reveal',
      targetType: 'user',
      targetId: id,
      // Chỉ ghi ĐÃ xem cái gì, không chép giá trị PII vào log.
      after: { revealed: ['phone', 'email'] },
    });

    return { customerId: row.id, phone: row.phone, email: row.email };
  }

  /** Bằng ĐANG DÙNG của các khách — hạn của nó, theo khách. */
  private async verifiedLicences(userIds: string[]): Promise<Map<string, VerifiedLicence>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.customerDriverLicence.findMany({
      where: { userId: { in: userIds }, status: DRIVER_LICENCE_STATUS.VERIFIED },
      select: { userId: true, expiresOn: true },
    });
    return new Map(rows.map((r) => [r.userId, { expiresOn: r.expiresOn }]));
  }

  /** Đếm yêu cầu đã chuyển thành đơn thuê, gom theo khách (bookingId khác null). */
  private async countBooked(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.bookingRequest.groupBy({
      by: ['customerUserId'],
      where: { customerUserId: { in: userIds }, bookingId: { not: null } },
      _count: { _all: true },
    });
    return new Map(
      rows
        .filter((r): r is typeof r & { customerUserId: string } => r.customerUserId != null)
        .map((r) => [r.customerUserId, r._count._all]),
    );
  }
}

type CustomerRow = Prisma.UserGetPayload<{ select: typeof LIST_SELECT }>;

interface VerifiedLicence {
  expiresOn: Date | null;
}

function licenceStateOf(
  u: CustomerRow,
  verified: VerifiedLicence | undefined,
): CustomerLicenceState {
  if (verified) return CUSTOMER_LICENCE_STATE.VERIFIED;
  const latest = u.driverLicences[0];
  if (!latest) return CUSTOMER_LICENCE_STATE.NONE;
  return latest.status === DRIVER_LICENCE_STATUS.PROCESSING
    ? CUSTOMER_LICENCE_STATE.PROCESSING
    : CUSTOMER_LICENCE_STATE.REJECTED;
}

function toListItem(
  u: CustomerRow,
  bookedCount: number,
  verified: VerifiedLicence | undefined,
): PlatformCustomerDto {
  return {
    id: u.id,
    displayName: u.displayName,
    phoneMasked: maskPhone(u.phone),
    emailMasked: maskEmail(u.email),
    status: u.status,
    phoneVerified: u.phoneVerifiedAt != null,
    requestCount: u._count.customerBookingRequests,
    bookedCount,
    reviewCount: u._count.reviews,
    licenceState: licenceStateOf(u, verified),
    licenceExpiresOn: fromDateOnly(verified?.expiresOn ?? null),
    lastLoginAt: u.lastLoginAt ? (u.lastLoginAt as Date).toISOString() : null,
    createdAt: (u.createdAt as Date).toISOString(),
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy khách hàng',
  });
}
