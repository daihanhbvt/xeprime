import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  BOOKING_STATUS,
  BOOKING_STATUS_META,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  OCCUPANCY_SOURCE_TYPE,
  PRICE_ROW,
  canTransitionBooking,
  isBookingFinal,
  occupiesSchedule,
  isLongTermPackageMonths,
  longTermReturnAt,
  SERVICE_TYPE,
  TENANT_CUSTOMER_SOURCE,
  type AuditActorScope,
  type BookingPriceSnapshot,
  type BookingStatus,
  type PaginationMeta,
} from '@xeprime/types';
import {
  bookingMoney,
  emptyMoneySides,
  loadBookingMoneySides,
} from '../../common/booking-money';
import { bookingDebt } from '../../common/money';
import { normalizeRouteContext } from '../../common/route-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import { OccupancyService } from '../calendar/occupancy.service';
import { CustomersService } from '../customers/customers.service';
import { DriversService } from '../drivers/drivers.service';
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
  longTermPackageMonths: true,
  pickupAt: true,
  returnAt: true,
  totalAmount: true,
  paidAmount: true,
  depositAmount: true,
  createdAt: true,
  vehicle: { select: { name: true, plateNumber: true } },
  driver: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.BookingSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  // Ảnh đại diện xe: một cột trên chính bảng `vehicles`, không join gallery — chi tiết đơn
  // cần NHẬN RA chiếc xe, không cần xem bộ ảnh.
  vehicle: { select: { name: true, plateNumber: true, mainImageUrl: true } },
  baseAmount: true,
  deliveryFee: true,
  discountAmount: true,
  priceSnapshot: true,
  routeType: true,
  pickupAddress: true,
  destination: true,
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
    private readonly drivers: DriversService,
    private readonly customers: CustomersService,
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
      // Lọc qua quan hệ xe → chi nhánh; `tenantId` vẫn là ranh giới thật.
      ...(query.branchId ? { vehicle: { branchId: query.branchId } } : {}),
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
      data: await this.withMoney(rows.map(toListItem)),
      meta: { page, limit, total, hasNext: page * limit < total },
    };
  }

  /**
   * Vá các số tiền TỔNG HỢP vào DTO đã map.
   *
   * `toListItem`/`toDetail` là hàm thuần trên một dòng `bookings`, mà `phải thu`/`đã thu`/`còn
   * nợ` lại cần ba tổng ở ba bảng khác (phụ phí, phiếu tay, cọc đã thu). Vá sau khi map giữ hai
   * mapper thuần và gom việc nạp về đúng một chỗ, thay vì luồn tham số qua 7 lời gọi.
   *
   * Công thức nằm ở `common/booking-money.ts` — dùng CHUNG với `/manage/debts`, sổ khách và hợp
   * đồng, nên bốn màn không thể nói bốn con số.
   */
  private async withMoney<T extends BookingListItemDto>(items: T[]): Promise<T[]> {
    if (items.length === 0) return items;
    const sides = await loadBookingMoneySides(
      this.prisma,
      items.map((i) => i.id),
    );
    return items.map((item) => {
      const money = bookingMoney({
        totalAmount: item.totalAmount,
        paidAmount: item.paidAmount,
        ...(sides.get(item.id) ?? emptyMoneySides()),
      });
      return {
        ...item,
        // toString() chứ không toFixed(2): tiền trên dây là chuỗi đã RÚT GỌN ở mọi DTO khác
        // (interceptor serialize Decimal, SQL dùng trim_scale). Trả "1000000.00" ở riêng đây là
        // một dạng thứ hai cho cùng một con số.
        surchargeTotal: money.surchargeTotal.toString(),
        amountDue: money.amountDue.toString(),
        otherCollected: money.otherCollected.toString(),
        collectedAmount: money.collectedAmount.toString(),
        debtAmount: money.debtAmount.toString(),
      };
    });
  }

  private async withMoneyOne<T extends BookingListItemDto>(item: T): Promise<T> {
    const [patched] = await this.withMoney([item]);
    return patched!;
  }

  async getOne(tenantId: string, id: string): Promise<BookingDetailDto> {
    const row = await this.prisma.booking.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: DETAIL_SELECT,
    });
    if (!row) throw notFound();
    return this.withMoneyOne(toDetail(row));
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
    /**
     * Hồ sơ khách ĐÃ XÁC ĐỊNH của luồng gọi (duyệt yêu cầu thuê truyền id đã gắn trên yêu cầu).
     *
     * Cố ý KHÔNG nằm trong `CreateBookingDto`: id này không bao giờ được nhận từ client — client
     * gửi lên một id của gian hàng khác thì composite FK chặn, nhưng gửi id của khách KHÁC trong
     * cùng gian hàng thì không gì chặn nổi. Ở đây nó chỉ đến từ dữ liệu server đã đọc.
     *
     * Bỏ trống → service tự tìm-hoặc-tạo theo SĐT trên đơn.
     */
    tenantCustomerId?: string | null,
  ): Promise<BookingDetailDto> {
    // Hành trình đi cùng dịch vụ: with_driver bắt buộc lộ trình + địa chỉ đón (liên tỉnh thêm
    // điểm đến), dịch vụ khác bị normalize về null — CHECK DB là chốt chặn cuối.
    const serviceType = dto.serviceType ?? SERVICE_TYPE.SELF_DRIVE;

    /*
     * Thuê dài hạn: ngày trả KHÔNG đến từ client mà suy ra từ gói bằng THÁNG LỊCH giờ Việt Nam
     * (ADR 0011). Nhân viên chỉ chốt giờ nhận; mọi con số ngày trả gửi kèm đều bị bỏ qua, nên
     * không có đường nào tạo ra đơn dài hạn dài/ngắn hơn gói khách mua.
     */
    const longTermPackageMonths =
      serviceType === SERVICE_TYPE.LONG_TERM ? (dto.longTermPackageMonths ?? null) : null;
    if (serviceType === SERVICE_TYPE.LONG_TERM && !isLongTermPackageMonths(longTermPackageMonths)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Đơn thuê dài hạn phải gắn với một gói thuê',
      });
    }
    const pickupAt = new Date(dto.pickupAt);
    if (longTermPackageMonths == null && !dto.returnAt) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Thiếu thời gian trả xe',
      });
    }
    const returnAt =
      longTermPackageMonths != null
        ? longTermReturnAt(pickupAt, longTermPackageMonths)
        : new Date(dto.returnAt!);
    assertRange(pickupAt, returnAt);
    const route = normalizeRouteContext({
      serviceType,
      routeType: dto.routeType,
      pickupAddress: dto.pickupAddress,
      destination: dto.destination,
    });

    const base = money(dto.baseAmount);
    const delivery = money(dto.deliveryFee);
    const discount = money(dto.discountAmount);
    const deposit = money(dto.depositAmount);
    const total = base.plus(delivery).minus(discount);

    /*
     * Sổ khách của gian hàng (S-01): mỗi đơn có SĐT đều gắn về một hồ sơ khách, TRONG CÙNG
     * transaction với đơn — không có đường nào tạo được đơn mà quên gắn khách.
     *
     * Khách đang bị đánh dấu `blocked` thì `resolveWithinTx` ném 409 ngay tại đây: nhân viên
     * không tự lập đơn mới cho khách đã bị từ chối phục vụ, và duyệt một yêu cầu cũ cũng không
     * phải đường vòng. Đơn và yêu cầu ĐANG CÓ không bị đụng tới.
     */
    const customerId =
      tenantCustomerId ??
      (await this.customers.resolveWithinTx(tx, tenantId, {
        fullName: dto.customerName,
        phone: dto.customerPhone,
        source: TENANT_CUSTOMER_SOURCE.BOOKING,
        actorUserId: userId,
        mode: 'internal',
      }));

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
        tenantCustomerId: customerId,
        status: BOOKING_STATUS.RESERVED,
        serviceType,
        longTermPackageMonths,
        routeType: route.routeType,
        pickupAddress: route.pickupAddress,
        destination: route.destination,
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

    return this.withMoneyOne(toDetail(created));
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
        serviceType: true,
        longTermPackageMonths: true,
        routeType: true,
        pickupAddress: true,
        destination: true,
        pickupAt: true,
        returnAt: true,
        baseAmount: true,
        deliveryFee: true,
        discountAmount: true,
      },
    });
    if (!current) throw notFound();
    assertMutable(current.status as BookingStatus);

    /*
     * Hành trình được validate lại mỗi khi đơn đụng tới dịch vụ HOẶC một trường hành trình:
     * đổi sang with_driver phải nộp đủ lộ trình/địa chỉ đón, rời with_driver thì cả ba trường
     * bị clear (CHECK DB không cho with_driver-context sống trên dịch vụ khác).
     */
    const nextServiceType = dto.serviceType ?? current.serviceType;
    const routeTouched =
      dto.serviceType !== undefined ||
      dto.routeType !== undefined ||
      dto.pickupAddress !== undefined ||
      dto.destination !== undefined;
    const route = routeTouched
      ? normalizeRouteContext({
          serviceType: nextServiceType,
          routeType: dto.routeType !== undefined ? dto.routeType : current.routeType,
          pickupAddress:
            dto.pickupAddress !== undefined ? dto.pickupAddress : current.pickupAddress,
          destination: dto.destination !== undefined ? dto.destination : current.destination,
        })
      : null;

    /*
     * Đơn THUÊ DÀI HẠN có độ dài cố định bằng gói: dời giờ nhận thì giờ trả dịch theo bằng
     * tháng lịch, và không ai được nhập tay giờ trả — nếu cho, đơn sẽ dài/ngắn hơn gói khách
     * đã mua mà không có dấu vết nào (ADR 0011).
     */
    const pickupAt = dto.pickupAt ? new Date(dto.pickupAt) : current.pickupAt;
    let returnAt: Date;
    if (current.longTermPackageMonths != null) {
      if (dto.returnAt) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: 'Đơn thuê dài hạn có ngày trả tính theo gói — chỉ đổi được ngày nhận',
        });
      }
      returnAt = longTermReturnAt(pickupAt, current.longTermPackageMonths);
    } else {
      returnAt = dto.returnAt ? new Date(dto.returnAt) : current.returnAt;
    }
    if (dto.pickupAt || dto.returnAt) assertRange(pickupAt, returnAt);

    // Tính lại total nếu bất kỳ khoản cấu thành đổi.
    const base = dto.baseAmount !== undefined ? money(dto.baseAmount) : current.baseAmount;
    const delivery = dto.deliveryFee !== undefined ? money(dto.deliveryFee) : current.deliveryFee;
    const discount =
      dto.discountAmount !== undefined ? money(dto.discountAmount) : current.discountAmount;
    const total = new Prisma.Decimal(base).plus(delivery).minus(discount);

    const rescheduled =
      (Boolean(dto.pickupAt) || returnAt.getTime() !== current.returnAt.getTime()) &&
      occupiesSchedule(current.status as BookingStatus);

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: { id: current.id },
        data: {
          ...(dto.customerName !== undefined ? { customerName: dto.customerName } : {}),
          ...(dto.customerPhone !== undefined ? { customerPhone: dto.customerPhone } : {}),
          ...(dto.serviceType !== undefined ? { serviceType: dto.serviceType } : {}),
          ...(route
            ? {
                routeType: route.routeType,
                pickupAddress: route.pickupAddress,
                destination: route.destination,
              }
            : {}),
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

    return this.withMoneyOne(toDetail(row));
  }

  /**
   * Cập nhật phí giao nhận sau khi chủ xe và khách đã thống nhất NGOÀI ứng dụng (Wave 9).
   *
   * Thay cho vòng "báo giá → khách xác nhận" cũ. Ba điều đáng đóng đinh:
   *
   *  - **Tổng tiền do server tính lại**, không nhận `totalAmount` từ client — cùng công thức với
   *    `update()` (`base + delivery − discount`), nên không có đường nào để trình duyệt tự quyết
   *    số tiền của đơn.
   *  - **Có vết**: ai đổi, từ bao nhiêu sang bao nhiêu, lúc nào. Đây là lý do việc này không đi
   *    chung `PATCH /bookings/:id`.
   *  - **Không có trạng thái chờ khách đồng ý.** Khách được BÁO là số tiền đã đổi (thông báo
   *    thuần thông tin, không có nút Đồng ý/Từ chối) — thoả thuận đã xong trước đó.
   *
   * `note` là ghi chú nội bộ: vào audit, KHÔNG vào thông báo gửi khách.
   */
  async updateDeliveryFee(
    tenantId: string,
    id: string,
    userId: string,
    dto: { deliveryFee: string; note?: string },
  ): Promise<BookingDetailDto> {
    const current = await this.prisma.booking.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: {
        id: true,
        status: true,
        baseAmount: true,
        deliveryFee: true,
        discountAmount: true,
      },
    });
    if (!current) throw notFound();
    /*
     * Chuyến đã khép lại thì phí giao nhận đóng băng theo. Sửa nó sau khi khách đã thanh toán và
     * cọc đã hoàn là đổi `total_amount` của một quyết toán đã xong — hoá đơn khách đang giữ và
     * số trên hệ thống lập tức nói hai chuyện khác nhau.
     */
    assertMutable(current.status as BookingStatus);

    const nextFee = money(dto.deliveryFee);
    const total = new Prisma.Decimal(current.baseAmount)
      .plus(nextFee)
      .minus(current.discountAmount);
    const previousFee = current.deliveryFee.toFixed(2);

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: { id: current.id },
        data: { deliveryFee: nextFee, totalAmount: total },
        select: DETAIL_SELECT,
      });

      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'booking.delivery_fee_update',
          targetType: 'booking',
          targetId: id,
          before: {
            deliveryFee: previousFee,
            totalAmount: current.baseAmount
              .plus(current.deliveryFee)
              .minus(current.discountAmount)
              .toFixed(2),
          },
          after: {
            deliveryFee: nextFee.toFixed(2),
            totalAmount: total.toFixed(2),
            ...(dto.note?.trim() ? { note: dto.note.trim() } : {}),
          },
        },
        tx,
      );

      /*
       * KHÔNG báo cho khách (Wave 11.1). Phí giao nhận là con số hai bên đã thống nhất qua điện
       * thoại/chat TRƯỚC khi chủ xe vào chốt, nên tin nhắn ở đây chỉ lặp lại thứ khách đã biết —
       * và khách cũng không có gì để duyệt. Chuyến của khách luôn hiện số MỚI NHẤT khi mở lại
       * (`GET /trips/:id` tính tại chỗ), nên im lặng không làm mất thông tin nào.
       *
       * Audit ở trên vẫn ghi đủ trước/sau: truy vết là việc của audit, không phải của thông báo.
       */
      return updated;
    });

    return this.withMoneyOne(toDetail(row));
  }

  /**
   * Gán/bỏ gán tài xế cho đơn (17/08 — nghiệp vụ xe có tài xế). "Tài xế gán được" định nghĩa
   * MỘT nơi ở `DriversService.findAssignable` (cùng tenant + active + chưa xoá + GPLX còn hạn
   * + KHÔNG trùng khung giờ với đơn sống khác — kiểm TRONG transaction, không tin FE);
   * composite FK `(driver_id, tenant_id)` chặn gán chéo tenant, và exclusion constraint
   * `bookings_driver_schedule_excl` là chốt chặn cuối cho hai request đua nhau (ADR 0006).
   * Đơn đã khép (completed/cancelled/no_show) không sửa được — hồ sơ chuyến đã đóng băng.
   */
  async assignDriver(
    tenantId: string,
    id: string,
    userId: string,
    driverId: string | null,
  ): Promise<BookingDetailDto> {
    const current = await this.prisma.booking.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, status: true, driverId: true, pickupAt: true, returnAt: true },
    });
    if (!current) throw notFound();
    assertMutable(current.status as BookingStatus);

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        // Kiểm khả dụng trong CÙNG transaction với lệnh ghi — cửa sổ đua thu về constraint.
        const driver = driverId
          ? await this.drivers.findAssignable(
              tenantId,
              driverId,
              {
                pickupAt: current.pickupAt,
                returnAt: current.returnAt,
                excludeBookingId: current.id,
              },
              tx,
            )
          : null;

        const updated = await tx.booking.update({
          where: { id: current.id },
          data: { driverId: driver?.id ?? null },
          select: DETAIL_SELECT,
        });

        await this.audit.record(
          {
            tenantId,
            actorUserId: userId,
            actorScope: 'tenant',
            action: 'booking.driver_assign',
            targetType: 'booking',
            targetId: id,
            before: { driverId: current.driverId },
            after: {
              driverId: driver?.id ?? null,
              ...(driver ? { driverName: driver.name } : {}),
            },
          },
          tx,
        );

        return updated;
      });
      return this.withMoneyOne(toDetail(row));
    } catch (err) {
      // Hai request đua qua được bước kiểm — exclusion constraint từ chối kẻ đến sau (23P01).
      if (isDriverScheduleConflict(err)) {
        throw new ConflictException({
          code: API_ERROR_CODE.CONFLICT,
          message: 'Tài xế vừa được gán vào một đơn giao nhau — tải lại rồi chọn người khác',
        });
      }
      throw err;
    }
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

    return this.withMoneyOne(toDetail(row));
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
    opts: {
      actualPickupAt?: string | null;
      actualReturnAt?: string | null;
      /**
       * Bỏ thông báo cho thành viên gian hàng. CHỈ dùng cho bước TRUNG GIAN của một chuỗi
       * chuyển trạng thái xảy ra trong cùng một hành động (giao xe từ đơn `reserved` phải đi
       * qua `confirmed`): người trong shop cần biết kết quả cuối, không cần hai tin trong cùng
       * một giây kể lại từng chặng. Audit vẫn ghi đủ mọi chặng — đó mới là nơi truy vết.
       */
      silent?: boolean;
      /**
       * Ai thao tác. Mặc định là người của gian hàng vì phần lớn chuyển trạng thái đến từ cổng
       * quản lý; KHÁCH tự huỷ chuyến phải khai `customer`, nếu không audit ghi nhầm thành nhân
       * viên shop huỷ đơn của khách — đúng thứ mà cuốn sổ này tồn tại để phân định.
       */
      actorScope?: AuditActorScope;
    } = {},
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
        actorScope: opts.actorScope ?? AUDIT_ACTOR_SCOPE.TENANT,
        action: 'booking.transition',
        targetType: 'booking',
        targetId: id,
        before: { status: from },
        after: { status: to },
      },
      tx,
    );

    // Báo các thành viên khác của shop biết đơn đổi trạng thái (nhận biết nội bộ).
    if (!opts.silent) {
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

      /*
       * Khách cũng phải biết chuyến của mình bắt đầu và kết thúc (Wave 11). Chỉ hai mốc đó —
       * `reserved → confirmed` là bút toán nội bộ, khách không có việc gì với nó.
       *
       * Dùng lại đúng loại thông báo và kho thông báo đã có; trỏ thẳng vào chuyến để bấm là
       * tới nơi. Khách vãng lai chưa có tài khoản thì không có gì để gửi.
       */
      if (to === BOOKING_STATUS.ACTIVE || to === BOOKING_STATUS.COMPLETED) {
        const request = await tx.bookingRequest.findFirst({
          where: { bookingId: id },
          select: { customerUserId: true },
        });
        if (request?.customerUserId) {
          await this.notifications.emitToUser(
            request.customerUserId,
            {
              type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
              title:
                to === BOOKING_STATUS.ACTIVE
                  ? 'Hành trình của bạn đã bắt đầu'
                  : 'Chuyến đi đã hoàn thành',
              body:
                to === BOOKING_STATUS.ACTIVE
                  ? `${updated.vehicle.name} · chúc bạn một chuyến đi an toàn`
                  : `${updated.vehicle.name} · cảm ơn bạn đã đồng hành cùng XePrime`,
              tenantId,
              targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
              targetId: id,
            },
            tx,
          );
        }
      }
    }

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

