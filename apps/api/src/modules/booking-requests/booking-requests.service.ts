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
  BOOKING_REQUEST_STATUS_VALUES,
  isLongTermPackageMonths,
  vnDateKey,
  longTermPickupWindow,
  longTermReturnAt,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  PICKUP_PREFERENCE,
  SERVICE_TYPE,
  TENANT_CUSTOMER_SOURCE,
  TENANT_STATUS,
  USER_STATUS,
  VEHICLE_PUBLIC_STATUS,
  type BookingRequestDeliveryQuote,
} from '@xeprime/types';
import { fromDateOnly, toDateOnly } from '../../common/date-only';
import { normalizePhone, phoneLookupVariants } from '../../common/phone';
import { normalizeRouteContext } from '../../common/route-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { OccupancyService } from '../calendar/occupancy.service';
import { NotificationService } from '../notification/notification.service';
import { BookingsService } from '../bookings/bookings.service';
import { CustomersService } from '../customers/customers.service';
import { PhoneVerificationService } from '../phone-verification/phone-verification.service';
import { PricingService } from '../pricing/pricing.service';
import {
  ApproveBookingRequestDto,
  BOOKING_REQUEST_DEFAULT_LIMIT,
  BOOKING_REQUEST_MAX_LIMIT,
  BookingRequestDto,
  BookingRequestListQueryDto,
  BookingRequestPageMetaDto,
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
  serviceType: true,
  longTermPackageMonths: true,
  pickupPreference: true,
  requestedPickupDate: true,
  pickupWindowStartDate: true,
  pickupWindowEndDate: true,
  routeType: true,
  pickupAddress: true,
  destination: true,
  note: true,
  deliveryRequested: true,
  deliveryAddress: true,
  deliveryQuote: true,
  rejectReason: true,
  bookingId: true,
  tenantCustomerId: true,
  createdAt: true,
  decidedAt: true,
  /**
   * `customerUserId` được chọn để suy ra `canMessageOnPlatform` — nó KHÔNG bao giờ đi ra DTO
   * (xem `toDto`): định danh tài khoản xuyên gian hàng không có việc gì ở inbox của một shop.
   */
  customerUserId: true,
  /*
   * Mọi thứ inbox cần nằm trong ĐÚNG một truy vấn — ảnh/mã/loại xe qua quan hệ `vehicle`, ảnh
   * đại diện qua tài khoản khách, mức rủi ro qua hồ sơ sổ khách. Không có vòng lặp nào đi tra
   * thêm sau khi có danh sách (N+1).
   */
  vehicle: {
    select: { name: true, plateNumber: true, code: true, vehicleType: true, mainImageUrl: true },
  },
  customer: { select: { avatarUrl: true } },
  tenantCustomer: { select: { riskLevel: true } },
} satisfies Prisma.BookingRequestSelect;

/** Nguyện vọng thuê dài hạn sau khi server chuẩn hoá — hai nhánh ngày LOẠI TRỪ nhau. */
interface LongTermIntent {
  packageMonths: number;
  preference: string;
  requestedPickupDate: Date | null;
  windowStart: Date | null;
  windowEnd: Date | null;
}

