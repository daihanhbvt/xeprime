import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  DELIVERY_QUOTE_SOURCE,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  TENANT_STATUS,
  USER_STATUS,
  VEHICLE_PUBLIC_STATUS,
  type BookingRequestDeliveryQuote,
  type PaginationMeta,
} from '@xeprime/types';
import { normalizePhone } from '../../common/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { OccupancyService } from '../calendar/occupancy.service';
import { NotificationService } from '../notification/notification.service';
import { BookingsService } from '../bookings/bookings.service';
import { PhoneVerificationService } from '../phone-verification/phone-verification.service';
import { PricingService, type EffectivePolicy } from '../pricing/pricing.service';
import { DeliveryQuotePreviewDto, SaveDeliveryQuoteDto } from '../pricing/dto/pricing.dto';
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
  deliveryRequested: true,
  deliveryAddress: true,
  deliveryQuote: true,
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
    private readonly pricing: PricingService,
  ) {}

  /**
   * Xe khả dụng để đặt: đã `approved_public` và thuộc shop `active`. `tenantId` suy từ xe ở server
   * (không tin client). Dùng chung cho submit + check-availability.
   */
  private async loadBookableVehicle(
    vehicleId: string,
  ): Promise<{ id: string; tenantId: string; name: string }> {
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

    // §8: phải có bằng chứng sở hữu SĐT trước khi gửi yêu cầu — hoặc OTP vừa xác thực, hoặc
    // SĐT đã verify sẵn trên chính tài khoản đang đăng nhập. Quyết định ở ĐÂY, không ở client:
    // FE chỉ chọn hiển thị bước OTP hay không, còn cái chặn thật nằm ở dòng dưới.
    if (!(await this.canSkipBookingOtp(customerUserId, dto.customerPhone))) {
      await this.phoneVerification.assertPhoneVerifiedForBooking(dto.customerPhone);
    }

    const pickupAt = new Date(dto.pickupAt);
    const returnAt = new Date(dto.returnAt);
    if (!(returnAt.getTime() > pickupAt.getTime())) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Thời điểm trả xe phải sau thời điểm nhận xe',
      });
    }

    // Giao tận nơi: kiểm ở SERVER theo chính sách hiệu lực — FE ẩn ô nhập không phải lớp chặn.
    const deliveryRequested = dto.deliveryRequested === true;
    if (deliveryRequested) {
      if (!dto.deliveryAddress?.trim()) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: 'Vui lòng nhập địa điểm giao xe',
        });
      }
      const policy = await this.pricing.effectivePolicy(vehicle.tenantId, vehicle.id);
      if (!policy?.values.deliveryEnabled) {
        throw new ConflictException({
          code: API_ERROR_CODE.DELIVERY_NOT_SUPPORTED,
          message: 'Xe này hiện không hỗ trợ giao tận nơi',
        });
      }
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
            deliveryRequested,
            deliveryAddress: deliveryRequested ? dto.deliveryAddress!.trim() : null,
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
          code: API_ERROR_CODE.BOOKING_REQUEST_DUPLICATE,
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

  /**
   * Được phép BỎ QUA OTP đặt xe hay không — cả ba điều kiện phải cùng đúng:
   *
   *   1. có phiên đăng nhập hợp lệ (`customerUserId` do controller giải mã từ cookie, không do
   *      client tự khai);
   *   2. SĐT gửi lên TRÙNG SĐT của chính tài khoản đó sau khi chuẩn hoá (`0901…` ≡ `+84901…` ≡
   *      `84901…` — nếu so chuỗi thô thì cùng một số vẫn trượt và người dùng bị hỏi OTP vô cớ);
   *   3. SĐT đó đã được đánh dấu verify trên tài khoản.
   *
   * Sai một điều kiện là quay về OTP. Đặc biệt: đăng nhập rồi nhưng gõ SĐT KHÁC thì vẫn phải OTP
   * cho số mới — nếu không, một tài khoản bất kỳ sẽ gắn được SĐT của người khác vào yêu cầu thuê.
   * Và ở đây KHÔNG bao giờ tra ngược SĐT ra tài khoản: danh tính đến từ cookie, SĐT chỉ được
   * đem đi đối chiếu.
   */
  private async canSkipBookingOtp(
    customerUserId: string | null | undefined,
    rawPhone: string,
  ): Promise<boolean> {
    if (!customerUserId) return false;

    const user = await this.prisma.user.findFirst({
      where: { id: customerUserId, deletedAt: null, status: USER_STATUS.ACTIVE },
      select: { phone: true, phoneVerifiedAt: true },
    });
    if (!user?.phone || !user.phoneVerifiedAt) return false;

    return normalizePhone(user.phone) === normalizePhone(rawPhone);
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

    const stamps = await this.policyStamps(
      tenantId,
      rows.map((r) => r.vehicleId),
    );

    return {
      data: rows.map((r) => toDto(r, stamps.get(r.vehicleId) ?? null)),
      meta: { page, limit, total, hasNext: page * limit < total },
    };
  }

  async getOne(tenantId: string, id: string): Promise<BookingRequestDto> {
    const row = await this.prisma.bookingRequest.findFirst({
      where: { id, tenantId },
      select: SELECT,
    });
    if (!row) throw notFound();
    const stamps = await this.policyStamps(tenantId, [row.vehicleId]);
    return toDto(row, stamps.get(row.vehicleId) ?? null);
  }

  /**
   * `updatedAt` của chính sách HIỆU LỰC theo từng xe (override thắng mặc định) — MỘT query cho
   * cả trang, dùng phát hiện báo giá giao nhận đã cũ so với chính sách hiện tại.
   */
  private async policyStamps(
    tenantId: string,
    vehicleIds: string[],
  ): Promise<Map<string, string | null>> {
    const unique = [...new Set(vehicleIds)];
    const rows = await this.prisma.rentalPolicy.findMany({
      where: { tenantId, OR: [{ vehicleId: null }, { vehicleId: { in: unique } }] },
      select: { vehicleId: true, updatedAt: true },
    });
    const shopStamp = rows.find((r) => r.vehicleId === null)?.updatedAt.toISOString() ?? null;
    const map = new Map<string, string | null>();
    for (const id of unique) {
      const override = rows.find((r) => r.vehicleId === id);
      map.set(id, override ? override.updatedAt.toISOString() : shopStamp);
    }
    return map;
  }

  /**
   * Preview báo giá giao nhận — KHÔNG lưu gì. Trong bán kính: phí tự tính theo bậc (fee client
   * gửi bị bỏ qua). Ngoài bán kính: phí lấy từ input; chưa nhập thì breakdown chưa có dòng
   * giao nhận (`requiresManualFee` = true để FE bắt nhập).
   */
  async deliveryQuotePreview(
    tenantId: string,
    id: string,
    dto: SaveDeliveryQuoteDto,
  ): Promise<DeliveryQuotePreviewDto> {
    const req = await this.loadForQuote(tenantId, id);
    const policy = await this.pricing.effectivePolicy(tenantId, req.vehicleId);
    const { fee, source, requiresManual } = this.resolveDeliveryFee(policy, dto, {
      allowMissingManualFee: true,
    });

    const breakdown = this.pricing.buildQuote({
      weekdayPrice: req.vehicle.weekdayPrice?.toFixed(0) ?? null,
      weekendPrice: req.vehicle.weekendPrice?.toFixed(0) ?? null,
      pickupAt: req.pickupAt,
      returnAt: req.returnAt,
      policy,
      delivery: fee != null ? { fee, label: deliveryLabel(dto.distanceKm, source) } : null,
    });

    return { requiresManualFee: requiresManual, autoFee: requiresManual ? null : fee, breakdown };
  }

  /** Lưu báo giá giao nhận (ghi DUY NHẤT ở đây) + audit. Chỉ khi yêu cầu còn chờ duyệt. */
  async saveDeliveryQuote(
    tenantId: string,
    userId: string,
    id: string,
    dto: SaveDeliveryQuoteDto,
  ): Promise<BookingRequestDto> {
    const req = await this.loadForQuote(tenantId, id);
    const policy = await this.pricing.effectivePolicy(tenantId, req.vehicleId);
    const { fee, source } = this.resolveDeliveryFee(policy, dto, { allowMissingManualFee: false });

    const quote: BookingRequestDeliveryQuote = {
      distanceKm: dto.distanceKm,
      fee: fee!,
      source,
      ...(dto.note?.trim() ? { note: dto.note.trim() } : {}),
      quotedBy: userId,
      quotedAt: new Date().toISOString(),
      policyUpdatedAt: policy?.values.updatedAt ?? null,
    };

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.bookingRequest.update({
        where: { id: req.id },
        data: { deliveryQuote: quote as unknown as Prisma.InputJsonValue },
        select: SELECT,
      });

      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'booking_request.delivery_quote',
          targetType: 'booking_request',
          targetId: id,
          after: { distanceKm: dto.distanceKm, fee: fee!, source },
        },
        tx,
      );

      return updated;
    });

    return toDto(row, quote.policyUpdatedAt);
  }

  /**
   * Phân giải phí giao nhận theo chính sách hiệu lực: trong bán kính = bậc tự động (input phí
   * bị bỏ qua — không cho ghi đè bậc đã cấu hình); ngoài bán kính = bắt buộc nhập tay.
   */
  private resolveDeliveryFee(
    policy: EffectivePolicy | null,
    dto: SaveDeliveryQuoteDto,
    opts: { allowMissingManualFee: boolean },
  ): {
    fee: string | null;
    source: (typeof DELIVERY_QUOTE_SOURCE)[keyof typeof DELIVERY_QUOTE_SOURCE];
    requiresManual: boolean;
  } {
    const result = this.pricing.deliveryFeeFor(policy?.values ?? null, dto.distanceKm);
    if (result.kind === 'disabled') {
      throw new ConflictException({
        code: API_ERROR_CODE.DELIVERY_NOT_SUPPORTED,
        message: 'Chính sách hiện tại không bật giao nhận — bật giao nhận trước khi báo giá',
      });
    }
    if (result.kind === 'auto') {
      return { fee: result.fee, source: DELIVERY_QUOTE_SOURCE.AUTO, requiresManual: false };
    }
    if (dto.fee == null) {
      if (opts.allowMissingManualFee) {
        return { fee: null, source: DELIVERY_QUOTE_SOURCE.MANUAL, requiresManual: true };
      }
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Khoảng cách ngoài bán kính tự báo — vui lòng nhập phí giao nhận đề xuất',
      });
    }
    return { fee: dto.fee, source: DELIVERY_QUOTE_SOURCE.MANUAL, requiresManual: true };
  }

  /** Yêu cầu còn chờ duyệt + CÓ giao tận nơi — điều kiện của mọi thao tác báo giá. */
  private async loadForQuote(tenantId: string, id: string) {
    const req = await this.prisma.bookingRequest.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        status: true,
        vehicleId: true,
        deliveryRequested: true,
        pickupAt: true,
        returnAt: true,
        vehicle: { select: { weekdayPrice: true, weekendPrice: true } },
      },
    });
    if (!req) throw notFound();
    if (req.status !== BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Yêu cầu này đã được xử lý',
      });
    }
    if (!req.deliveryRequested) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Yêu cầu này không có giao xe tận nơi',
      });
    }
    return req;
  }

  /**
   * Shop duyệt → tạo Booking (giữ chỗ lịch) trong CÙNG transaction rồi set converted_to_booking.
   * Nếu xe đã bận khung giờ đó → `createWithinTx` để constraint ném 23P01 → 409 (ADR 0006).
   *
   * Tiền của đơn KHÔNG nhập tay ở luồng này (Wave 2): PricingService tính từ giá xe + chính
   * sách hiệu lực + báo giá giao nhận đã chốt, và snapshot bất biến ghi kèm đơn. Yêu cầu có
   * giao tận nơi mà CHƯA báo giá → chặn với mã riêng để FE mở thẳng drawer báo giá.
   */
  async approve(tenantId: string, userId: string, id: string): Promise<BookingRequestDto> {
    const req = await this.loadPending(tenantId, id);

    const quote = req.deliveryQuote as unknown as BookingRequestDeliveryQuote | null;
    if (req.deliveryRequested && !quote) {
      throw new ConflictException({
        code: API_ERROR_CODE.DELIVERY_QUOTE_REQUIRED,
        message: 'Cần báo giá giao nhận trước khi duyệt yêu cầu này',
      });
    }

    const policy = await this.pricing.effectivePolicy(tenantId, req.vehicleId);
    const breakdown = this.pricing.buildQuote({
      weekdayPrice: req.vehicle.weekdayPrice?.toFixed(0) ?? null,
      weekendPrice: req.vehicle.weekendPrice?.toFixed(0) ?? null,
      pickupAt: req.pickupAt,
      returnAt: req.returnAt,
      policy,
      delivery:
        req.deliveryRequested && quote
          ? { fee: quote.fee, label: deliveryLabel(quote.distanceKm, quote.source) }
          : null,
    });
    const snapshot = this.pricing.buildSnapshot(breakdown, policy);

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
          baseAmount: rowAmount(breakdown.rows, 'base'),
          discountAmount: rowAmountAbs(breakdown.rows, 'discount'),
          deliveryFee: rowAmount(breakdown.rows, 'delivery'),
          depositAmount: breakdown.depositAmount,
        },
        'from_request',
        snapshot,
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

    const stamps = await this.policyStamps(tenantId, [row.vehicleId]);
    return toDto(row, stamps.get(row.vehicleId) ?? null);
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

    const stamps = await this.policyStamps(tenantId, [row.vehicleId]);
    return toDto(row, stamps.get(row.vehicleId) ?? null);
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
        deliveryRequested: true,
        deliveryQuote: true,
        vehicle: { select: { name: true, weekdayPrice: true, weekendPrice: true } },
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

