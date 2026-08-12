import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_STATUS,
  BOOKING_STATUS_META,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  OCCUPANCY_SOURCE_TYPE,
  PRICE_ROW,
  canTransitionBooking,
  occupiesSchedule,
  type BookingPriceSnapshot,
  type BookingStatus,
  type PaginationMeta,
} from '@xeprime/types';
import { bookingDebt } from '../../common/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import { OccupancyService } from '../calendar/occupancy.service';
import {
  BOOKING_DEFAULT_LIMIT,
  BOOKING_MAX_LIMIT,
  BookingDetailDto,
  BookingListItemDto,
  BookingListQueryDto,
  CreateBookingDto,
  TransitionBookingDto,
  UpdateBookingDto,
} from './dto/booking.dto';

const LIST_SELECT = {
  id: true,
  code: true,
  vehicleId: true,
  customerName: true,
  customerPhone: true,
  status: true,
  serviceType: true,
  pickupAt: true,
  returnAt: true,
  totalAmount: true,
  paidAmount: true,
  depositAmount: true,
  createdAt: true,
  vehicle: { select: { name: true, plateNumber: true } },
} satisfies Prisma.BookingSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  baseAmount: true,
  deliveryFee: true,
  discountAmount: true,
  priceSnapshot: true,
  actualPickupAt: true,
  actualReturnAt: true,
  note: true,
  updatedAt: true,
} satisfies Prisma.BookingSelect;

