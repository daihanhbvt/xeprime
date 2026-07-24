import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  type PaginationMeta,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BookingsService } from '../bookings/bookings.service';
import {
  BOOKING_REQUEST_DEFAULT_LIMIT,
  BOOKING_REQUEST_MAX_LIMIT,
  BookingRequestDto,
  BookingRequestListQueryDto,
  BookingRequestReceiptDto,
  CreateBookingRequestDto,
} from './dto/booking-request.dto';

const SELECT = {
  id: true,
  vehicleId: true,
  status: true,
  customerName: true,
  customerPhone: true,
  customerEmail: true,
  pickupAt: true,
  returnAt: true,
  note: true,
  rejectReason: true,
  bookingId: true,
  createdAt: true,
  vehicle: { select: { name: true, plateNumber: true } },
} satisfies Prisma.BookingRequestSelect;

@Injectable()
export class BookingRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Khách gửi yêu cầu từ Marketplace (công khai). `tenantId` suy từ xe — chỉ nhận nếu xe đã
   * `approved_public` thuộc shop `active`. KHÔNG giữ chỗ lịch (còn pending), chỉ ghi yêu cầu.
   */
  async submitPublic(dto: CreateBookingRequestDto): Promise<BookingRequestReceiptDto> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: dto.vehicleId,
        deletedAt: null,
        publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
        tenant: { status: TENANT_STATUS.ACTIVE, deletedAt: null },
      },
      select: { id: true, tenantId: true },
    });
    if (!vehicle) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Xe không khả dụng để đặt',
      });
    }

    const pickupAt = new Date(dto.pickupAt);
    const returnAt = new Date(dto.returnAt);
    if (!(returnAt.getTime() > pickupAt.getTime())) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Thời điểm trả xe phải sau thời điểm nhận xe',
      });
    }

    const id = newId();
    await this.prisma.bookingRequest.create({
      data: {
        id,
        tenantId: vehicle.tenantId,
        vehicleId: vehicle.id,
        status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        customerEmail: dto.customerEmail ?? null,
        pickupAt,
        returnAt,
        note: dto.note ?? null,
      },
    });
    return { id, status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL };
  }

  async list(
    tenantId: string,
    query: BookingRequestListQueryDto,
  ): Promise<{ data: BookingRequestDto[]; meta: PaginationMeta }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      BOOKING_REQUEST_MAX_LIMIT,
      Math.max(1, query.limit ?? BOOKING_REQUEST_DEFAULT_LIMIT),
    );

    const where: Prisma.BookingRequestWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.bookingRequest.count({ where }),
      this.prisma.bookingRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: SELECT,
      }),
    ]);

    return {
      data: rows.map(toDto),
      meta: { page, limit, total, hasNext: page * limit < total },
    };
  }

  async getOne(tenantId: string, id: string): Promise<BookingRequestDto> {
    const row = await this.prisma.bookingRequest.findFirst({
      where: { id, tenantId },
      select: SELECT,
    });
    if (!row) throw notFound();
    return toDto(row);
  }

  /**
   * Shop duyệt → tạo Booking (giữ chỗ lịch) trong CÙNG transaction rồi set converted_to_booking.
   * Nếu xe đã bận khung giờ đó → `createWithinTx` để constraint ném 23P01 → 409 (ADR 0006).
   */
  async approve(tenantId: string, userId: string, id: string): Promise<BookingRequestDto> {
    const req = await this.loadPending(tenantId, id);

    const row = await this.prisma.$transaction(async (tx) => {
      const booking = await this.bookings.createWithinTx(tx, tenantId, userId, {
        vehicleId: req.vehicleId,
        customerName: req.customerName,
        customerPhone: req.customerPhone,
        pickupAt: req.pickupAt.toISOString(),
        returnAt: req.returnAt.toISOString(),
      });

      const updated = await tx.bookingRequest.update({
        where: { id },
        data: {
          status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
          bookingId: booking.id,
          decidedBy: userId,
          decidedAt: new Date(),
        },
        select: SELECT,
      });

      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'booking_request.approve',
          targetType: 'booking_request',
          targetId: id,
          after: { bookingId: booking.id },
        },
        tx,
      );

      return updated;
    });

    return toDto(row);
  }

  async reject(
    tenantId: string,
    userId: string,
    id: string,
    reason?: string,
  ): Promise<BookingRequestDto> {
    await this.loadPending(tenantId, id);

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.bookingRequest.update({
        where: { id },
        data: {
          status: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
          rejectReason: reason ?? null,
          decidedBy: userId,
          decidedAt: new Date(),
        },
        select: SELECT,
      });

      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'booking_request.reject',
          targetType: 'booking_request',
          targetId: id,
        },
        tx,
      );

      return updated;
    });

    return toDto(row);
  }

  /** Nạp yêu cầu đang chờ duyệt; đã quyết định rồi thì chặn (không duyệt/từ chối hai lần). */
  private async loadPending(tenantId: string, id: string) {
    const req = await this.prisma.bookingRequest.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        status: true,
        vehicleId: true,
        customerName: true,
        customerPhone: true,
        pickupAt: true,
        returnAt: true,
      },
    });
    if (!req) throw notFound();
    if (req.status !== BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Yêu cầu này đã được xử lý',
      });
    }
    return req;
  }
}

type BookingRequestRow = Prisma.BookingRequestGetPayload<{ select: typeof SELECT }>;

function toDto(r: BookingRequestRow): BookingRequestDto {
  return {
    id: r.id,
    vehicleId: r.vehicleId,
    vehicleName: r.vehicle.name,
    vehiclePlate: r.vehicle.plateNumber,
    status: r.status,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    customerEmail: r.customerEmail,
    pickupAt: r.pickupAt as unknown as string,
    returnAt: r.returnAt as unknown as string,
    note: r.note,
    rejectReason: r.rejectReason,
    bookingId: r.bookingId,
    createdAt: r.createdAt as unknown as string,
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy yêu cầu đặt xe',
  });
}
