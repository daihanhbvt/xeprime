import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import { API_ERROR_CODE, MEMBERSHIP_STATUS, type PaginationMeta } from '@xeprime/types';
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
} satisfies Prisma.UserSelect;

/**
 * "Khách thuê" KHÔNG có bảng riêng — họ là `users` không thuộc gian hàng nào và không phải
 * nhân sự nền tảng (`CUSTOMER_ROLE` ở `@xeprime/types` cũng suy ra như vậy). Điều kiện đó
 * viết thành hai anti-join dưới đây; bỏ nó đi thì màn "khách hàng" sẽ liệt kê cả chủ shop và
 * chính nhân viên nền tảng.
 *
 * Membership `removed` không tính là còn thuộc gian hàng — nhân viên cũ nghỉ việc rồi đi thuê
 * xe thì đúng là khách.
 */
const CUSTOMER_ONLY: Prisma.UserWhereInput = {
  deletedAt: null,
  tenantMemberships: { none: { status: MEMBERSHIP_STATUS.ACTIVE } },
  platformMemberships: { none: { status: MEMBERSHIP_STATUS.ACTIVE } },
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
      // SĐT/email khớp CHÍNH XÁC (cả hai đều unique): hỗ trợ đã có sẵn giá trị khách đọc cho.
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

    // Số yêu cầu đã thành đơn: một groupBy cho cả trang thay vì N truy vấn con.
    const bookedByUser = await this.countBooked(rows.map((r) => r.id));

    return {
      data: rows.map((r) => toListItem(r, bookedByUser.get(r.id) ?? 0)),
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

    const [bookedByUser, recentRequests] = await Promise.all([
      this.countBooked([id]),
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
      ...toListItem(row, bookedByUser.get(id) ?? 0),
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

function toListItem(u: CustomerRow, bookedCount: number): PlatformCustomerDto {
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