/** Nguồn tạo đơn: trực tiếp (shop lập) hay từ duyệt yêu cầu Marketplace. Quyết định có thông báo. */
export type BookingCreateSource = 'direct' | 'from_request';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly occupancy: OccupancyService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  async list(
    tenantId: string,
    query: BookingListQueryDto,
  ): Promise<{ data: BookingListItemDto[]; meta: PaginationMeta }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(BOOKING_MAX_LIMIT, Math.max(1, query.limit ?? BOOKING_DEFAULT_LIMIT));

    const where: Prisma.BookingWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.returnFrom || query.returnTo
        ? {
            returnAt: {
              ...(query.returnFrom ? { gte: new Date(query.returnFrom) } : {}),
              ...(query.returnTo ? { lte: new Date(query.returnTo) } : {}),
            },
          }
        : {}),
      ...(query.q ? { OR: searchOr(query.q) } : {}),
    };

    // Đếm và lấy trang trong một transaction: total khớp data cùng thời điểm.
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy: orderByOf(query.sort),
        skip: (page - 1) * limit,
        take: limit,
        select: LIST_SELECT,
      }),
    ]);

    return {
      data: rows.map(toListItem),
      meta: { page, limit, total, hasNext: page * limit < total },
    };
  }

  async getOne(tenantId: string, id: string): Promise<BookingDetailDto> {
    const row = await this.prisma.booking.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: DETAIL_SELECT,
    });
    if (!row) throw notFound();
    return toDetail(row);
  }

  /**
   * Tạo đơn + giữ chỗ lịch trong CÙNG transaction (ADR 0006). Không SELECT check trùng —
   * exclusion constraint ném `23P01`, `AllExceptionsFilter` dịch thành BOOKING_SCHEDULE_CONFLICT.
   */
  async create(tenantId: string, userId: string, dto: CreateBookingDto): Promise<BookingDetailDto> {
    return this.prisma.$transaction((tx) =>
      this.createWithinTx(tx, tenantId, userId, dto, 'direct'),
    );
  }

  /**
   * Lõi tạo đơn dùng chung — chạy TRONG một transaction do bên gọi mở. Cho phép luồng khác
   * (duyệt yêu cầu đặt xe) tạo đơn cùng transaction với thay đổi của nó, không nhân đôi
   * logic giữ chỗ. Trùng lịch → constraint ném `23P01` → 409.
   */
  async createWithinTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    dto: CreateBookingDto,
    source: BookingCreateSource = 'direct',
    snapshot?: BookingPriceSnapshot,
  ): Promise<BookingDetailDto> {
    const pickupAt = new Date(dto.pickupAt);
    const returnAt = new Date(dto.returnAt);
    assertRange(pickupAt, returnAt);

    const base = money(dto.baseAmount);
    const delivery = money(dto.deliveryFee);
    const discount = money(dto.discountAmount);
    const deposit = money(dto.depositAmount);
    const total = base.plus(delivery).minus(discount);

    const id = newId();
    const code = `DH${id.slice(-6).toUpperCase()}`;

    // MỌI đơn đều mang snapshot giá (Wave 2): luồng duyệt yêu cầu truyền snapshot từ
    // PricingService; đơn shop tự lập chốt lại đúng các số shop đã nhập ('manual').
    // Snapshot BẤT BIẾN — không code path nào UPDATE lại cột này.
    const priceSnapshot = snapshot ?? manualSnapshot({ base, delivery, discount, deposit, total });

    const created = await tx.booking.create({
      data: {
        id,
        tenantId,
        vehicleId: dto.vehicleId,
        code,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone ?? null,
        status: BOOKING_STATUS.RESERVED,
        serviceType: dto.serviceType ?? undefined,
        pickupAt,
        returnAt,
        baseAmount: base,
        deliveryFee: delivery,
        discountAmount: discount,
        depositAmount: deposit,
        totalAmount: total,
        priceSnapshot: priceSnapshot as unknown as Prisma.InputJsonValue,
        note: dto.note ?? null,
        createdBy: userId,
      },
      select: DETAIL_SELECT,
    });

    await this.occupancy.reserve(tx, {
      tenantId,
      vehicleId: dto.vehicleId,
      sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING,
      sourceId: id,
      startAt: pickupAt,
      endAt: returnAt,
    });

    await this.audit.record(
      {
        tenantId,
        actorUserId: userId,
        actorScope: 'tenant',
        action: 'booking.create',
        targetType: 'booking',
        targetId: id,
        after: { code, vehicleId: dto.vehicleId, pickupAt, returnAt },
      },
      tx,
    );

    // Đơn shop tự lập → báo các thành viên khác. Đơn từ duyệt yêu cầu thì shop vừa thao tác
    // rồi (đã có thông báo yêu cầu) nên không báo trùng.
    if (source === 'direct') {
      await this.notifications.emitToTenantMembers(
        tenantId,
        {
          type: NOTIFICATION_TYPE.BOOKING_CREATED,
          title: `Đơn thuê mới ${code}`,
          body: `${created.vehicle.name} · ${created.customerName}`,
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
          targetId: id,
        },
        tx,
        { excludeUserId: userId },
      );
    }

    return toDetail(created);
  }

  /**
   * Sửa đơn. Đổi khung giờ thì reschedule lịch (chỉ khi đơn còn chiếm lịch); constraint vẫn
   * là chốt chặn nếu khung mới trùng đơn khác.
   */
  async update(tenantId: string, id: string, dto: UpdateBookingDto): Promise<BookingDetailDto> {
    const current = await this.prisma.booking.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: {
        id: true,
        status: true,
        pickupAt: true,
        returnAt: true,
        baseAmount: true,
        deliveryFee: true,
        discountAmount: true,
      },
    });
    if (!current) throw notFound();

    const pickupAt = dto.pickupAt ? new Date(dto.pickupAt) : current.pickupAt;
    const returnAt = dto.returnAt ? new Date(dto.returnAt) : current.returnAt;
    if (dto.pickupAt || dto.returnAt) assertRange(pickupAt, returnAt);

    // Tính lại total nếu bất kỳ khoản cấu thành đổi.
    const base = dto.baseAmount !== undefined ? money(dto.baseAmount) : current.baseAmount;
    const delivery = dto.deliveryFee !== undefined ? money(dto.deliveryFee) : current.deliveryFee;
    const discount =
      dto.discountAmount !== undefined ? money(dto.discountAmount) : current.discountAmount;
    const total = new Prisma.Decimal(base).plus(delivery).minus(discount);

    const rescheduled =
      Boolean(dto.pickupAt || dto.returnAt) && occupiesSchedule(current.status as BookingStatus);

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: { id: current.id },
        data: {
          ...(dto.customerName !== undefined ? { customerName: dto.customerName } : {}),
          ...(dto.customerPhone !== undefined ? { customerPhone: dto.customerPhone } : {}),
          ...(dto.serviceType !== undefined ? { serviceType: dto.serviceType } : {}),
          ...(dto.pickupAt ? { pickupAt } : {}),
          ...(dto.returnAt ? { returnAt } : {}),
          ...(dto.baseAmount !== undefined ? { baseAmount: base } : {}),
          ...(dto.deliveryFee !== undefined ? { deliveryFee: delivery } : {}),
          ...(dto.discountAmount !== undefined ? { discountAmount: discount } : {}),
          ...(dto.depositAmount !== undefined ? { depositAmount: money(dto.depositAmount) } : {}),
          ...(dto.baseAmount !== undefined ||
          dto.deliveryFee !== undefined ||
          dto.discountAmount !== undefined
            ? { totalAmount: total }
            : {}),
          ...(dto.note !== undefined ? { note: dto.note } : {}),
        },
        select: DETAIL_SELECT,
      });

      if (rescheduled) {
        await this.occupancy.reschedule(tx, OCCUPANCY_SOURCE_TYPE.BOOKING, id, pickupAt, returnAt);
      }

      return updated;
    });

    return toDetail(row);
  }

  /**
   * Chuyển trạng thái đơn. Hợp lệ hoá bằng `canTransitionBooking` (không tin client). Khi đơn
   * rời tập trạng thái "chiếm lịch" (huỷ/không đến/hoàn thành) thì nhả lịch qua OccupancyService.
   */
  async transition(
    tenantId: string,
    id: string,
    userId: string,
    dto: TransitionBookingDto,
  ): Promise<BookingDetailDto> {
    const current = await this.prisma.booking.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!current) throw notFound();

    const from = current.status as BookingStatus;
    const to = dto.status as BookingStatus;

    const row = await this.prisma.$transaction((tx) =>
      this.transitionWithinTx(tx, tenantId, id, userId, from, to, {
        actualPickupAt: dto.actualPickupAt,
        actualReturnAt: dto.actualReturnAt,
      }),
    );

    return toDetail(row);
  }

  /**
   * Lõi chuyển trạng thái dùng chung — chạy TRONG transaction do bên gọi mở.
   *
   * Tồn tại vì bàn giao (Wave 7) phải đổi trạng thái đơn CÙNG transaction với việc ghi KM và
   * đụng lịch xe: gọi `transition()` bên ngoài sẽ tạo ra khe hở "đơn đã completed nhưng KM
   * chưa ghi". Mọi luật (validate chuyển trạng thái, nhả lịch, audit, thông báo) ở nguyên đây
   * — không nhân bản sang module khác.
   */
  async transitionWithinTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
    userId: string,
    from: BookingStatus,
    to: BookingStatus,
    opts: { actualPickupAt?: string | null; actualReturnAt?: string | null } = {},
  ): Promise<BookingDetailRow> {
    if (from === to || !canTransitionBooking(from, to)) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: `Không thể chuyển đơn từ "${from}" sang "${to}"`,
      });
    }

    // Điều kiện `status: from` trong WHERE: nếu ai đó vừa chuyển trạng thái xen vào giữa thì
    // 0 dòng khớp và ta 409 thay vì ghi đè quyết định của họ.
    const claimed = await tx.booking.updateMany({
      where: { id, tenantId, status: from, deletedAt: null },
      data: {
        status: to,
        ...(to === BOOKING_STATUS.ACTIVE
          ? { actualPickupAt: opts.actualPickupAt ? new Date(opts.actualPickupAt) : new Date() }
          : {}),
        ...(to === BOOKING_STATUS.COMPLETED
          ? { actualReturnAt: opts.actualReturnAt ? new Date(opts.actualReturnAt) : new Date() }
          : {}),
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: 'Đơn vừa được người khác cập nhật — tải lại rồi thử lại',
      });
    }

    const updated = await tx.booking.findFirstOrThrow({
      where: { id, tenantId },
      select: DETAIL_SELECT,
    });

    // Trạng thái đích không còn chiếm lịch → nhả occupancy để xe trống cho đơn khác.
    if (!occupiesSchedule(to)) {
      await this.occupancy.release(tx, OCCUPANCY_SOURCE_TYPE.BOOKING, id);
    }

    await this.audit.record(
      {
        tenantId,
        actorUserId: userId,
        actorScope: 'tenant',
        action: 'booking.transition',
        targetType: 'booking',
        targetId: id,
        before: { status: from },
        after: { status: to },
      },
      tx,
    );

    // Báo các thành viên khác của shop biết đơn đổi trạng thái (nhận biết nội bộ).
    await this.notifications.emitToTenantMembers(
      tenantId,
      {
        type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
        title: `Đơn ${updated.code}: ${BOOKING_STATUS_META[to].label}`,
        body: updated.vehicle.name,
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
        targetId: id,
      },
      tx,
      { excludeUserId: userId },
    );

    return updated;
  }
}