/**
 * Vi phạm exclusion `bookings_driver_schedule_excl` (23P01) — Prisma bọc trong
 * PrismaClientKnownRequestError hoặc lỗi thô tuỳ đường đi; nhận diện theo TÊN constraint để
 * không nuốt nhầm 23P01 của lịch xe (occupancy).
 */
function isDriverScheduleConflict(err: unknown): boolean {
  const text =
    err instanceof Error
      ? `${err.message} ${JSON.stringify((err as { meta?: unknown }).meta ?? '')}`
      : '';
  return text.includes('bookings_driver_schedule_excl');
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
    longTermPackageMonths: b.longTermPackageMonths,
    customerName: b.customerName,
    customerPhone: b.customerPhone,
    status: b.status,
    serviceType: b.serviceType,
    pickupAt: b.pickupAt as unknown as string,
    returnAt: b.returnAt as unknown as string,
    totalAmount: b.totalAmount as unknown as string,
    paidAmount: b.paidAmount as unknown as string,
    // Năm số tổng hợp bên dưới do `BookingsService.withMoney` vá vào SAU khi map: chúng cần ba
    // tổng ở ba bảng khác (phụ phí, phiếu tay, cọc đã thu) mà một dòng `bookings` không mang.
    // Giá trị ở đây chỉ là mức nền an toàn nếu ai đó gọi mapper trực tiếp.
    surchargeTotal: '0',
    amountDue: b.totalAmount as unknown as string,
    otherCollected: '0',
    collectedAmount: b.paidAmount as unknown as string,
    debtAmount: bookingDebt(b.totalAmount, b.paidAmount) as unknown as string,
    depositAmount: b.depositAmount as unknown as string,
    driver: b.driver,
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
    routeType: b.routeType,
    pickupAddress: b.pickupAddress,
    destination: b.destination,
    vehicleImageUrl: b.vehicle.mainImageUrl,
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

/**
 * Chặn GHI lên đơn đã khép (`completed` / `cancelled` / `no_show`).
 *
 * Trước Wave 12 mọi đường sửa đơn đều bỏ qua trạng thái: một chuyến đã hoàn tất, đã quyết toán
 * và đã hoàn cọc vẫn đổi được giờ thuê, tiền thuê, phí giao nhận và thông tin khách — tức là
 * viết lại một bản ghi mà cả hai bên đã dựa vào để trả tiền cho nhau.
 *
 * Sửa số sau chuyến vẫn có đường riêng và có LÝ DO đi kèm: phát sinh, điều chỉnh hoàn cọc, bổ
 * sung KM. Ở đây chỉ đóng cửa sau, không lấy đi cách nào cả.
 */
function assertMutable(status: BookingStatus): void {
  if (!isBookingFinal(status)) return;
  throw new ConflictException({
    code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
    message: `Đơn đã ở trạng thái "${BOOKING_STATUS_META[status].label}" nên không sửa được nữa`,
  });
}