/**
 * `policyUpdatedAt` = mốc chính sách hiệu lực HIỆN TẠI của xe — báo giá cũ hơn mốc này
 * (chính sách đã đổi sau khi báo) bị đánh dấu `stale` để shop báo giá lại trước khi duyệt.
 */
function toDto(r: BookingRequestRow, policyUpdatedAt: string | null): BookingRequestDto {
  const quote = r.deliveryQuote as unknown as BookingRequestDeliveryQuote | null;
  const pending = r.status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL;
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
    deliveryRequested: r.deliveryRequested,
    deliveryAddress: r.deliveryAddress,
    deliveryQuote: quote
      ? {
          distanceKm: quote.distanceKm,
          fee: quote.fee,
          source: quote.source,
          note: quote.note ?? null,
          quotedAt: quote.quotedAt,
          stale: pending && (quote.policyUpdatedAt ?? null) !== policyUpdatedAt,
        }
      : null,
    needsDeliveryQuote: pending && r.deliveryRequested && !quote,
    rejectReason: r.rejectReason,
    bookingId: r.bookingId,
    createdAt: r.createdAt as unknown as string,
  };
}

/** Sublabel dòng giao nhận trong breakdown/snapshot. */
function deliveryLabel(distanceKm: number, source: string): string {
  const km = Number.isInteger(distanceKm) ? String(distanceKm) : distanceKm.toFixed(1);
  return source === DELIVERY_QUOTE_SOURCE.MANUAL
    ? `Khoảng cách ${km} km một chiều (báo giá thủ công)`
    : `Khoảng cách ${km} km một chiều`;
}

/** Số tiền của một dòng breakdown ('0' khi không có dòng đó). */
function rowAmount(rows: { key: string; amount: string }[], key: string): string {
  return rows.find((r) => r.key === key)?.amount ?? '0';
}

/** Trị tuyệt đối cho dòng giảm trừ (breakdown ghi '-120000', cột DB lưu dương). */
function rowAmountAbs(rows: { key: string; amount: string }[], key: string): string {
  const raw = rowAmount(rows, key);
  return raw.startsWith('-') ? raw.slice(1) : raw;
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy yêu cầu đặt xe',
  });
}