function money(v: string | undefined): Prisma.Decimal {
  return new Prisma.Decimal(v ?? '0');
}

/**
 * Snapshot cho đơn shop tự lập: chốt lại đúng các số shop đã nhập tay — không bịa chi tiết
 * (không days/policy vì các số này không đi qua PricingService).
 */
function manualSnapshot(amounts: {
  base: Prisma.Decimal;
  delivery: Prisma.Decimal;
  discount: Prisma.Decimal;
  deposit: Prisma.Decimal;
  total: Prisma.Decimal;
}): BookingPriceSnapshot {
  const rows: BookingPriceSnapshot['rows'] = [
    { key: PRICE_ROW.BASE, label: 'Tiền thuê gốc', amount: amounts.base.toFixed(0) },
  ];
  if (!amounts.discount.isZero()) {
    rows.push({
      key: PRICE_ROW.DISCOUNT,
      label: 'Giảm giá',
      amount: amounts.discount.negated().toFixed(0),
    });
  }
  if (!amounts.delivery.isZero()) {
    rows.push({
      key: PRICE_ROW.DELIVERY,
      label: 'Phí giao nhận xe',
      amount: amounts.delivery.toFixed(0),
    });
  }
  return {
    calculatedAt: new Date().toISOString(),
    source: 'manual',
    currency: 'VND',
    rows,
    totalAmount: amounts.total.toFixed(0),
    depositAmount: amounts.deposit.toFixed(0),
    policy: null,
  };
}

