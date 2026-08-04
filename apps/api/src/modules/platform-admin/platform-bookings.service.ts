import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import { API_ERROR_CODE, BOOKING_DATE_FIELD, type PaginationMeta } from '@xeprime/types';
import { maskPhone } from '../../common/mask';
import { bookingDebt } from '../../common/money';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { phoneLookupVariants } from '../../common/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  BookingContactDto,
  PLATFORM_BOOKING_DEFAULT_LIMIT,
  PLATFORM_BOOKING_MAX_LIMIT,
  PlatformBookingDetailDto,
  PlatformBookingDto,
  PlatformBookingListQueryDto,
} from './dto/platform-booking.dto';

const LIST_SELECT = {
  id: true,
  code: true,
  status: true,
  serviceType: true,
  customerName: true,
  customerPhone: true,
  pickupAt: true,
  returnAt: true,
  totalAmount: true,
  paidAmount: true,
  tenantId: true,
  vehicleId: true,
  createdAt: true,
  tenant: { select: { name: true, status: true } },
  vehicle: { select: { name: true, plateNumber: true } },
} satisfies Prisma.BookingSelect;

/**
 * Đơn thuê TOÀN HỆ THỐNG cho admin nền tảng (build plan §11.1) — chỉ ĐỌC.
 *
 * Nền tảng giám sát và hỗ trợ, KHÔNG can thiệp trạng thái đơn: chuyển trạng thái là việc của
 * shop (`BookingsService`, có kiểm tra `canTransitionBooking` + giữ lịch qua `OccupancyService`
 * — ADR 0006). Mở một đường ghi thứ hai ở đây là mở đường phá vỡ bất biến lịch.
 *
 * SĐT khách luôn trả bản đã che; số đầy đủ đi qua `revealContact` (quyền riêng + audit).
 */
@Injectable()
export class PlatformBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: PlatformBookingListQueryDto,
  ): Promise<{ data: PlatformBookingDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, PLATFORM_BOOKING_DEFAULT_LIMIT, PLATFORM_BOOKING_MAX_LIMIT);

    const q = query.q?.trim();
    const phone = query.phone?.trim();
    const range =
      query.dateFrom || query.dateTo
        ? {
            ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
          }
        : undefined;
    const dateField =
      query.dateField === BOOKING_DATE_FIELD.PICKUP_AT
        ? BOOKING_DATE_FIELD.PICKUP_AT
        : BOOKING_DATE_FIELD.CREATED_AT;

    const where: Prisma.BookingWhereInput = {
      deletedAt: null,
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.status ? { status: query.status } : {}),
      // Tra theo SĐT là khớp CHÍNH XÁC: nhân viên hỗ trợ có sẵn số khách đọc cho, và khớp
      // chính xác thì không lộ được danh sách khách bằng cách dò tiền tố. `customer_phone` lưu
      // THÔ như shop gõ nên phải so cả `09…` lẫn `84…` (common/phone).
      ...(phone ? { customerPhone: { in: phoneLookupVariants(phone) } } : {}),
      ...(range ? { [dateField]: range } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { customerName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: LIST_SELECT,
      }),
    ]);

    return { data: rows.map(toListItem), meta: paginationMeta(paging, total) };
  }

  async getOne(id: string): Promise<PlatformBookingDetailDto> {
    const row = await this.prisma.booking.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...LIST_SELECT,
        baseAmount: true,
        deliveryFee: true,
        discountAmount: true,
        depositAmount: true,
        actualPickupAt: true,
        actualReturnAt: true,
        note: true,
        updatedAt: true,
        creator: { select: { displayName: true } },
        contract: { select: { id: true } },
        _count: { select: { receipts: true, payments: true } },
      },
    });
    if (!row) throw notFound();

    return {
      ...toListItem(row),
      baseAmount: row.baseAmount as unknown as string,
      deliveryFee: row.deliveryFee as unknown as string,
      discountAmount: row.discountAmount as unknown as string,
      depositAmount: row.depositAmount as unknown as string,
      actualPickupAt: row.actualPickupAt ? (row.actualPickupAt as Date).toISOString() : null,
      actualReturnAt: row.actualReturnAt ? (row.actualReturnAt as Date).toISOString() : null,
      note: row.note,
      createdByName: row.creator?.displayName ?? null,
      receiptCount: row._count.receipts,
      paymentCount: row._count.payments,
      hasContract: row.contract != null,
      updatedAt: (row.updatedAt as Date).toISOString(),
    };
  }

  /**
   * SĐT khách ở dạng đầy đủ. Đây là hành động có hệ quả riêng tư nên ghi `audit_logs` NGAY cả
   * khi không có gì thay đổi trong DB — "ai đã xem số của khách nào, lúc nào" là thứ phải trả
   * lời được (CLAUDE.md §6, lằn ranh 3).
   */
  async revealContact(id: string, actorUserId: string): Promise<BookingContactDto> {
    const row = await this.prisma.booking.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, tenantId: true, customerPhone: true },
    });
    if (!row) throw notFound();

    await this.audit.record({
      tenantId: row.tenantId,
      actorUserId,
      actorScope: 'platform',
      action: 'booking.contact_reveal',
      targetType: 'booking',
      targetId: id,
      // KHÔNG ghi chính số điện thoại vào audit: log là nơi nhiều người đọc được hơn, chép PII
      // vào đó là nhân bản đúng thứ vừa siết.
      after: { revealed: 'customerPhone' },
    });

    return { bookingId: row.id, customerPhone: row.customerPhone };
  }
}

type BookingRow = Prisma.BookingGetPayload<{ select: typeof LIST_SELECT }>;

function toListItem(b: BookingRow): PlatformBookingDto {
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    serviceType: b.serviceType,
    customerName: b.customerName,
    customerPhoneMasked: maskPhone(b.customerPhone),
    pickupAt: (b.pickupAt as Date).toISOString(),
    returnAt: (b.returnAt as Date).toISOString(),
    totalAmount: b.totalAmount as unknown as string,
    paidAmount: b.paidAmount as unknown as string,
    debtAmount: bookingDebt(b.totalAmount, b.paidAmount) as unknown as string,
    tenantId: b.tenantId,
    tenantName: b.tenant.name,
    tenantStatus: b.tenant.status,
    vehicleId: b.vehicleId,
    vehicleName: b.vehicle.name,
    vehiclePlateNumber: b.vehicle.plateNumber,
    createdAt: (b.createdAt as Date).toISOString(),
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy đơn thuê',
  });
}
