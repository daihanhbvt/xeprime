import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  type PaginationMeta,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { OccupancyService } from '../calendar/occupancy.service';
import { NotificationService } from '../notification/notification.service';
import { BookingsService } from '../bookings/bookings.service';
import { PhoneVerificationService } from '../phone-verification/phone-verification.service';
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
    private readonly notifications: NotificationService,
    private readonly phoneVerification: PhoneVerificationService,
    private readonly auth: AuthService,
    private readonly occupancy: OccupancyService,
  ) {}

  /**
   * Xe khả dụng để đặt: đã `approved_public` và thuộc shop `active`. `tenantId` suy từ xe ở server
   * (không tin client). Dùng chung cho submit + check-availability.
   */
  private async loadBookableVehicle(vehicleId: string): Promise<{ id: string; tenantId: string; name: string }> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        deletedAt: null,
        publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
        tenant: { status: TENANT_STATUS.ACTIVE, deletedAt: null },
      },
      select: { id: true, tenantId: true, name: true },
    });
    if (!vehicle) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Xe không khả dụng để đặt',
      });
    }
    return vehicle;
  }

  /**
   * Preview khung giờ trống cho khách (công khai) — tái dùng `OccupancyService.findOverlapping`.
   * ADR 0006: KHÔNG phải bảo vệ (có thể cũ ngay khi trả về); quyết định thật khi shop duyệt
   * (constraint chặn). Chỉ trả boolean, không lộ chi tiết đơn đang chiếm chỗ.
   */
  async checkPublicAvailability(
    vehicleId: string,
    pickupAt: string,
    returnAt: string,
  ): Promise<{ available: boolean }> {
    const vehicle = await this.loadBookableVehicle(vehicleId);
    const start = new Date(pickupAt);
    const end = new Date(returnAt);
    if (!(end.getTime() > start.getTime())) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Thời điểm trả xe phải sau thời điểm nhận xe',
      });
    }
    const overlapping = await this.occupancy.findOverlapping(vehicle.id, start, end);
    return { available: overlapping.length === 0 };
  }

  /**
   * Khách gửi yêu cầu từ Marketplace (công khai). `tenantId` suy từ xe — chỉ nhận nếu xe đã
   * `approved_public` thuộc shop `active`. KHÔNG giữ chỗ lịch (còn pending), chỉ ghi yêu cầu —
   * chủ xe duyệt mới thành đơn (mô hình marketplace: hai bên tự thương lượng).
   *
   * Passwordless: khách vãng lai đã xác thực SĐT (OTP) được **tạo/đăng nhập tài khoản** theo SĐT
   * và gắn vào yêu cầu — trả `loginUserId` để controller cấp session cookie. Khách đang đăng nhập
   * (`customerUserId`) giữ nguyên phiên. Không bao giờ bắt nhập mật khẩu.
   *
   * `loginUserId` != null ⇔ cần cấp session mới cho phiên hiện tại.
   */
  async submitPublic(
    dto: CreateBookingRequestDto,
    customerUserId?: string | null,
  ): Promise<{ receipt: BookingRequestReceiptDto; loginUserId: string | null }> {
    const vehicle = await this.loadBookableVehicle(dto.vehicleId);

    // §8: khách chưa xác thực SĐT không gửi được yêu cầu thuê — đây cũng là bằng chứng sở hữu
    // SĐT để tạo/đăng nhập tài khoản passwordless ngay dưới.
    await this.phoneVerification.assertPhoneVerifiedForBooking(dto.customerPhone);

    const pickupAt = new Date(dto.pickupAt);
    const returnAt = new Date(dto.returnAt);
    if (!(returnAt.getTime() > pickupAt.getTime())) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Thời điểm trả xe phải sau thời điểm nhận xe',
      });
    }

    // Khách vãng lai đã verify SĐT → tạo/đăng nhập tài khoản theo SĐT, gắn yêu cầu vào đó.
    let effectiveUserId = customerUserId ?? null;
    let loginUserId: string | null = null;
    if (!effectiveUserId) {
      const { userId } = await this.auth.resolveOrCreateUserByPhone(
        dto.customerPhone,
        dto.customerName,
      );
      effectiveUserId = userId;
      loginUserId = userId;
    }

    const id = newId();
    // Ghi yêu cầu + báo cả shop trong một transaction: yêu cầu mới luôn có thông báo đi kèm.
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.bookingRequest.create({
          data: {
            id,
            tenantId: vehicle.tenantId,
            vehicleId: vehicle.id,
            status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
            customerName: dto.customerName,
            customerPhone: dto.customerPhone,
            customerEmail: dto.customerEmail ?? null,
            customerUserId: effectiveUserId,
            pickupAt,
            returnAt,
            note: dto.note ?? null,
          },
        });

        await this.notifications.emitToTenantMembers(
          vehicle.tenantId,
          {
            type: NOTIFICATION_TYPE.BOOKING_REQUEST_SUBMITTED,
            title: `Yêu cầu thuê mới: ${dto.customerName}`,
            body: vehicle.name,
            targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
            targetId: id,
          },
          tx,
        );
      });
    } catch (err) {
      // Partial unique index chống double-submit: cùng (xe, SĐT, giờ nhận, giờ trả) đang pending.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: API_ERROR_CODE.CONFLICT,
          message: 'Bạn vừa gửi một yêu cầu giống hệt cho xe này — vui lòng chờ shop phản hồi',
        });
      }
      throw err;
    }

    return {
      receipt: { id, status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, authenticated: true },
      loginUserId,
    };
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
      const booking = await this.bookings.createWithinTx(
        tx,
        tenantId,
        userId,
        {
          vehicleId: req.vehicleId,
          customerName: req.customerName,
          customerPhone: req.customerPhone,
          pickupAt: req.pickupAt.toISOString(),
          returnAt: req.returnAt.toISOString(),
        },
        'from_request',
      );

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

      // Báo khách nếu yêu cầu gắn với một tài khoản (khách đăng nhập lúc gửi). Khách vãng lai
      // (customerUserId null) sẽ nhận qua email/SMS ở giai đoạn sau.
      if (req.customerUserId) {
        await this.notifications.emitToUser(
          req.customerUserId,
          {
            type: NOTIFICATION_TYPE.BOOKING_REQUEST_APPROVED,
            title: 'Yêu cầu thuê đã được duyệt',
            body: `${req.vehicle.name} · đã tạo đơn thuê`,
            tenantId,
            targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
            targetId: booking.id,
          },
          tx,
        );
      }

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
    const req = await this.loadPending(tenantId, id);

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

      if (req.customerUserId) {
        await this.notifications.emitToUser(
          req.customerUserId,
          {
            type: NOTIFICATION_TYPE.BOOKING_REQUEST_REJECTED,
            title: 'Yêu cầu thuê bị từ chối',
            body: reason ? `${req.vehicle.name} · ${reason}` : req.vehicle.name,
            tenantId,
            targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
            targetId: id,
          },
          tx,
        );
      }

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
        customerUserId: true,
        pickupAt: true,
        returnAt: true,
        vehicle: { select: { name: true } },
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