function assertRange(pickupAt: Date, returnAt: Date): void {
  if (!(returnAt.getTime() > pickupAt.getTime())) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'Thời điểm trả xe phải sau thời điểm nhận xe',
    });
  }
}

function searchOr(q: string): Prisma.BookingWhereInput[] {
  const contains = { contains: q, mode: 'insensitive' } as const;
  return [{ customerName: contains }, { code: contains }, { customerPhone: contains }];
}

function orderByOf(sort: BookingListQueryDto['sort']): Prisma.BookingOrderByWithRelationInput {
  switch (sort) {
    case 'pickup_asc':
      return { pickupAt: 'asc' };
    case 'pickup_desc':
      return { pickupAt: 'desc' };
    case 'return_asc':
      return { returnAt: 'asc' };
    default:
      return { createdAt: 'desc' };
  }
}

/** Decimal → string do ResponseInterceptor lo (ADR 0007); ở đây giữ nguyên kiểu. */
type BookingListRow = Prisma.BookingGetPayload<{ select: typeof LIST_SELECT }>;
type BookingDetailRow = Prisma.BookingGetPayload<{ select: typeof DETAIL_SELECT }>;

function toListItem(b: BookingListRow): BookingListItemDto {
  return {
    id: b.id,
    code: b.code,
    vehicleId: b.vehicleId,
    vehicleName: b.vehicle.name,
    vehiclePlate: b.vehicle.plateNumber,
    customerName: b.customerName,
    customerPhone: b.customerPhone,
    status: b.status,
    serviceType: b.serviceType,
    pickupAt: b.pickupAt as unknown as string,
    returnAt: b.returnAt as unknown as string,
    totalAmount: b.totalAmount as unknown as string,
    paidAmount: b.paidAmount as unknown as string,
    // Công nợ tính động = max(0, total − paid); không denormalize để khỏi drift (Phase 6).
    debtAmount: bookingDebt(b.totalAmount, b.paidAmount) as unknown as string,
    depositAmount: b.depositAmount as unknown as string,
    createdAt: b.createdAt as unknown as string,
  };
}

function toDetail(b: BookingDetailRow): BookingDetailDto {
  return {
    ...toListItem(b),
    baseAmount: b.baseAmount as unknown as string,
    deliveryFee: b.deliveryFee as unknown as string,
    discountAmount: b.discountAmount as unknown as string,
    priceSnapshot: (b.priceSnapshot as unknown as BookingDetailDto['priceSnapshot']) ?? null,
    actualPickupAt: b.actualPickupAt as unknown as string | null,
    actualReturnAt: b.actualReturnAt as unknown as string | null,
    note: b.note,
    updatedAt: b.updatedAt as unknown as string,
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy đơn thuê',
  });
}