/** Lịch chốt lúc duyệt: dịch vụ theo ngày giữ nguyên lịch của khách, dài hạn do gian hàng chốt. */
interface ApprovalSchedule {
  pickupAt: Date;
  returnAt: Date;
  packageMonths: number | null;
}

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
    private readonly customers: CustomersService,
  ) {}

  /**
   * Xe khả dụng để đặt: đã `approved_public` và thuộc shop `active`. `tenantId` suy từ xe ở server
   * (không tin client). Dùng chung cho submit + check-availability.
   */
  private async loadBookableVehicle(
    vehicleId: string,
  ): Promise<{ id: string; tenantId: string; name: string; serviceTypes: string[] }> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        deletedAt: null,
        publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
        tenant: { status: TENANT_STATUS.ACTIVE, deletedAt: null },
      },
      select: { id: true, tenantId: true, name: true, serviceTypes: true },
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

    /*
     * Dịch vụ của chuyến — kiểm ở SERVER, FE chỉ là preview:
     *   - phải nằm trong NĂNG LỰC của xe (`vehicle.serviceTypes`) — DB không cross-check được
     *     hai bảng, đây là chỗ duy nhất dựa vào service;
     *   - dài hạn đi mô hình GÓI (không có ngày trả từ client — ADR 0011);
     *   - có tài xế bắt buộc lộ trình + địa chỉ đón, liên tỉnh bắt buộc điểm đến;
     *   - lộ trình/địa chỉ đón/điểm đến bị NORMALIZE về null với dịch vụ khác (CHECK DB
     *     route_type ⇒ with_driver sẽ từ chối dữ liệu lệch nếu service quên).
     */
    const serviceType = dto.serviceType ?? SERVICE_TYPE.SELF_DRIVE;
    if (!vehicle.serviceTypes.includes(serviceType)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Xe không phục vụ loại dịch vụ này',
      });
    }
    const longTerm = serviceType === SERVICE_TYPE.LONG_TERM ? this.longTermIntent(dto) : null;

    // Dịch vụ theo NGÀY vẫn giữ hợp đồng cũ: khách chọn khoảng nhận–trả và nó phải hợp lệ.
    let pickupAt: Date | null = null;
    let returnAt: Date | null = null;
    if (!longTerm) {
      pickupAt = new Date(dto.pickupAt!);
      returnAt = new Date(dto.returnAt!);
      if (!(returnAt.getTime() > pickupAt.getTime())) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: 'Thời điểm trả xe phải sau thời điểm nhận xe',
        });
      }
    }
    const withDriver = serviceType === SERVICE_TYPE.WITH_DRIVER;
    // MỘT nguồn luật hành trình cho cả yêu cầu của khách lẫn đơn shop lập tay (common/route-context).
    const route = normalizeRouteContext({
      serviceType,
      routeType: dto.routeType,
      pickupAddress: dto.pickupAddress,
      destination: dto.destination,
    });

    // Giao tận nơi: kiểm ở SERVER theo chính sách hiệu lực — FE ẩn ô nhập không phải lớp chặn.
    // Chuyến CÓ TÀI XẾ thì xe đến đón khách — "giao xe tận nơi" không có nghĩa, ép false.
    const deliveryRequested = !withDriver && dto.deliveryRequested === true;
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

    /*
     * Gian hàng từ chối phục vụ SĐT này (S-01)?
     *
     * Đặt SAU cửa OTP là có chủ đích: người gửi phải chứng minh sở hữu SĐT trước khi biết kết
     * quả, nên không dò được "số nào đang bị chặn ở gian hàng nào". Đặt TRƯỚC mọi tác dụng phụ
     * (tạo tài khoản theo SĐT, ghi yêu cầu, bắn thông báo cho shop) để một yêu cầu chắc chắn bị
     * từ chối không để lại rác. Thông điệp trả về TRUNG TÍNH — xem `blockedCustomer('public')`.
     */
    await this.customers.assertNotBlocked(vehicle.tenantId, dto.customerPhone, 'public');

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

    await this.assertNoPendingDuplicate(
      vehicle.id,
      dto.customerPhone,
      pickupAt,
      returnAt,
      longTerm,
    );

    const id = newId();
    // Ghi yêu cầu + báo cả shop trong một transaction: yêu cầu mới luôn có thông báo đi kèm.
    try {
      await this.prisma.$transaction(async (tx) => {
        // Sổ khách (S-01): yêu cầu gắn về một hồ sơ khách ngay khi nhận, trong cùng transaction.
        // Khi duyệt, id này được COPY sang đơn — không tra lại theo SĐT (SĐT trên hồ sơ có thể
        // đã được sửa giữa chừng, tra lại sẽ đẻ ra một khách thứ hai).
        const tenantCustomerId = await this.customers.resolveWithinTx(tx, vehicle.tenantId, {
          fullName: dto.customerName,
          phone: dto.customerPhone,
          email: dto.customerEmail,
          customerUserId: effectiveUserId,
          source: TENANT_CUSTOMER_SOURCE.MARKETPLACE,
          mode: 'public',
        });

        await tx.bookingRequest.create({
          data: {
            id,
            tenantId: vehicle.tenantId,
            tenantCustomerId,
            vehicleId: vehicle.id,
            status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
            customerName: dto.customerName,
            customerPhone: dto.customerPhone,
            customerEmail: dto.customerEmail ?? null,
            customerUserId: effectiveUserId,
            pickupAt,
            returnAt,
            serviceType,
            longTermPackageMonths: longTerm?.packageMonths ?? null,
            pickupPreference: longTerm?.preference ?? null,
            requestedPickupDate: longTerm?.requestedPickupDate ?? null,
            pickupWindowStartDate: longTerm?.windowStart ?? null,
            pickupWindowEndDate: longTerm?.windowEnd ?? null,
            routeType: route.routeType,
            pickupAddress: route.pickupAddress,
            destination: route.destination,
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
      // Đây là chốt chặn cho hai request CHẠY SONG SONG; kiểm ở trên lo phần định dạng khác nhau.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw duplicateRequest();
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
  /**
   * Chặn gửi trùng khi SĐT được gõ ở ĐỊNH DẠNG KHÁC.
   *
   * `booking_requests_pending_dedupe_idx` là unique một phần trên `(xe, customer_phone, giờ
   * nhận, giờ trả)` — so khớp CHUỖI THÔ. Nhưng cột đó cố ý giữ nguyên như người dùng gõ, và DTO
   * nhận cả `0901234567` lẫn `+84901234567`, nên cùng một người gửi hai lần bằng hai định dạng
   * sẽ lọt qua index và shop nhận hai yêu cầu y hệt.
   *
   * Kiểm ở đây phủ mọi biến thể lưu được của cùng một số. Index vẫn giữ nguyên vai trò chốt
   * chặn cuối cho hai request chạy song song — kiểm trước là để báo lỗi đúng, không phải để
   * thay thế ràng buộc DB.
   */
  private async assertNoPendingDuplicate(
    vehicleId: string,
    rawPhone: string,
    pickupAt: Date | null,
    returnAt: Date | null,
    longTerm: LongTermIntent | null,
  ): Promise<void> {
    const existing = await this.prisma.bookingRequest.findFirst({
      where: {
        vehicleId,
        customerPhone: { in: phoneLookupVariants(rawPhone) },
        status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
        // Dài hạn không có lịch để so — trùng nghĩa là cùng gói VÀ cùng nguyện vọng nhận xe.
        ...(longTerm
          ? {
              serviceType: SERVICE_TYPE.LONG_TERM,
              longTermPackageMonths: longTerm.packageMonths,
              pickupPreference: longTerm.preference,
              requestedPickupDate: longTerm.requestedPickupDate,
            }
          : { pickupAt, returnAt }),
      },
      select: { id: true },
    });
    if (existing) throw duplicateRequest();
  }

  /**
   * Nguyện vọng thuê dài hạn của khách, chuẩn hoá ở SERVER.
   *
   * Khoảng "trong 7 ngày tới" tính từ THỜI ĐIỂM NHẬN yêu cầu — client không gửi và không thể
   * giả mạo khoảng này. Ngày cụ thể phải từ ngày mai trở đi (nhận xe trong quá khứ là vô nghĩa).
   */
  private longTermIntent(dto: CreateBookingRequestDto): LongTermIntent {
    const packageMonths = dto.longTermPackageMonths;
    if (!isLongTermPackageMonths(packageMonths)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Chọn gói thuê dài hạn',
      });
    }
    const now = new Date();
    const window = longTermPickupWindow(now);
    if (dto.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE) {
      const requested = dto.requestedPickupDate;
      if (!requested) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: 'Chọn ngày muốn nhận xe',
        });
      }
      if (requested < window.start) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: 'Ngày nhận xe phải từ ngày mai trở đi',
        });
      }
      return {
        packageMonths,
        preference: PICKUP_PREFERENCE.SPECIFIC_DATE,
        requestedPickupDate: toDateOnly(requested),
        windowStart: null,
        windowEnd: null,
      };
    }
    if (dto.pickupPreference !== PICKUP_PREFERENCE.WITHIN_7_DAYS) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Chọn nguyện vọng nhận xe',
      });
    }
    return {
      packageMonths,
      preference: PICKUP_PREFERENCE.WITHIN_7_DAYS,
      requestedPickupDate: null,
      windowStart: toDateOnly(window.start),
      windowEnd: toDateOnly(window.end),
    };
  }

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

  /**
   * Inbox yêu cầu của gian hàng.
   *
   * `meta.statusCounts` là con số trên các TAB, nên nó cố ý dùng phạm vi RỘNG HƠN trang đang
   * xem: cùng gian hàng, cùng chi nhánh, cùng bộ lọc xe — nhưng KHÔNG có bộ lọc trạng thái.
   * Nhờ vậy đứng ở tab "Cần xử lý" vẫn thấy tab "Đã từ chối" có bao nhiêu. Một lần `groupBy`
   * cho toàn bộ các tab, không phải một truy vấn đếm mỗi trạng thái, và nằm cùng transaction
   * với trang dữ liệu để hai con số không đọc từ hai thời điểm khác nhau.
   */
  async list(
    tenantId: string,
    query: BookingRequestListQueryDto,
  ): Promise<{ data: BookingRequestDto[]; meta: BookingRequestPageMetaDto }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      BOOKING_REQUEST_MAX_LIMIT,
      Math.max(1, query.limit ?? BOOKING_REQUEST_DEFAULT_LIMIT),
    );

    /*
     * `scope` = mọi thứ TRỪ trạng thái — vì nó nuôi cả `statusCounts` của hàng tab. Tìm kiếm và
     * lọc dịch vụ nằm ở đây có chủ đích: gõ "Vios" xong, con số trên từng tab phải là số yêu cầu
     * Vios của trạng thái đó, không phải tổng cũ đứng cạnh một danh sách đã lọc.
     */
    const scope: Prisma.BookingRequestWhereInput = {
      tenantId,
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      // Lọc qua quan hệ xe → chi nhánh. Đứng SAU `tenantId` và không thay thế nó: bộ chọn chi
      // nhánh chỉ thu hẹp phạm vi, không bao giờ là đường ra khỏi gian hàng của mình.
      ...(query.branchId ? { vehicle: { branchId: query.branchId } } : {}),
      ...(query.serviceType ? { serviceType: query.serviceType } : {}),
      ...searchWhere(query.q),
    };
    const where: Prisma.BookingRequestWhereInput = {
      ...scope,
      ...(query.status ? { status: query.status } : {}),
    };

    /*
     * Tách biến trước khi đưa vào `$transaction([...])`: bên trong mảng, Prisma suy kiểu kết
     * quả của `groupBy` bị nới thành union (`_count` có thể là `true`), còn ở đây nó giữ đúng
     * `{ status, _count: number }`. Cả ba vẫn chạy trong CÙNG một transaction.
     */
    const countByStatus = this.prisma.bookingRequest.groupBy({
      by: ['status'],
      where: scope,
      orderBy: { status: 'asc' },
      _count: true,
    });

    const [total, rows, grouped] = await this.prisma.$transaction([
      this.prisma.bookingRequest.count({ where }),
      this.prisma.bookingRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: SELECT,
      }),
      countByStatus,
    ]);

    const counted = new Map(grouped.map((g) => [g.status, g._count]));

    return {
      data: rows.map(toDto),
      meta: {
        page,
        limit,
        total,
        hasNext: page * limit < total,
        // Liệt kê ĐỦ bộ trạng thái, kể cả trạng thái không có yêu cầu nào: một tab không có
        // con số trông như "chưa tải xong", còn `0` là một câu trả lời.
        statusCounts: BOOKING_REQUEST_STATUS_VALUES.map((status) => ({
          status,
          count: counted.get(status) ?? 0,
        })),
      },
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
   *
   * Tiền của đơn KHÔNG nhập tay ở luồng này: PricingService tính từ giá xe + chính sách hiệu
   * lực, và snapshot bất biến ghi kèm đơn.
   *
   * **Giao nhận KHÔNG còn là cửa chặn (Wave 9).** Trước đây yêu cầu có giao tận nơi phải qua
   * một vòng báo giá theo khoảng cách mới duyệt được (`DELIVERY_QUOTE_REQUIRED`) — thực tế chủ
   * xe và khách vẫn thống nhất phí qua điện thoại, nên vòng đó chỉ chặn việc duyệt chứ không
   * quyết định con số. Giờ **luôn duyệt được ngay** và đơn sinh ra với `deliveryFee = 0`
   * (`Miễn phí`); sau khi hai bên thống nhất, chủ xe cập nhật phí bằng
   * `BookingsService.updateDeliveryFee` — có audit, không cần khách xác nhận.
   *
   * Địa chỉ giao và cờ `deliveryRequested` của yêu cầu vẫn giữ nguyên để chủ xe biết phải giao
   * ở đâu; dữ liệu báo giá cũ (nếu có) vẫn đọc được nhưng không còn ảnh hưởng gì tới việc duyệt.
   */
  async approve(
    tenantId: string,
    userId: string,
    id: string,
    dto: ApproveBookingRequestDto = {},
  ): Promise<BookingRequestDto> {
    const req = await this.loadPending(tenantId, id);

    /*
     * Kiểm LẠI danh sách từ chối phục vụ ngay trước khi duyệt.
     *
     * Lúc khách GỬI yêu cầu họ có thể còn bình thường; gian hàng đánh dấu `blocked` sau đó,
     * rồi vẫn còn yêu cầu cũ nằm trong inbox. Duyệt nó là lập một đơn cho đúng người mà gian
     * hàng vừa quyết định không phục vụ nữa. `mode: 'internal'` vì đây là người TRONG shop —
     * họ được biết lý do thật, khác đường công khai (ADR/CLAUDE mục lỗi CUSTOMER_BLOCKED).
     *
     * Giao diện có ẩn nút duyệt hay không không liên quan: chặn thật nằm ở đây.
     */
    await this.customers.assertNotBlocked(tenantId, req.customerPhone, 'internal');

    const policy = await this.pricing.effectivePolicy(tenantId, req.vehicleId);
    const schedule = this.resolveApprovalSchedule(req, dto);

    /*
     * Dài hạn tính theo GÓI tháng lịch — không đi qua máy giá ngày, không đụng giá riêng theo
     * ngày và không ăn khuyến mãi trực tiếp của tự lái (ADR 0011). Khách xem giá gói nào ở
     * marketplace thì duyệt ra đúng con số đó, vì cùng một hàm tính.
     */
    const breakdown =
      req.serviceType === SERVICE_TYPE.LONG_TERM
        ? this.pricing.buildLongTermPackageQuote({
            monthlyPrice: req.vehicle.monthlyPrice?.toFixed(0) ?? null,
            packageMonths: schedule.packageMonths!,
            policy,
            delivery: null,
          })
        : this.pricing.buildDailyQuote({
            weekdayPrice: req.vehicle.weekdayPrice?.toFixed(0) ?? null,
            weekendPrice: req.vehicle.weekendPrice?.toFixed(0) ?? null,
            pickupAt: schedule.pickupAt,
            returnAt: schedule.returnAt,
            policy,
            // Miễn phí lúc duyệt — không dòng giao nhận nào trong snapshot giá gốc.
            delivery: null,
            // Giá riêng theo ngày áp cả ở đây — snapshot của đơn phải khớp báo giá khách đã thấy.
            dailyOverrides: await this.pricing.dailyOverridesFor(
              req.vehicleId,
              schedule.pickupAt,
              schedule.returnAt,
            ),
            serviceType: req.serviceType,
            routeType: req.routeType,
            withDriverDailyPrice: req.vehicle.withDriverDailyPrice?.toFixed(0) ?? null,
            withDriverInterCityPrice: req.vehicle.withDriverInterCityPrice?.toFixed(0) ?? null,
            withDriverOneWayPrice: req.vehicle.withDriverOneWayPrice?.toFixed(0) ?? null,
            discountPercent: req.vehicle.discountPercent,
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
          // Lịch CHỐT: dịch vụ theo ngày giữ nguyên lịch khách chọn; dài hạn lấy giờ nhận gian
          // hàng vừa chốt và giờ trả do SERVER tính từ gói (client không gửi được ngày trả).
          pickupAt: schedule.pickupAt.toISOString(),
          returnAt: schedule.returnAt.toISOString(),
          longTermPackageMonths: schedule.packageMonths ?? undefined,
          // Fix 17/08: trước đây serviceType KHÔNG được map — mọi đơn sinh từ yêu cầu đều rơi
          // về default self_drive, kể cả chuyến có tài xế/dài hạn.
          serviceType: req.serviceType,
          // Hành trình đi cùng đơn (đợt hoàn thiện 17/08): lộ trình/địa chỉ đón/điểm đến của
          // yêu cầu with_driver copy nguyên sang Booking — chi tiết đơn, phân công tài xế,
          // chuyến của khách và hợp đồng đều nhìn thấy, không phải quay lại yêu cầu gốc.
          routeType: req.routeType ?? undefined,
          pickupAddress: req.pickupAddress ?? undefined,
          destination: req.destination ?? undefined,
          baseAmount: rowAmount(breakdown.rows, 'base'),
          discountAmount: rowAmountAbs(breakdown.rows, 'discount'),
          deliveryFee: rowAmount(breakdown.rows, 'delivery'),
          depositAmount: breakdown.depositAmount,
        },
        'from_request',
        snapshot,
        // Sổ khách (S-01): COPY nguyên id đã gắn trên yêu cầu, không tra lại theo SĐT — SĐT trên
        // hồ sơ có thể đã được sửa sau lúc khách gửi, và tra lại sẽ đẻ ra một khách thứ hai.
        // Yêu cầu LEGACY (trước migration) không có id thì `createWithinTx` tự tìm-hoặc-tạo.
        req.tenantCustomerId,
      );

      const updated = await tx.bookingRequest.update({
        where: { id },
        data: {
          status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
          bookingId: booking.id,
          // Yêu cầu dài hạn được sinh ra KHÔNG có lịch; sau khi duyệt nó phải giữ chính lịch
          // đã chốt để inbox/lịch sử đọc được mà không phải join sang đơn.
          pickupAt: schedule.pickupAt,
          returnAt: schedule.returnAt,
          longTermPackageMonths: schedule.packageMonths,
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

  /**
   * Lịch chính xác của đơn sắp tạo.
   *
   * Dịch vụ theo NGÀY: giữ nguyên khoảng khách đã chọn. Muốn đổi lịch thì không được làm im
   * lặng ở bước duyệt — trả lỗi để gian hàng thoả thuận lại với khách.
   *
   * THUÊ DÀI HẠN: gian hàng bắt buộc chốt `scheduledPickupAt`, và ngày đó phải ĐÚNG nguyện
   * vọng khách nêu (trùng ngày cụ thể, hoặc nằm trong khoảng 7 ngày server đã tính). Ngày trả
   * luôn do server suy ra từ gói bằng tháng lịch.
   */
  private resolveApprovalSchedule(
    req: PendingRequestRow,
    dto: ApproveBookingRequestDto,
  ): ApprovalSchedule {
    if (req.serviceType !== SERVICE_TYPE.LONG_TERM) {
      if (dto.scheduledPickupAt) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: 'Chỉ yêu cầu thuê dài hạn mới chốt lại giờ nhận khi duyệt',
        });
      }
      if (!req.pickupAt || !req.returnAt) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: 'Yêu cầu thiếu thời gian nhận/trả xe',
        });
      }
      return { pickupAt: req.pickupAt, returnAt: req.returnAt, packageMonths: null };
    }

    // Gói: yêu cầu mới luôn có; bản ghi LEGACY chưa có nên gian hàng phải chọn khi xử lý.
    const packageMonths = req.longTermPackageMonths ?? dto.longTermPackageMonths ?? null;
    if (!isLongTermPackageMonths(packageMonths)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Yêu cầu thuê dài hạn cũ chưa có gói — chọn gói thuê trước khi duyệt',
      });
    }
    if (
      req.longTermPackageMonths != null &&
      dto.longTermPackageMonths != null &&
      dto.longTermPackageMonths !== req.longTermPackageMonths
    ) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Không được đổi gói khách đã chọn — từ chối yêu cầu và mời khách đặt lại gói khác',
      });
    }

    // Bản ghi legacy không có nguyện vọng: giữ nguyên giờ nhận khách từng chọn nếu gian hàng
    // không chốt lại — migration đã cố ý không đổi ngày, luồng duyệt cũng không được đổi ngầm.
    const pickupAt = dto.scheduledPickupAt
      ? new Date(dto.scheduledPickupAt)
      : req.pickupPreference == null
        ? req.pickupAt
        : null;
    if (!pickupAt || Number.isNaN(pickupAt.getTime())) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Chọn ngày và giờ nhận xe chính xác để duyệt yêu cầu thuê dài hạn',
      });
    }
    const scheduledDay = vnDateKey(pickupAt);
    if (req.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE) {
      const requested = fromDateOnly(req.requestedPickupDate);
      if (requested && scheduledDay !== requested) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: `Khách yêu cầu nhận xe ngày ${requested} — chọn đúng ngày đó hoặc từ chối yêu cầu`,
        });
      }
    } else if (req.pickupPreference === PICKUP_PREFERENCE.WITHIN_7_DAYS) {
      const start = fromDateOnly(req.pickupWindowStartDate);
      const end = fromDateOnly(req.pickupWindowEndDate);
      if (start && end && (scheduledDay < start || scheduledDay > end)) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: `Ngày nhận phải nằm trong khoảng khách mong muốn (${start} → ${end})`,
        });
      }
    }

    return { pickupAt, returnAt: longTermReturnAt(pickupAt, packageMonths), packageMonths };
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
  private async loadPending(tenantId: string, id: string): Promise<PendingRequestRow> {
    const req = await this.prisma.bookingRequest.findFirst({
      where: { id, tenantId },
      select: PENDING_SELECT,
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

/** Cột cần để duyệt/từ chối một yêu cầu — gồm nguyện vọng dài hạn và giá của xe. */
const PENDING_SELECT = {
  id: true,
  status: true,
  vehicleId: true,
  customerName: true,
  customerPhone: true,
  customerUserId: true,
  /// Hồ sơ sổ khách đã gắn lúc nhận yêu cầu — duyệt COPY nguyên id này sang đơn (S-01).
  tenantCustomerId: true,
  pickupAt: true,
  returnAt: true,
  serviceType: true,
  longTermPackageMonths: true,
  pickupPreference: true,
  requestedPickupDate: true,
  pickupWindowStartDate: true,
  pickupWindowEndDate: true,
  routeType: true,
  pickupAddress: true,
  destination: true,
  deliveryRequested: true,
  deliveryQuote: true,
  vehicle: {
    select: {
      name: true,
      weekdayPrice: true,
      weekendPrice: true,
      monthlyPrice: true,
      withDriverDailyPrice: true,
      withDriverInterCityPrice: true,
      withDriverOneWayPrice: true,
      discountPercent: true,
    },
  },
} satisfies Prisma.BookingRequestSelect;

type PendingRequestRow = Prisma.BookingRequestGetPayload<{ select: typeof PENDING_SELECT }>;

type BookingRequestRow = Prisma.BookingRequestGetPayload<{ select: typeof SELECT }>;

/**
 * Wave 9: `deliveryQuote` chỉ còn là **dữ liệu lịch sử đọc-được** của các yêu cầu đã báo giá
 * trước đây. Không còn `needsDeliveryQuote`/`stale` — không có gì để "cần" hay "cũ" nữa khi
 * việc duyệt không phụ thuộc báo giá.
 */
function toDto(r: BookingRequestRow): BookingRequestDto {
  const quote = r.deliveryQuote as unknown as BookingRequestDeliveryQuote | null;
  return {
    id: r.id,
    vehicleId: r.vehicleId,
    vehicleName: r.vehicle.name,
    vehiclePlate: r.vehicle.plateNumber,
    vehicleCode: r.vehicle.code,
    vehicleImageUrl: r.vehicle.mainImageUrl,
    vehicleType: r.vehicle.vehicleType,
    status: r.status,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    customerEmail: r.customerEmail,
    tenantCustomerId: r.tenantCustomerId,
    customerAvatarUrl: r.customer?.avatarUrl ?? null,
    customerRiskLevel: r.tenantCustomer?.riskLevel ?? null,
    // Có tài khoản ⇒ có phía bên kia để mở hội thoại. `customerUserId` KHÔNG ra ngoài, chỉ sự
    // thật boolean này ra — vừa đủ để bật/tắt nút "Nhắn tin".
    canMessageOnPlatform: r.customerUserId != null,
    pickupAt: r.pickupAt ? (r.pickupAt as unknown as string) : null,
    returnAt: r.returnAt ? (r.returnAt as unknown as string) : null,
    serviceType: r.serviceType,
    longTermPackageMonths: r.longTermPackageMonths,
    pickupPreference: r.pickupPreference,
    requestedPickupDate: fromDateOnly(r.requestedPickupDate),
    pickupWindowStartDate: fromDateOnly(r.pickupWindowStartDate),
    pickupWindowEndDate: fromDateOnly(r.pickupWindowEndDate),
    routeType: r.routeType,
    pickupAddress: r.pickupAddress,
    destination: r.destination,
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
        }
      : null,
    rejectReason: r.rejectReason,
    bookingId: r.bookingId,
    createdAt: r.createdAt as unknown as string,
    decidedAt: (r.decidedAt as unknown as string | null) ?? null,
  };
}

/**
 * Ô tìm kiếm của hộp thư yêu cầu.
 *
 * Chạm đúng bốn thứ hiện trên THẺ: tên khách, SĐT, tên xe, biển số. Không tìm theo ghi chú —
 * ghi chú là văn xuôi tự do, gõ một từ phổ biến sẽ kéo về nửa hộp thư và làm ô tìm kiếm mất
 * nghĩa. `contains` + `insensitive` dịch ra `ILIKE '%…%'`, đi được bằng index trigram đã có
 * trên `vehicles(name, plate_number)`.
 */
function searchWhere(q: string | undefined): Prisma.BookingRequestWhereInput {
  const term = q?.trim();
  if (!term) return {};
  const contains = { contains: term, mode: 'insensitive' } as const;
  return {
    OR: [
      { customerName: contains },
      { customerPhone: contains },
      { vehicle: { name: contains } },
      { vehicle: { plateNumber: contains } },
    ],
  };
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

/** MỘT câu cho cả hai lớp chặn trùng (kiểm trước và ràng buộc DB) — client chỉ thấy một mã lỗi. */
function duplicateRequest(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.BOOKING_REQUEST_DUPLICATE,
    message: 'Bạn vừa gửi một yêu cầu giống hệt cho xe này — vui lòng chờ shop phản hồi',
  });
}
