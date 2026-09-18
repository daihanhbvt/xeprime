import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import { subtractMoney } from '@xeprime/domain';
import {
  addDateKeyDays,
  API_ERROR_CODE,
  BOOKING_BLOCK_REASON,
  MEMBERSHIP_STATUS,
  resolveBookingBlock,
  resolveEffectiveBilling,
  AUDIT_ACTOR_SCOPE,
  AUTO_ACCEPT_BLOCKER,
  BOOKING_REQUEST_DECISION_SOURCE,
  BOOKING_REQUEST_STATUS,
  BOOKING_REQUEST_STATUS_VALUES,
  bookingRequestRespondBy,
  DEPOSIT_COLLECTION_MODE,
  isBookingRequestPastDue,
  isLongTermPackageMonths,
  vnDateKey,
  vnDayStart,
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
  type AutoAcceptBlocker,
  type BookingRequestDecisionSource,
  type BookingRequestDeliveryQuote,
  type BookingPriceSnapshot,
  type CustomerFeeBreakdown,
  type RentalTermsSnapshot,
  type ServiceType,
} from '@xeprime/types';
import {
  EFFECTIVE_SUBSCRIPTION_ARGS,
  effectiveSubscriptionWhere,
} from '../../common/plan/feature-state';
import { fromDateOnly, toDateOnly } from '../../common/date-only';
import { normalizePhone, phoneLookupVariants } from '../../common/phone';
import { normalizeRouteContext } from '../../common/route-context';
import { addressViewOf, pinOf } from '../../common/address-view';
import { PrismaService } from '../../prisma/prisma.service';
import { AddressService } from '../locations/address.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { OccupancyService } from '../calendar/occupancy.service';
import { NotificationService } from '../notification/notification.service';
import { BookingsService } from '../bookings/bookings.service';
import { BookingHoldsService } from '../holds/booking-holds.service';
import { CustomersService } from '../customers/customers.service';
import {
  DepositPolicyService,
  type DepositPolicyResolution,
} from '../deposit-policy/deposit-policy.service';
import { PhoneVerificationService } from '../phone-verification/phone-verification.service';
import { PricingService } from '../pricing/pricing.service';
import { VehicleSettingsService } from '../vehicle-settings/vehicle-settings.service';
import type { EffectivePolicy } from '../pricing/pricing.service';
import {
  ApproveBookingRequestDto,
  BOOKING_REQUEST_DEFAULT_LIMIT,
  BOOKING_REQUEST_MAX_LIMIT,
  BookingRequestDto,
  BookingRequestListQueryDto,
  BookingRequestPageMetaDto,
  BookingRequestPricingDto,
  BookingRequestReceiptDto,
  BUSY_DAYS_MAX_WINDOW,
  CreateBookingRequestDto,
  VehicleBusyDayDto,
  VehicleBusyDaysDto,
  VehicleBusyPeriodDto,
} from './dto/booking-request.dto';
import { paginationMeta, resolvePaging } from '../../common/pagination';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
  pickupAddressLine: true,
  pickupProvinceCode: true,
  pickupWardCode: true,
  pickupPlaceId: true,
  pickupLatitude: true,
  pickupLongitude: true,
  destination: true,
  destinationPlaceId: true,
  destinationLatitude: true,
  destinationLongitude: true,
  note: true,
  deliveryRequested: true,
  deliveryAddress: true,
  deliveryAddressLine: true,
  deliveryProvinceCode: true,
  deliveryWardCode: true,
  deliveryPlaceId: true,
  deliveryLatitude: true,
  deliveryLongitude: true,
  deliveryQuote: true,
  rejectReason: true,
  bookingId: true,
  tenantCustomerId: true,
  createdAt: true,
  respondBy: true,
  decidedAt: true,
  decisionSource: true,
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
    select: {
      name: true,
      plateNumber: true,
      code: true,
      vehicleType: true,
      mainImageUrl: true,
      // Bốn giá + khuyến mãi — CHỈ để ước TẠM TÍNH cho yêu cầu còn `pending_host_approval` chưa
      // từng có hold (`resolvePricing`). Không kéo `monthlyPrice`: dài hạn bị loại khỏi ước giá
      // ngay từ `resolvePricing` (chưa chốt lịch thì chưa có giá — ADR 0011), giống `trySecureHold`.
      weekdayPrice: true,
      weekendPrice: true,
      withDriverDailyPrice: true,
      withDriverInterCityPrice: true,
      withDriverOneWayPrice: true,
      discountPercent: true,
    },
  },
  customer: { select: { avatarUrl: true } },
  tenantCustomer: { select: { riskLevel: true } },
  /*
   * Tiền của yêu cầu (`resolvePricing`) — ĐÚNG một quan hệ 1-1 mỗi loại, cùng một truy vấn với
   * phần còn lại của inbox, không phải một lượt tra thêm sau khi có danh sách.
   */
  hold: { select: { amount: true, paidAmount: true, priceSnapshotJson: true } },
  booking: {
    select: { totalAmount: true, customerTotalAmount: true, paidAmount: true },
  },
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

/**
 * Đúng những trường `quoteFor` cần đọc — TÁCH khỏi `PendingRequestRow` để `list()` gọi được
 * hàm này thẳng từ hàng đã SELECT sẵn (không `loadPending` thêm một truy vấn mỗi hàng để ước
 * giá tạm tính). Kiểu hẹp hơn ⇒ mọi shape có đủ ngần này field đều truyền vào được, không cast.
 */
interface QuoteableRequest {
  vehicleId: string;
  serviceType: string;
  routeType: string | null;
  vehicle: {
    weekdayPrice: Prisma.Decimal | null;
    weekendPrice: Prisma.Decimal | null;
    withDriverDailyPrice: Prisma.Decimal | null;
    withDriverInterCityPrice: Prisma.Decimal | null;
    withDriverOneWayPrice: Prisma.Decimal | null;
    discountPercent: number | null;
  };
}

/**
 * Ai đang quyết định yêu cầu — người trong gian hàng bấm duyệt, hay HỆ THỐNG tự nhận theo thiết
 * lập của chủ xe (08/09/2026). Cùng một đường commit cho cả hai; khác nhau đúng ở người ký.
 */
interface DecisionActor {
  userId: string | null;
  source: BookingRequestDecisionSource;
}

/** Kết quả tự động nhận — để receipt nói đúng chuyện gì vừa xảy ra. */
interface AutoAcceptOutcome {
  status: string;
  bookingId: string | null;
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
    /** R3: tuyến hoa hồng duyệt xong sinh khoản giữ chỗ thay vì tạo đơn ngay (ADR 0028 điều 6). */
    private readonly holds: BookingHoldsService,
    /** Khung giờ giao nhận, điều khoản, tự động nhận chuyến theo xe (08/09/2026). */
    private readonly settings: VehicleSettingsService,
    /** Phase 6: chuyến này có thu cọc qua XePrime không, và vì sao (ADR 0032 điều 2). */
    private readonly depositPolicy: DepositPolicyService,
    /** Địa chỉ đón/giao xe có cấu trúc (14/09/2026) — kiểm danh mục + ghép chuỗi hiển thị. */
    private readonly address: AddressService,
  ) {}

  private readonly logger = new Logger(BookingRequestsService.name);

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
   * Lịch bận của một xe theo NGÀY LỊCH Việt Nam — để hộp chọn thời gian thuê khoá thẳng ngày
   * bận thay vì để khách chọn rồi mới báo lỗi ở bước sau.
   *
   * Hai mức, vì hai mức có ý nghĩa khác nhau với khách:
   *   - `fullyBusy`: bận trọn ngày → ngày đó không nhận cũng không trả xe được, lịch khoá luôn.
   *   - còn lại: bận vài giờ → vẫn nhận/trả được trong ngày, nhưng phải tránh các quãng trả về
   *     ở `periods` (FE tô màu riêng + ghi rõ giờ bận).
   *
   * Danh sách THƯA: chỉ ngày nào có lịch bận mới xuất hiện. Một cửa sổ 400 ngày của xe rảnh
   * trả về mảng rỗng, không phải 400 dòng `false`.
   *
   * ADR 0006: preview cho UX, KHÔNG phải bảo vệ — quyết định thật vẫn là constraint lúc ghi.
   */
  async listPublicBusyDays(
    vehicleId: string,
    from: string,
    to: string,
  ): Promise<VehicleBusyDaysDto> {
    const vehicle = await this.loadBookableVehicle(vehicleId);

    // Kẹp cửa sổ ở server: client gửi gì cũng không quét quá trần, và trả lại khoảng THỰC SỰ
    // đã dùng để FE biết phần ngoài trần là "chưa biết", không phải "chắc chắn rảnh".
    const startKey = from;
    const maxKey = addDateKeyDays(startKey, BUSY_DAYS_MAX_WINDOW - 1);
    const endKey = to < startKey ? startKey : to > maxKey ? maxKey : to;

    const windowStart = vnDayStart(startKey);
    const windowEnd = vnDayStart(addDateKeyDays(endKey, 1));

    const periods = await this.occupancy.listBusyPeriods(vehicle.id, windowStart, windowEnd);

    // Cắt mỗi quãng bận theo từng ngày VN nó phủ. Quãng không bao giờ chồng nhau (exclusion
    // constraint) nên gom theo ngày là đủ, không cần merge chống trùng.
    const byDay = new Map<string, VehicleBusyPeriodDto[]>();
    for (const p of periods) {
      const startMs = Math.max(p.startAt.getTime(), windowStart.getTime());
      const endMs = Math.min(p.endAt.getTime(), windowEnd.getTime());
      if (endMs <= startMs) continue;

      // Nửa mở `[start, end)`: kết thúc ĐÚNG nửa đêm thuộc ngày trước, không chạm ngày sau.
      let dayKey = vnDateKey(new Date(startMs));
      const lastKey = vnDateKey(new Date(endMs - 1));
      while (dayKey <= lastKey) {
        const dayStartMs = vnDayStart(dayKey).getTime();
        const dayEndMs = dayStartMs + MS_PER_DAY;
        const bucket = byDay.get(dayKey) ?? [];
        bucket.push({
          startAt: new Date(Math.max(startMs, dayStartMs)).toISOString(),
          endAt: new Date(Math.min(endMs, dayEndMs)).toISOString(),
        });
        byDay.set(dayKey, bucket);
        dayKey = addDateKeyDays(dayKey, 1);
      }
    }

    const days: VehicleBusyDayDto[] = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, list]) => {
        // Các quãng trong cùng một ngày rời nhau và đã cắt gọn trong ngày, nên tổng thời lượng
        // đúng bằng 24h ⇔ phủ kín ngày. Không cần dò từng khe.
        const covered = list.reduce(
          (sum, p) => sum + (Date.parse(p.endAt) - Date.parse(p.startAt)),
          0,
        );
        const fullyBusy = covered >= MS_PER_DAY;
        return {
          date,
          fullyBusy,
          // Ngày bận trọn thì `periods` là nhiễu — lịch khoá cả ngày, không có giờ nào để né.
          periods: fullyBusy
            ? []
            : [...list].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)),
        };
      });

    return { days, from: startKey, to: endKey };
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
    /**
     * Chữ mô tả địa điểm giao xe, đọc từ CẢ HAI ngả mà client có thể gửi.
     *
     * `deliveryAddress` là ô chữ tự do đời đầu; `deliveryAddressLine` là phần "số nhà, đường"
     * của địa chỉ có cấu trúc (ADR 0035), và đó là thứ DUY NHẤT web gửi từ khi ô địa chỉ được
     * tách thành mã tỉnh + mã xã + phần chi tiết. Bản trước chỉ kiểm ngả cũ, nên mọi yêu cầu
     * giao tận nơi từ web đều dừng ở đây với `VALIDATION_FAILED` — và thông báo thì nói rằng
     * khách chưa nhập địa chỉ, đúng lúc họ vừa nhập xong.
     *
     * App native gửi ngả nào cũng được chấp nhận, nên không bản nào bị bỏ lại.
     */
    const deliveryText = dto.deliveryAddress?.trim() || dto.deliveryAddressLine?.trim() || '';
    if (deliveryRequested) {
      if (!deliveryText) {
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
     * Phần CÓ CẤU TRÚC của hai địa chỉ vật lý trong yêu cầu (điểm đón, địa chỉ giao xe).
     *
     * Chạy TRƯỚC transaction: bên trong có thể có một lượt hỏi bản đồ, và giữ transaction mở
     * trong lúc chờ Internet là cách để một sự cố bên ngoài thành hàng đợi khoá bên trong.
     *
     * `resolveOptional` trả `null` khi client chưa gửi mã hành chính — khi đó chuỗi khách gõ
     * được giữ nguyên và bản ghi đơn giản là không có mã. Không chặn: một khách đặt xe từ bản
     * app cũ không được phép mất khả năng gửi yêu cầu vì hệ thống vừa có thêm một danh mục.
     */
    const pickupLocation = route.pickupAddress
      ? await this.address.resolveOptional(
          {
            provinceCode: dto.pickupProvinceCode,
            wardCode: dto.pickupWardCode,
            addressLine: dto.pickupAddressLine ?? route.pickupAddress,
            placeId: dto.pickupPlaceId,
            latitude: dto.pickupLatitude,
            longitude: dto.pickupLongitude,
          },
          { requireSelectable: false },
        )
      : null;

    const deliveryLocation = deliveryRequested
      ? await this.address.resolveOptional(
          {
            provinceCode: dto.deliveryProvinceCode,
            wardCode: dto.deliveryWardCode,
            addressLine: dto.deliveryAddressLine ?? dto.deliveryAddress,
            placeId: dto.deliveryPlaceId,
            latitude: dto.deliveryLatitude,
            longitude: dto.deliveryLongitude,
          },
          { requireSelectable: false },
        )
      : null;

    /*
     * Thiết lập THEO XE (08/09/2026) — kiểm ở SERVER, giao diện chỉ là preview:
     *   - giờ nhận/trả phải rơi vào khung giờ giao nhận chủ xe đặt (dài hạn: kiểm lúc duyệt);
     *   - thời lượng tối thiểu của chuyến có tài xế;
     *   - chủ xe bắt buộc đồng ý điều khoản thì payload phải tích.
     * Điều kiện tại thời điểm này được ĐÓNG BĂNG vào yêu cầu — chủ xe đổi sau không viết lại.
     */
    const setting = await this.settings.serviceSettingFor(
      this.prisma,
      vehicle.id,
      serviceType as ServiceType,
    );
    if (pickupAt) {
      await this.settings.assertHandoverWindows(this.prisma, vehicle.id, pickupAt, returnAt);
    }
    this.settings.assertServiceConstraints(setting, {
      pickupAt,
      returnAt,
      acceptedTerms: dto.acceptedTerms === true,
    });
    const rentalTerms = await this.settings.rentalTermsSnapshotFor(
      this.prisma,
      vehicle.id,
      serviceType,
      dto.acceptedTerms === true ? new Date() : null,
    );
    /*
     * Ứng viên tự động nhận: dịch vụ theo ngày và xe đang bật. Quyết định thật nằm ở
     * `tryAutoAccept` SAU khi yêu cầu đã tồn tại — ở đây chỉ để biết thông báo "có yêu cầu mới"
     * có nên đi ngay trong transaction ghi yêu cầu hay chờ xem hệ thống có nhận được không.
     */
    const autoCandidate = !longTerm && setting.autoAcceptEnabled;

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

    /*
     * CỔNG TÀI KHOẢN (15/09/2026) — đặt ở ĐÚNG đây, không sớm hơn và không muộn hơn.
     *
     * Muộn hơn thì đã có `booking_requests` hoặc đã cấp phiên. Sớm hơn thì chưa biết người đặt
     * là ai: khách vãng lai chỉ khai SĐT, và danh tính chỉ xuất hiện SAU
     * `resolveOrCreateUserByPhone` ngay trên. Vì `effectiveUserId` là điểm HỘI TỤ của cả hai
     * đường (đang đăng nhập / vừa khớp lại tài khoản bằng OTP), một cổng ở đây phủ cả hai —
     * gồm cả ca chủ gian hàng đăng xuất rồi đặt lại bằng chính số điện thoại của mình
     * (`users.phone` là unique nên OTP tìm lại đúng tài khoản đó).
     *
     * Nằm SAU cửa OTP cũng là chủ đích, cùng lý do với `assertNotBlocked` ở trên: người gửi phải
     * chứng minh sở hữu SĐT trước khi biết kết quả, nếu không đây thành một cách dò "số nào là
     * tài khoản gian hàng".
     */
    await this.assertCanBook(effectiveUserId, vehicle.tenantId);

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
            // Chuỗi hiển thị do SERVER ghép khi có mã hành chính — một địa chỉ chỉ có một cách
            // viết. Không có mã thì giữ nguyên chuỗi khách đã gõ.
            pickupAddress: pickupLocation?.displayAddress ?? route.pickupAddress,
            pickupAddressLine: pickupLocation?.addressLine ?? dto.pickupAddressLine?.trim() ?? null,
            pickupProvinceCode: pickupLocation?.provinceCode ?? null,
            pickupWardCode: pickupLocation?.wardCode ?? null,
            /*
             * Ghim của KHÁCH được giữ kể cả khi không quy được mã hành chính.
             *
             * `resolveOptional` trả `null` khi thiếu mã tỉnh, và trước đây điều đó kéo theo việc
             * VỨT luôn toạ độ khách đã tự xác nhận trên bản đồ. Toạ độ và mã hành chính là hai
             * đường độc lập (ADR 0035 điều 4): một ghim không có mã tỉnh vẫn là một ghim đúng, và
             * nó là thứ duy nhất phép tính quãng đường giao xe dùng tới (ADR 0018).
             */
            pickupPlaceId: pickupLocation?.placeId ?? dto.pickupPlaceId ?? null,
            pickupLatitude: pickupLocation?.latitude ?? dto.pickupLatitude ?? null,
            pickupLongitude: pickupLocation?.longitude ?? dto.pickupLongitude ?? null,
            destination: route.destination,
            // Điểm đến chỉ có ghim, không có mã hành chính — nó là một địa điểm, không phải
            // một địa chỉ giao nhận. Ghim chỉ lưu khi CÒN điểm đến (nội thành thì route đã
            // normalize điểm đến về null, và một cái ghim mồ côi là dữ liệu rác).
            destinationPlaceId: route.destination ? (dto.destinationPlaceId ?? null) : null,
            destinationLatitude: route.destination ? (dto.destinationLatitude ?? null) : null,
            destinationLongitude: route.destination ? (dto.destinationLongitude ?? null) : null,
            note: dto.note ?? null,
            deliveryRequested,
            /*
             * Chuỗi hiển thị do SERVER ghép khi có mã hành chính; không quy được tỉnh thì giữ
             * nguyên chữ khách đã gõ. `deliveryText` đã được kiểm không rỗng ở guard phía trên,
             * nên nhánh này không còn chỗ nào cần `!`.
             */
            deliveryAddress: deliveryRequested
              ? (deliveryLocation?.displayAddress ?? deliveryText)
              : null,
            deliveryAddressLine:
              deliveryLocation?.addressLine ?? dto.deliveryAddressLine?.trim() ?? null,
            deliveryProvinceCode: deliveryLocation?.provinceCode ?? null,
            deliveryWardCode: deliveryLocation?.wardCode ?? null,
            // Ghim của khách được giữ kể cả khi không quy được mã hành chính — xem điểm đón.
            deliveryPlaceId: deliveryLocation?.placeId ?? dto.deliveryPlaceId ?? null,
            deliveryLatitude: deliveryLocation?.latitude ?? dto.deliveryLatitude ?? null,
            deliveryLongitude: deliveryLocation?.longitude ?? dto.deliveryLongitude ?? null,
            /*
             * Hạn phản hồi do SERVER đặt, luôn luôn. DTO không có trường này nên client không
             * gửi được, và không có nhánh nào đọc một giá trị từ ngoài vào: một khách tự nới
             * hạn của mình sẽ biến lời hứa "60 phút" thành thứ vô nghĩa.
             *
             * Vẫn KHÔNG chiếm lịch xe ở bước này (ADR 0006) — đây mới là "chờ shop trả lời",
             * chưa phải một chỗ đã giữ.
             */
            respondBy: bookingRequestRespondBy(new Date()),
            rentalTerms: rentalTerms as unknown as Prisma.InputJsonValue,
          },
        });

        /*
         * Ứng viên tự động nhận thì KHÔNG báo "có yêu cầu mới cần duyệt" ở đây: nếu hệ thống nhận
         * được, người trực sẽ nhận một tin "đã tự nhận" chứ không phải hai tin trái ngược nhau;
         * nếu không nhận được, tin "yêu cầu mới" được gửi ngay sau đó (xem dưới).
         */
        if (!autoCandidate) {
          await this.notifications.emitToTenantMembers(
            vehicle.tenantId,
            submittedNotification(dto.customerName, vehicle.name, id),
            tx,
          );
        }
      });
    } catch (err) {
      // Partial unique index chống double-submit: cùng (xe, SĐT, giờ nhận, giờ trả) đang pending.
      // Đây là chốt chặn cho hai request CHẠY SONG SONG; kiểm ở trên lo phần định dạng khác nhau.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw duplicateRequest();
      }
      throw err;
    }

    /*
     * BA ĐƯỜNG, thử theo đúng thứ tự này (ADR 0039):
     *
     *   1. **Giữ chỗ trước** — chuyến có thu cọc và giá đã chốt: sinh hold, chiếm lịch, đưa QR
     *      cho khách NGAY. Chủ xe duyệt sau khi tiền về. Đây là đường mặc định của cả sàn.
     *   2. **Tự nhận** — chuyến KHÔNG thu cọc (dài hạn, báo giá tạm tính, chính sách tắt) mà xe
     *      bật "Đặt ngay": tạo đơn luôn như trước.
     *   3. **Chờ duyệt tay** — còn lại.
     *
     * Đường 1 KHÔNG bắn thông báo cho gian hàng: chỗ này chưa chắc chắn, và một thông báo cho
     * mỗi lượt bấm đặt sẽ biến hộp thư của gian hàng thành nơi không ai đọc nữa. Họ được gọi
     * khi tiền đã về — lúc đó mới có việc để làm.
     */
    let auto: AutoAcceptOutcome | null = await this.trySecureHold(vehicle.tenantId, id);
    const secured = auto != null;
    if (!auto && autoCandidate) {
      auto = await this.tryAutoAccept(vehicle.tenantId, id);
    }
    if (!auto && !secured) {
      // Không giữ chỗ trước được và cũng không tự nhận được → về luồng duyệt tay.
      await this.notifications.emitToTenantMembers(
        vehicle.tenantId,
        submittedNotification(dto.customerName, vehicle.name, id),
      );
    }

    return {
      receipt: {
        id,
        status: auto?.status ?? BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
        authenticated: true,
        autoAccepted: auto != null,
        bookingId: auto?.bookingId ?? null,
      },
      loginUserId,
    };
  }

  /**
   * HỆ THỐNG tự nhận một yêu cầu vừa gửi — cùng đường duyệt với gian hàng (`commitDecision`),
   * chỉ khác người ký. Mọi điều kiện kiểm ở đây; điều kiện nào không đạt thì yêu cầu ở lại
   * `pending_host_approval` cho chủ xe — KHÔNG bao giờ tự từ chối khách.
   *
   * Lịch bận và tài xế trùng KHÔNG kiểm bằng SELECT trước: constraint DB quyết định lúc ghi
   * (ADR 0006), và mọi lỗi lúc commit đều rơi về chờ duyệt tay. Trả `null` = không nhận.
   */
  private async tryAutoAccept(tenantId: string, id: string): Promise<AutoAcceptOutcome | null> {
    try {
      const req = await this.loadPending(tenantId, id);
      if (req.serviceType === SERVICE_TYPE.LONG_TERM) return null;
      const [setting, windows, policy] = await Promise.all([
        this.settings.serviceSettingFor(this.prisma, req.vehicleId, req.serviceType as ServiceType),
        this.settings.handoverWindowsFor(this.prisma, req.vehicleId),
        this.pricing.effectivePolicy(tenantId, req.vehicleId),
      ]);
      const schedule = this.resolveApprovalSchedule(req, {});
      const breakdown = await this.quoteFor(req, schedule, policy);
      /*
       * Chính sách cọc giải MỘT lần ở đây rồi đi cùng quyết định tới cuối (Phase 6). Tự nhận
       * chuyến đi qua ĐÚNG đường của duyệt tay: gian hàng tuyến gói tắt công tắc thì cả hai
       * đường đều tạo đơn ngay, và cả hai đều đóng băng cùng một `deposit_collection_mode`.
       */
      const deposit = await this.depositPolicy.resolveForTenant(tenantId);
      if (!deposit.billingMode) {
        await this.recordAutoAcceptSkip(
          tenantId,
          id,
          AUTO_ACCEPT_BLOCKER.BILLING_NOT_CONFIGURED,
        );
        return null;
      }
      const fees = await this.pricing.customerFeesFor(
        tenantId,
        breakdown.totalAmount,
        breakdown.estimateNote != null,
        { depositRequired: deposit.required },
      );
      const terms = req.rentalTerms as unknown as RentalTermsSnapshot | null;
      const blocker = this.settings.evaluateAutoAccept(setting, windows, {
        serviceType: req.serviceType,
        pickupAt: schedule.pickupAt,
        returnAt: schedule.returnAt,
        quoteIsEstimate: breakdown.estimateNote != null,
        holdRequired: Boolean(fees?.holdAmount),
        termsAccepted: !setting.requireTermsAcceptance || terms?.termsAcceptedAt != null,
      });
      if (blocker) {
        await this.recordAutoAcceptSkip(tenantId, id, blocker);
        return null;
      }

      let driverId: string | null = null;
      if (req.serviceType === SERVICE_TYPE.WITH_DRIVER) {
        const driver = await this.settings.pickAssignableDriver(this.prisma, tenantId, {
          pickupAt: schedule.pickupAt,
          returnAt: schedule.returnAt,
        });
        if (!driver) {
          await this.recordAutoAcceptSkip(tenantId, id, AUTO_ACCEPT_BLOCKER.NO_DRIVER);
          return null;
        }
        driverId = driver.id;
      }

      const snapshot = this.pricing.buildSnapshot(breakdown, policy, fees);
      const row = await this.commitDecision(
        tenantId,
        { userId: null, source: BOOKING_REQUEST_DECISION_SOURCE.SYSTEM },
        id,
        req,
        schedule,
        snapshot,
        fees,
        deposit,
        { driverId },
      );
      return { status: row.status, bookingId: row.bookingId };
    } catch (err) {
      /*
       * Trùng lịch (23P01 của xe hoặc tài xế), yêu cầu vừa hết hạn, khách vừa bị chặn… — tất cả
       * là "hệ thống không nhận được", không phải lỗi của khách. Yêu cầu đã tồn tại và ở lại
       * hàng chờ duyệt; ghi log để vận hành thấy vì sao.
       */
      this.logger.warn(
        `Tự động nhận yêu cầu ${id} thất bại — rơi về chờ duyệt tay: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * GIỮ CHỖ NGAY LÚC GỬI YÊU CẦU — đường mặc định từ ADR 0039.
   *
   * Thứ tự cũ (chủ xe duyệt → mới phát QR) có một lỗ nghiệp vụ mà ADR 0039 sinh ra để vá: khách
   * bấm đặt xong không có việc gì để làm và không có gì bảo đảm, còn chỗ xe thì chưa ai giữ —
   * nên hai người có thể cùng "đặt" một chiếc xe rồi một người bị loại sau hàng giờ chờ đợi.
   *
   * Nay: tính giá, sinh hold `pending`, CHIẾM LỊCH, và trả về mã `XPH…` để khách quét ngay.
   * Chủ xe duyệt SAU khi tiền về (`BookingHoldsService.settleFullPaymentWithinTx`).
   *
   * Trả `null` = chuyến này không cọc trước được, và caller rơi về đường cũ. Ba lý do, tất cả
   * đều là "chưa có SỐ TIỀN nào chốt được để in lên QR":
   *
   *   1. **Thuê dài hạn** — khách mới chỉ nêu nguyện vọng ngày nhận, gian hàng chốt lịch lúc
   *      duyệt (ADR 0011). Chưa có lịch thì chưa có giá.
   *   2. **Báo giá còn tạm tính** (`estimateNote != null`) — CLAUDE.md cấm thu phần trăm trên
   *      một con số chưa chốt.
   *   3. **Chính sách không thu cọc** cho gian hàng này, hoặc chưa xác định được tuyến thu phí.
   *
   * KHÔNG bắn thông báo cho gian hàng ở đây: chỗ này chưa chắc chắn và có thể biến mất sau
   * `HOLD_TOTAL_WINDOW_MINUTES`. Gian hàng được gọi khi tiền đã về — lúc đó mới có việc để làm.
   */
  private async trySecureHold(
    tenantId: string,
    id: string,
  ): Promise<AutoAcceptOutcome | null> {
    try {
      const req = await this.loadPending(tenantId, id);
      // (1) Dài hạn: chưa có lịch chốt ⇒ chưa có giá ⇒ không có gì để in lên QR.
      if (req.serviceType === SERVICE_TYPE.LONG_TERM) return null;

      const policy = await this.pricing.effectivePolicy(tenantId, req.vehicleId);
      const schedule = this.resolveApprovalSchedule(req, {});
      const breakdown = await this.quoteFor(req, schedule, policy);
      // (2) Giá còn tạm tính — không thu % trên một con số chưa chốt.
      if (breakdown.estimateNote != null) return null;

      const deposit = await this.depositPolicy.resolveForTenant(tenantId);
      // (3) Chưa xác định được tuyến ⇒ không đoán tiền của khách. Chủ xe duyệt tay, và
      // `approve` sẽ ném `TENANT_BILLING_NOT_CONFIGURED` để lỗi cấu hình lộ ra đúng chỗ.
      if (!deposit.billingMode) return null;

      const fees = await this.pricing.customerFeesFor(tenantId, breakdown.totalAmount, false, {
        depositRequired: deposit.required,
      });
      if (!fees?.holdAmount) return null;

      const snapshot = this.pricing.buildSnapshot(breakdown, policy, fees);

      /*
       * MỘT mốc cho cả hai cửa sổ tiền. Từ ADR 0039 nó là lúc khách GỬI YÊU CẦU, không phải lúc
       * chủ xe duyệt — vì đây mới là lúc khách cam kết và là lúc đồng hồ của họ bắt đầu chạy.
       */
      const anchorAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        await this.holds.createForApprovedRequestWithinTx(tx, {
          tenantId,
          requestId: id,
          vehicleId: req.vehicleId,
          vehicleName: req.vehicle.name,
          customerUserId: req.customerUserId,
          schedule: {
            pickupAt: schedule.pickupAt,
            returnAt: schedule.returnAt,
            packageMonths: schedule.packageMonths,
          },
          snapshot,
          acceptedAt: anchorAt,
          actorUserId: null,
        });

        /*
         * Chiếm yêu cầu SAU khi hold đã tồn tại và lịch đã bị chiếm — cùng thứ tự với
         * `commitDecision`. Đảo lại thì một lượt tạo hold hỏng (trùng lịch) sẽ để lại một yêu
         * cầu `awaiting_hold` không có hold nào, tức là một chuyến chờ tiền mà không có mã.
         */
        await this.claimPending(tx, tenantId, id, {
          status: BOOKING_REQUEST_STATUS.AWAITING_HOLD,
          pickupAt: schedule.pickupAt,
          returnAt: schedule.returnAt,
          longTermPackageMonths: schedule.packageMonths,
          // KHÔNG có `decidedBy`/`decidedAt`: chưa ai quyết định gì cả. Khách mới trả tiền giữ
          // chỗ, còn quyết định nhận chuyến vẫn đang ở phía trước.
          decisionSource: null,
        });

        await this.audit.record(
          {
            tenantId,
            actorUserId: req.customerUserId,
            actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
            action: 'booking_request.hold_requested',
            targetType: 'booking_request',
            targetId: id,
            after: { holdAmount: fees.holdAmount, anchorAt: anchorAt.toISOString() },
          },
          tx,
        );
      });

      return { status: BOOKING_REQUEST_STATUS.AWAITING_HOLD, bookingId: null };
    } catch (err) {
      /*
       * Trùng lịch (23P01), yêu cầu vừa hết hạn, giờ nhận quá sát để kịp chuyển khoản… — tất cả
       * là "không giữ chỗ trước được", không phải lỗi của khách. Yêu cầu vẫn tồn tại và ở lại
       * hàng chờ duyệt tay; ghi log để vận hành thấy vì sao.
       */
      this.logger.warn(
        `Không giữ chỗ trước được cho yêu cầu ${id} — rơi về chờ duyệt tay: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /** Dấu vết "hệ thống đã cân nhắc và bỏ qua" — chủ xe đọc được vì sao chuyến không tự nhận. */
  private async recordAutoAcceptSkip(
    tenantId: string,
    id: string,
    blocker: AutoAcceptBlocker,
  ): Promise<void> {
    await this.audit.record({
      tenantId,
      actorUserId: null,
      actorScope: AUDIT_ACTOR_SCOPE.SYSTEM,
      action: 'booking_request.auto_accept_skipped',
      targetType: 'booking_request',
      targetId: id,
      after: { blocker },
    });
  }

  /**
   * Bảng kê giá của một yêu cầu THEO NGÀY (tự lái / có tài xế) — MỘT hàm cho cả duyệt tay lẫn
   * tự động nhận, nên hai đường không thể tính ra hai con số.
   */
  private async quoteFor(
    req: QuoteableRequest,
    schedule: ApprovalSchedule,
    policy: EffectivePolicy | null,
  ) {
    return this.pricing.buildDailyQuote({
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
  }

  /**
   * Tiền của MỘT yêu cầu cho inbox gian hàng — `BookingRequestPricingDto`, xem docblock ở DTO.
   *
   * BA nhánh, THEO ĐÚNG THỨ TỰ đóng băng (ADR 0024 — không bao giờ tính lại một con số đã chốt):
   *
   *  1. Đã tạo đơn ⇒ cột phẳng trên `Booking` (`row.booking`) — nguồn DUY NHẤT, bất kể đơn đi
   *     qua đường có hold hay không.
   *  2. Có hold (`row.hold`) — kể cả yêu cầu đã huỷ/từ chối/hết hạn SAU khi đã cọc — đọc
   *     snapshot đóng băng lúc hold sinh ra, không đọc lại policy hôm nay.
   *  3. Còn lại: CHỈ khi vẫn `pending_host_approval` và có đủ lịch (tự lái/có tài xế — dài hạn bỏ
   *     qua, cùng lý do `trySecureHold` bỏ qua) mới ước TẠM TÍNH, bằng ĐÚNG máy giá `approve()`
   *     dùng. Yêu cầu đã chết (từ chối/huỷ/hết hạn) mà CHƯA TỪNG có hold thì không có gì để tính
   *     lại — trả `null`, không đoán một con số theo chính sách của hôm nay cho một việc đã qua.
   *
   * Bounded theo trang: chỉ nhánh (3) gọi thêm dịch vụ giá, và chỉ cho hàng `pending_host_approval`
   * trong ĐÚNG trang đang xem (`limit` tối đa `BOOKING_REQUEST_MAX_LIMIT`) — không quét toàn bảng.
   */
  private async resolvePricing(
    tenantId: string,
    r: BookingRequestRow,
  ): Promise<BookingRequestPricingDto | null> {
    if (r.booking) {
      const rentalTotal = r.booking.totalAmount.toFixed(0);
      const customerTotalAmount = (r.booking.customerTotalAmount ?? r.booking.totalAmount).toFixed(
        0,
      );
      const paidAmount = r.booking.paidAmount.toFixed(0);
      return {
        isEstimate: false,
        rentalTotal,
        customerTotalAmount,
        paidAmount,
        // Chỉ có ý nghĩa khi đơn thật sự có phụ phí (billingMode khác null) — đơn ngoài luồng
        // chợ (ADR 0028 điều 9) không có "phần trả tay" tách biệt để nói.
        remainingAmount: r.booking.customerTotalAmount
          ? subtractMoney(customerTotalAmount, paidAmount)
          : null,
      };
    }

    if (r.hold) {
      const snapshot = r.hold.priceSnapshotJson as unknown as BookingPriceSnapshot;
      const rentalTotal = snapshot.totalAmount;
      return {
        isEstimate: false,
        rentalTotal,
        customerTotalAmount: snapshot.fees?.customerTotalAmount ?? rentalTotal,
        paidAmount: r.hold.paidAmount.toFixed(0),
        remainingAmount: snapshot.fees?.payAtPickupAmount ?? null,
      };
    }

    if (
      r.status !== BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL ||
      r.serviceType === SERVICE_TYPE.LONG_TERM ||
      !r.pickupAt ||
      !r.returnAt
    ) {
      return null;
    }

    try {
      const policy = await this.pricing.effectivePolicy(tenantId, r.vehicleId);
      const schedule: ApprovalSchedule = {
        pickupAt: r.pickupAt,
        returnAt: r.returnAt,
        packageMonths: null,
      };
      const breakdown = await this.quoteFor(r, schedule, policy);
      const fees = await this.pricing.customerFeesFor(
        tenantId,
        breakdown.totalAmount,
        breakdown.estimateNote != null,
      );
      return {
        isEstimate: true,
        rentalTotal: breakdown.totalAmount,
        customerTotalAmount: fees?.customerTotalAmount ?? breakdown.totalAmount,
        paidAmount: null,
        remainingAmount: null,
      };
    } catch (err) {
      // Không sập cả trang inbox vì MỘT yêu cầu không ước được giá — thiếu tiền trên một thẻ còn
      // hơn thiếu cả danh sách (cùng kỷ luật `trySecureHold`/`autoAccept`).
      this.logger.warn(
        `Không ước được giá tạm tính cho yêu cầu ${r.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
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
  /**
   * Tài khoản này gửi được yêu cầu thuê cho chiếc xe này không (ADR 0032 điều 1).
   *
   * Hai luật, giải bằng hàm thuần `resolveBookingBlock` để web/app nói cùng một câu:
   *
   *   • thành viên hoạt động của một gian hàng TUYẾN GÓI ⇒ không đặt xe (bên bán không mua)
   *   • bất kỳ ai ⇒ không đặt xe của CHÍNH gian hàng mình (hai vai trên một booking)
   *
   * Chủ xe tuyến HOA HỒNG không bị chặn: họ là cá nhân dùng Owner Lite và vẫn thuê xe của người
   * khác như mọi người dùng.
   *
   * Tuyến của từng tenant giải bằng `resolveEffectiveBilling` — KHÔNG đọc `tenants.tenant_type`
   * (ADR 0014 điều 2) và không suy từ `planCode`. Một truy vấn duy nhất lấy cả membership lẫn
   * dòng thuê bao hiệu lực, cùng khuôn với `TenantScopeGuard`.
   */
  private async assertCanBook(userId: string | null, vehicleTenantId: string): Promise<void> {
    if (!userId) return;

    const now = new Date();
    const memberships = await this.prisma.tenantMembership.findMany({
      where: {
        userId,
        status: MEMBERSHIP_STATUS.ACTIVE,
        tenant: { deletedAt: null },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        tenantId: true,
        tenant: {
          select: {
            name: true,
            subscriptions: {
              where: effectiveSubscriptionWhere(now),
              ...EFFECTIVE_SUBSCRIPTION_ARGS,
            },
          },
        },
      },
    });
    if (memberships.length === 0) return;

    const block = resolveBookingBlock({
      vehicleTenantId,
      memberships: memberships.map((m) => ({
        tenantId: m.tenantId,
        tenantName: m.tenant.name,
        billingMode: resolveEffectiveBilling(m.tenant.subscriptions[0] ?? null, now).billingMode,
      })),
    });
    if (!block) return;

    if (block.reason === BOOKING_BLOCK_REASON.OWN_TENANT_VEHICLE) {
      throw new ConflictException({
        code: API_ERROR_CODE.CANNOT_BOOK_OWN_VEHICLE,
        message: 'Đây là xe của chính gian hàng bạn — không đặt thuê được.',
        details: { tenantId: block.tenantId },
      });
    }

    throw new ForbiddenException({
      code: API_ERROR_CODE.SHOP_ACCOUNT_CANNOT_BOOK,
      message:
        `Bạn đang dùng tài khoản của gian hàng ${block.tenantName ?? ''}`.trim() +
        '. Để thuê xe, hãy đăng nhập bằng một tài khoản khách thuê với số điện thoại khác.',
      details: { tenantId: block.tenantId, tenantName: block.tenantName },
    });
  }

  /**
   * Người quyết định không được là người gửi yêu cầu — cổng THỨ HAI, độc lập với `assertCanBook`.
   *
   * Vì sao cần cả hai: `assertCanBook` chặn lúc TẠO, nhưng dữ liệu có trước 15/09/2026 có thể đã
   * chứa yêu cầu tự đặt, và chúng không được phép đi tiếp thành đơn. Một cổng ở lúc tạo không
   * dọn được quá khứ.
   */
  private assertNotOwnRequest(customerUserId: string | null, actorUserId: string | null): void {
    if (!customerUserId || !actorUserId || customerUserId !== actorUserId) return;
    throw new ConflictException({
      code: API_ERROR_CODE.CANNOT_DECIDE_OWN_REQUEST,
      message: 'Bạn không thể tự duyệt hoặc tự từ chối yêu cầu do chính mình gửi.',
    });
  }

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
    const paging = resolvePaging(query, BOOKING_REQUEST_DEFAULT_LIMIT, BOOKING_REQUEST_MAX_LIMIT);

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
      ...(query.status?.length ? { status: { in: query.status } } : {}),
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
        skip: paging.skip,
        take: paging.take,
        select: SELECT,
      }),
      countByStatus,
    ]);

    const counted = new Map(grouped.map((g) => [g.status, g._count]));

    /*
     * Tiền gắn SAU khi đã có trang — `resolvePricing` chỉ gọi thêm dịch vụ giá cho hàng
     * `pending_host_approval` (nhánh 3 của nó), nên chi phí bị CHẶN TRẦN bởi `limit` của trang
     * này, không phải toàn bảng. `Promise.all` vì các hàng độc lập nhau.
     */
    const data = await Promise.all(
      rows.map(async (row) => ({ ...toDto(row), pricing: await this.resolvePricing(tenantId, row) })),
    );

    return {
      data,
      meta: {
        ...paginationMeta(paging, total),
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
    return { ...toDto(row), pricing: await this.resolvePricing(tenantId, row) };
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
    /*
     * ĐÃ CỌC RỒI thì duyệt là một việc KHÁC HẲN (ADR 0039): giá đã đóng băng lúc sinh hold,
     * tiền đã nằm ở XePrime, lịch đã bị chiếm. Không tính lại gì cả — chỉ mở đơn từ snapshot đã
     * chốt. Đi tiếp xuống dưới sẽ báo giá lần thứ hai và đóng băng một con số khác với con số
     * khách đã trả.
     */
    if (await this.isAwaitingAcceptAfterHold(tenantId, id)) {
      return this.acceptPaidRequest(tenantId, userId, id, dto);
    }
    const req = await this.loadPending(tenantId, id);

    // Người quyết định KHÔNG được là người gửi — cổng thứ hai, dọn cả dữ liệu tự đặt có từ trước.
    this.assertNotOwnRequest(req.customerUserId, userId);

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
     *
     * Dài hạn: giờ nhận do gian hàng vừa chốt phải rơi vào khung giờ giao xe của chính chiếc xe
     * (08/09/2026) — khách không có lịch để kiểm lúc gửi, nên kiểm ở đây.
     */
    if (req.serviceType === SERVICE_TYPE.LONG_TERM) {
      await this.settings.assertHandoverWindows(this.prisma, req.vehicleId, schedule.pickupAt, null);
    }
    const breakdown =
      req.serviceType === SERVICE_TYPE.LONG_TERM
        ? this.pricing.buildLongTermPackageQuote({
            monthlyPrice: req.vehicle.monthlyPrice?.toFixed(0) ?? null,
            packageMonths: schedule.packageMonths!,
            policy,
            delivery: null,
          })
        : await this.quoteFor(req, schedule, policy);
    /*
     * PHỤ PHÍ PHÍA KHÁCH (ADR 0029) — tính bằng chính sách hiệu lực và chế độ thu phí của gian
     * hàng, rồi ĐÓNG BĂNG vào snapshot (ADR 0024). Báo giá còn tạm tính (`estimateNote`) thì
     * `holdAmount` là null: không thu % trên một con số chưa chốt.
     */
    const deposit = await this.depositPolicy.resolveForTenant(tenantId);
    /*
     * CỔNG TIỀN của đường duyệt tay (15/09/2026).
     *
     * Duyệt là lúc giá, phí và chính sách bị ĐÓNG BĂNG vào đơn và không sửa được nữa (ADR 0024).
     * Nếu không biết tenant thuộc tuyến nào thì mọi con số đóng băng ở đây đều là đoán — nên
     * dừng hẳn, với một mã lỗi nói rõ phải sửa cấu hình, thay vì tạo một đơn `S = 0` không ai
     * phát hiện ra cho tới lúc đối soát.
     */
    if (!deposit.billingMode) {
      throw new ConflictException({
        code: API_ERROR_CODE.TENANT_BILLING_NOT_CONFIGURED,
        message:
          'Gian hàng chưa có gói dịch vụ hiệu lực nên chưa xác định được cách tính phí. ' +
          'Liên hệ hỗ trợ XePrime trước khi duyệt đơn mới.',
        details: { reason: deposit.reason },
      });
    }
    const fees = await this.pricing.customerFeesFor(
      tenantId,
      breakdown.totalAmount,
      breakdown.estimateNote != null,
      { depositRequired: deposit.required },
    );
    const snapshot = this.pricing.buildSnapshot(breakdown, policy, fees);

    const row = await this.commitDecision(
      tenantId,
      { userId, source: BOOKING_REQUEST_DECISION_SOURCE.HOST },
      id,
      req,
      schedule,
      snapshot,
      fees,
      deposit,
      {},
    );
    return toDto(row);
  }

  /**
   * ĐƯỜNG DUYỆT DUY NHẤT — gian hàng bấm duyệt và hệ thống tự nhận đều đi qua đây (08/09/2026),
   * nên giá, snapshot, giữ chỗ, chiếm quyền quyết định, audit và thông báo chỉ có MỘT bản.
   *
   * HAI nhánh, tách theo việc chuyến này có khoản giữ chỗ hay không:
   *  - CÓ (tuyến hoa hồng, giá đã chốt) → sinh `booking_holds`, yêu cầu sang `awaiting_hold`,
   *    CHIẾM LỊCH ngay. Đơn thuê chỉ ra đời khi tiền về (webhook / khớp tay).
   *  - KHÔNG (tuyến gói, hoặc báo giá tạm tính, hoặc chưa có chính sách phí) → tạo đơn ngay.
   *
   * `opts.driverId`: tài xế hệ thống chọn khi tự nhận chuyến có tài xế — gán TRONG transaction
   * tạo đơn để `bookings_driver_schedule_excl` gác; duyệt tay không dùng (gán sau ở đơn).
   */
  private async commitDecision(
    tenantId: string,
    actor: DecisionActor,
    id: string,
    req: PendingRequestRow,
    schedule: ApprovalSchedule,
    snapshot: BookingPriceSnapshot,
    fees: CustomerFeeBreakdown | null,
    deposit: DepositPolicyResolution,
    opts: { driverId?: string | null },
  ): Promise<BookingRequestRow> {
    if (fees?.holdAmount) {
      return this.approveWithHold(tenantId, actor, id, req, schedule, snapshot, fees.holdAmount);
    }
    const isSystem = actor.source === BOOKING_REQUEST_DECISION_SOURCE.SYSTEM;

    /*
     * ĐÓNG BĂNG "ai thu cọc" lúc tạo đơn — ADR 0025 ràng buộc 4. Một đơn đang tranh chấp phải
     * đọc lại được lý do của CHÍNH NÓ, không phải trạng thái công tắc của hôm nay.
     *
     * Tới được nhánh này nghĩa là KHÔNG có hold, và hai lý do dẫn tới đó khác hẳn nhau:
     *
     *   - `deposit.required === false` → chính sách cọc bị TẮT cho gian hàng này (tuyến gói tắt
     *     công tắc, hoặc gói không còn cờ `escrow_hold`). Khoản cọc vẫn tồn tại trong thoả thuận
     *     giữa hai bên, chỉ là XePrime không thu hộ và không đối soát nó ⇒ `direct`
     *     (ADR 0028 điều 9).
     *
     *   - `deposit.required === true` mà vẫn không có hold → không có SỐ TIỀN nào để thu: báo
     *     giá còn tạm tính lúc duyệt (không lấy % của một con số chưa chốt), hoặc chưa có chính
     *     sách phí hiệu lực ⇒ `none`. Ghi `direct` ở đây là nói với khách rằng gian hàng sẽ liên
     *     hệ thu một khoản mà không ai từng tính ra.
     */
    const depositCollectionMode = deposit.required
      ? DEPOSIT_COLLECTION_MODE.NONE
      : DEPOSIT_COLLECTION_MODE.DIRECT;

    return this.prisma.$transaction(async (tx) => {
      const booking = await this.bookings.createWithinTx(
        tx,
        tenantId,
        actor.userId,
        {
          vehicleId: req.vehicleId,
          customerName: req.customerName,
          customerPhone: req.customerPhone,
          // Lịch CHỐT: dịch vụ theo ngày giữ nguyên lịch khách chọn; dài hạn lấy giờ nhận gian
          // hàng vừa chốt và giờ trả do SERVER tính từ gói (client không gửi được ngày trả).
          pickupAt: schedule.pickupAt.toISOString(),
          returnAt: schedule.returnAt.toISOString(),
          longTermPackageMonths: schedule.packageMonths ?? undefined,
          serviceType: req.serviceType,
          // Hành trình đi cùng đơn: lộ trình/địa chỉ đón/điểm đến của yêu cầu with_driver copy
          // nguyên sang Booking — chi tiết đơn, phân công tài xế, chuyến của khách và hợp đồng
          // đều nhìn thấy, không phải quay lại yêu cầu gốc.
          routeType: req.routeType ?? undefined,
          pickupAddress: req.pickupAddress ?? undefined,
          // Địa chỉ đón đi nguyên cả cụm sang đơn — mã hành chính, phần chi tiết và ghim. Copy
          // mỗi chuỗi hiển thị là để đơn mất khả năng lọc theo khu vực và mất điểm tính khoảng
          // cách, trong khi yêu cầu gốc vẫn có đủ.
          pickupProvinceCode: req.pickupProvinceCode ?? undefined,
          pickupWardCode: req.pickupWardCode ?? undefined,
          pickupAddressLine: req.pickupAddressLine ?? undefined,
          pickupPlaceId: req.pickupPlaceId ?? undefined,
          pickupLatitude: req.pickupLatitude == null ? undefined : Number(req.pickupLatitude),
          pickupLongitude: req.pickupLongitude == null ? undefined : Number(req.pickupLongitude),
          destination: req.destination ?? undefined,
          destinationPlaceId: req.destinationPlaceId ?? undefined,
          destinationLatitude:
            req.destinationLatitude == null ? undefined : Number(req.destinationLatitude),
          destinationLongitude:
            req.destinationLongitude == null ? undefined : Number(req.destinationLongitude),
          baseAmount: rowAmount(snapshot.rows, 'base'),
          discountAmount: rowAmountAbs(snapshot.rows, 'discount'),
          deliveryFee: rowAmount(snapshot.rows, 'delivery'),
          depositAmount: snapshot.depositAmount,
        },
        'from_request',
        snapshot,
        // Sổ khách (S-01): COPY nguyên id đã gắn trên yêu cầu, không tra lại theo SĐT — SĐT trên
        // hồ sơ có thể đã được sửa sau lúc khách gửi, và tra lại sẽ đẻ ra một khách thứ hai.
        // Yêu cầu LEGACY (trước migration) không có id thì `createWithinTx` tự tìm-hoặc-tạo.
        req.tenantCustomerId,
        {
          driverId: opts.driverId ?? null,
          // Điều kiện thuê đã đóng băng lúc khách gửi — đi nguyên sang đơn.
          rentalTerms: (req.rentalTerms as unknown as RentalTermsSnapshot | null) ?? null,
          depositCollectionMode,
        },
      );

      /*
       * Chiếm quyền quyết định SAU khi đơn đã được tạo, không phải trước.
       *
       * Thứ tự này quan trọng: nếu worker vừa expire yêu cầu ở mili-giây trước, `claimPending`
       * ném lỗi và cả transaction quay đầu — đơn vừa tạo cùng bản ghi giữ lịch của nó biến mất
       * sạch. Đảo thứ tự lại (chiếm trước, tạo đơn sau) cũng đúng về mặt đua, nhưng khi ấy một
       * đơn tạo hỏng sẽ để lại một yêu cầu đã đánh dấu `converted_to_booking` mà không có đơn
       * nào — trạng thái không tồn tại trong nghiệp vụ.
       */
      await this.claimPending(tx, tenantId, id, {
        status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        bookingId: booking.id,
        // Yêu cầu dài hạn được sinh ra KHÔNG có lịch; sau khi duyệt nó phải giữ chính lịch
        // đã chốt để inbox/lịch sử đọc được mà không phải join sang đơn.
        pickupAt: schedule.pickupAt,
        returnAt: schedule.returnAt,
        longTermPackageMonths: schedule.packageMonths,
        decidedBy: actor.userId,
        decidedAt: new Date(),
        decisionSource: actor.source,
      });

      const updated = await tx.bookingRequest.findFirstOrThrow({
        where: { id, tenantId },
        select: SELECT,
      });

      await this.audit.record(
        {
          tenantId,
          actorUserId: actor.userId,
          actorScope: isSystem ? AUDIT_ACTOR_SCOPE.SYSTEM : AUDIT_ACTOR_SCOPE.TENANT,
          action: isSystem ? 'booking_request.auto_accept' : 'booking_request.approve',
          targetType: 'booking_request',
          targetId: id,
          after: { bookingId: booking.id, ...(opts.driverId ? { driverId: opts.driverId } : {}) },
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
            title: isSystem ? 'Yêu cầu thuê đã được xác nhận ngay' : 'Yêu cầu thuê đã được duyệt',
            body: `${req.vehicle.name} · đã tạo đơn thuê`,
            tenantId,
            targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
            targetId: booking.id,
          },
          tx,
        );
      }
      // Người trực nhận MỘT tin "đã tự nhận" — không phải "yêu cầu mới" rồi "đã duyệt".
      if (isSystem) {
        await this.notifications.emitToTenantMembers(
          tenantId,
          {
            type: NOTIFICATION_TYPE.BOOKING_AUTO_ACCEPTED,
            title: `Đã tự động nhận chuyến: ${req.customerName}`,
            body: `${req.vehicle.name} · đơn ${booking.code}`,
            targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
            targetId: booking.id,
          },
          tx,
        );
      }

      return updated;
    });
  }

  /**
   * Duyệt yêu cầu ở tuyến CÓ GIỮ CHỖ: chốt lịch + sinh hold, KHÔNG tạo đơn.
   *
   * Thứ tự trong transaction giống hệt nhánh tạo đơn: chiếm quyền quyết định SAU khi hold đã
   * tạo — worker expire chen vào giữa thì cả transaction quay đầu, không để lại hold mồ côi.
   */
  private async approveWithHold(
    tenantId: string,
    actor: DecisionActor,
    id: string,
    req: PendingRequestRow,
    schedule: ApprovalSchedule,
    snapshot: BookingPriceSnapshot,
    holdAmount: string,
  ): Promise<BookingRequestRow> {
    const isSystem = actor.source === BOOKING_REQUEST_DECISION_SOURCE.SYSTEM;
    /*
     * MỘT mốc "đặt xe thành công" cho cả ba thứ: `decided_at` của yêu cầu, hạn trả cọc và mốc
     * huỷ miễn phí (ADR 0032 điều 2). Gọi `new Date()` hai lần trong cùng transaction sinh ra
     * hai mốc lệch nhau vài mili-giây — đủ để màn hình đếm ngược và bản ghi audit nói hai con
     * số khác nhau về cùng một chuyến.
     */
    const acceptedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      await this.holds.createForApprovedRequestWithinTx(tx, {
        tenantId,
        requestId: id,
        vehicleId: req.vehicleId,
        vehicleName: req.vehicle.name,
        customerUserId: req.customerUserId,
        schedule: {
          pickupAt: schedule.pickupAt,
          returnAt: schedule.returnAt,
          packageMonths: schedule.packageMonths,
        },
        snapshot,
        acceptedAt,
        actorUserId: actor.userId,
      });

      await this.claimPending(tx, tenantId, id, {
        status: BOOKING_REQUEST_STATUS.AWAITING_HOLD,
        pickupAt: schedule.pickupAt,
        returnAt: schedule.returnAt,
        longTermPackageMonths: schedule.packageMonths,
        decidedBy: actor.userId,
        decidedAt: acceptedAt,
        decisionSource: actor.source,
      });

      const updated = await tx.bookingRequest.findFirstOrThrow({
        where: { id, tenantId },
        select: SELECT,
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId: actor.userId,
          actorScope: isSystem ? AUDIT_ACTOR_SCOPE.SYSTEM : AUDIT_ACTOR_SCOPE.TENANT,
          action: isSystem
            ? 'booking_request.auto_accept_await_hold'
            : 'booking_request.approve_await_hold',
          targetType: 'booking_request',
          targetId: id,
          after: { holdAmount },
        },
        tx,
      );
      if (isSystem) {
        await this.notifications.emitToTenantMembers(
          tenantId,
          {
            type: NOTIFICATION_TYPE.BOOKING_AUTO_ACCEPTED,
            title: `Đã tự động nhận chuyến: ${req.customerName}`,
            body: `${req.vehicle.name} · chờ khách chuyển giữ chỗ`,
            targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
            targetId: id,
          },
          tx,
        );
      }
      return updated;
    });
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
    // Từ chối một yêu cầu ĐÃ CỌC phải hoàn tiền — không dùng chung đường với yêu cầu suông.
    if (await this.isAwaitingAcceptAfterHold(tenantId, id)) {
      return this.rejectPaidRequest(tenantId, userId, id, reason);
    }
    const req = await this.loadPending(tenantId, id);
    // Từ chối yêu cầu của chính mình cũng là tự quyết định — cùng cổng với `approve`.
    this.assertNotOwnRequest(req.customerUserId, userId);

    const row = await this.prisma.$transaction(async (tx) => {
      // Cùng cửa chiếm quyền với `approve`: từ chối một yêu cầu đã quá hạn cũng sai như duyệt
      // nó — khách đã nhận tin "gian hàng không phản hồi" và đang đi tìm xe khác.
      await this.claimPending(tx, tenantId, id, {
        status: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
        rejectReason: reason ?? null,
        decidedBy: userId,
        decidedAt: new Date(),
        decisionSource: BOOKING_REQUEST_DECISION_SOURCE.HOST,
      });

      const updated = await tx.bookingRequest.findFirstOrThrow({
        where: { id, tenantId },
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

  /**
   * Nạp yêu cầu CÒN xử lý được: đang chờ duyệt **và** chưa quá hạn phản hồi.
   *
   * Hai điều kiện, hai mã lỗi khác nhau có chủ đích. Trạng thái `expired` do worker ghi theo
   * nhịp, nên luôn tồn tại một cửa sổ mà `respond_by` đã trôi qua nhưng cột `status` vẫn còn
   * `pending_host_approval`. Nếu chỉ nhìn `status` thì cửa sổ đó là một lỗ để duyệt một yêu cầu
   * đã chết — và tệ hơn, khách đã được báo là gian hàng không phản hồi.
   *
   * Đây vẫn chỉ là cửa ĐỌC TRƯỚC để báo lỗi cho đúng. Chốt chặn thật nằm ở lệnh `updateMany`
   * có điều kiện của `approve`/`reject`: giữa lúc đọc và lúc ghi, worker vẫn có thể chen vào.
   */
  /** Yêu cầu này đang ở chặng "khách đã trả giữ chỗ, chờ gian hàng nhận" chưa. */
  private async isAwaitingAcceptAfterHold(tenantId: string, id: string): Promise<boolean> {
    const row = await this.prisma.bookingRequest.findFirst({
      where: { id, tenantId },
      select: { status: true },
    });
    if (!row) throw notFound();
    return row.status === BOOKING_REQUEST_STATUS.HOLD_PAID;
  }

  /**
   * GIAN HÀNG NHẬN một chuyến khách đã trả giữ chỗ ⇒ đơn thuê ra đời (ADR 0039 điều 4).
   *
   * Không báo giá lại, không đọc chính sách phí, không đụng `deposit_collection_mode`: mọi con
   * số đã đóng băng trên hold lúc khách bấm đặt, và khách đã trả đúng con số đó. Tính lại ở đây
   * là mở đường cho một đơn có giá khác với số tiền đã thu.
   *
   * `scheduledPickupAt` bị từ chối: lịch cũng đã chốt: dời nó sau khi khách trả tiền là đổi
   * hàng sau khi đã bán.
   */
  private async acceptPaidRequest(
    tenantId: string,
    userId: string,
    id: string,
    dto: ApproveBookingRequestDto,
  ): Promise<BookingRequestDto> {
    if (dto.scheduledPickupAt) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Chuyến đã được khách giữ chỗ — không đổi được giờ nhận khi duyệt',
      });
    }
    const req = await this.prisma.bookingRequest.findFirstOrThrow({
      where: { id, tenantId },
      select: { customerUserId: true, customerPhone: true },
    });
    this.assertNotOwnRequest(req.customerUserId, userId);
    await this.customers.assertNotBlocked(tenantId, req.customerPhone, 'internal');

    const row = await this.prisma.$transaction(async (tx) => {
      /*
       * Ghi `decided_*` TRƯỚC khi mở đơn: `convertPaidHoldWithinTx` đọc `decided_by` để biết
       * ai là người tạo đơn. Đảo thứ tự thì đơn ra đời không có người chịu trách nhiệm.
       */
      const claimed = await tx.bookingRequest.updateMany({
        where: { id, tenantId, status: BOOKING_REQUEST_STATUS.HOLD_PAID },
        data: {
          decidedBy: userId,
          decidedAt: new Date(),
          decisionSource: BOOKING_REQUEST_DECISION_SOURCE.HOST,
        },
      });
      // 0 dòng = hệ thống vừa tự nhận, hoặc worker vừa hoàn vì quá hạn phản hồi.
      if (claimed.count === 0) throw requestExpired();

      await this.holds.convertPaidHoldWithinTx(tx, id, tenantId, {
        actorUserId: userId,
        actorScope: AUDIT_ACTOR_SCOPE.TENANT,
      });

      return tx.bookingRequest.findFirstOrThrow({ where: { id, tenantId }, select: SELECT });
    });
    return toDto(row);
  }

  /**
   * GIAN HÀNG TỪ CHỐI một chuyến khách đã trả giữ chỗ ⇒ hoàn đủ, nhả chỗ (ADR 0039 điều 5).
   *
   * Khách không có lỗi gì ở đây, nên hoàn **toàn bộ** — không chia đôi, không giữ phí dịch vụ.
   */
  private async rejectPaidRequest(
    tenantId: string,
    userId: string,
    id: string,
    reason?: string,
  ): Promise<BookingRequestDto> {
    const req = await this.prisma.bookingRequest.findFirstOrThrow({
      where: { id, tenantId },
      select: { customerUserId: true },
    });
    this.assertNotOwnRequest(req.customerUserId, userId);

    const row = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.bookingRequest.updateMany({
        where: { id, tenantId, status: BOOKING_REQUEST_STATUS.HOLD_PAID },
        data: {
          status: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
          rejectReason: reason ?? null,
          decidedBy: userId,
          decidedAt: new Date(),
          decisionSource: BOOKING_REQUEST_DECISION_SOURCE.HOST,
        },
      });
      if (claimed.count === 0) throw requestExpired();

      await this.holds.releasePaidHoldWithinTx(tx, {
        requestId: id,
        tenantId,
        reason: 'owner_reject',
        actorUserId: userId,
        actorScope: AUDIT_ACTOR_SCOPE.TENANT,
      });

      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: AUDIT_ACTOR_SCOPE.TENANT,
          action: 'booking_request.reject_paid',
          targetType: 'booking_request',
          targetId: id,
          after: { reason: reason ?? null },
        },
        tx,
      );

      return tx.bookingRequest.findFirstOrThrow({ where: { id, tenantId }, select: SELECT });
    });
    return toDto(row);
  }

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
    if (isBookingRequestPastDue(req.respondBy)) throw requestExpired();
    return req;
  }

  /**
   * Chiếm quyền quyết định một yêu cầu — lệnh ghi DUY NHẤT được phép đổi trạng thái một yêu
   * cầu đang chờ, dùng chung cho duyệt và từ chối.
   *
   * `updateMany` với điều kiện `status = pending AND respond_by > now` là chỗ cuộc đua kết
   * thúc: worker expire và nhân viên bấm duyệt cùng lúc thì đúng MỘT bên khớp điều kiện, bên
   * kia nhận `count = 0`. Không có `SELECT … FOR UPDATE`, không có khoá ở tầng ứng dụng — điều
   * kiện nằm ngay trong câu `UPDATE`, nên không có khe hở nào giữa đọc và ghi.
   *
   * `count = 0` được dịch thành "quá hạn": trong luồng này chỉ có hai kẻ chen ngang khả dĩ —
   * worker (quá hạn) hoặc một nhân viên khác vừa quyết định xong — và cả hai đều được `loadPending`
   * gạn trước đó vài mili-giây. Câu "hết giờ, gọi cho khách" đúng cho cả hai.
   */
  private async claimPending(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
    // `Unchecked…` chứ không phải `…UpdateManyMutationInput`: bản kia loại hết cột khoá ngoại
    // ra khỏi kiểu, mà `bookingId` — thứ duyệt phải ghi — chính là một trong số đó.
    data: Prisma.BookingRequestUncheckedUpdateManyInput,
  ): Promise<void> {
    const claimed = await tx.bookingRequest.updateMany({
      where: {
        id,
        tenantId,
        status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
        respondBy: { gt: new Date() },
      },
      data,
    });
    if (claimed.count === 0) throw requestExpired();
  }
}

/** Cột cần để duyệt/từ chối một yêu cầu — gồm nguyện vọng dài hạn và giá của xe. */
const PENDING_SELECT = {
  id: true,
  status: true,
  respondBy: true,
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
  pickupAddressLine: true,
  pickupProvinceCode: true,
  pickupWardCode: true,
  pickupPlaceId: true,
  pickupLatitude: true,
  pickupLongitude: true,
  destination: true,
  destinationPlaceId: true,
  destinationLatitude: true,
  destinationLongitude: true,
  deliveryRequested: true,
  deliveryQuote: true,
  /// Điều kiện thuê đã đóng băng lúc khách gửi — copy sang đơn khi duyệt (08/09/2026).
  rentalTerms: true,
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
    pickupLocation: addressViewOf({
      displayAddress: r.pickupAddress,
      addressLine: r.pickupAddressLine,
      provinceCode: r.pickupProvinceCode,
      wardCode: r.pickupWardCode,
      placeId: r.pickupPlaceId,
      latitude: r.pickupLatitude,
      longitude: r.pickupLongitude,
    }),
    destination: r.destination,
    destinationPin: pinOf(r.destinationLatitude, r.destinationLongitude, r.destinationPlaceId),
    note: r.note,
    deliveryRequested: r.deliveryRequested,
    deliveryAddress: r.deliveryAddress,
    deliveryLocation: addressViewOf({
      displayAddress: r.deliveryAddress,
      addressLine: r.deliveryAddressLine,
      provinceCode: r.deliveryProvinceCode,
      wardCode: r.deliveryWardCode,
      placeId: r.deliveryPlaceId,
      latitude: r.deliveryLatitude,
      longitude: r.deliveryLongitude,
    }),
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
    respondBy: r.respondBy as unknown as string,
    decidedAt: (r.decidedAt as unknown as string | null) ?? null,
    decisionSource: r.decisionSource ?? null,
  };
}

/** Tin "có yêu cầu mới" cho người trực — MỘT bản cho cả hai nhánh (ghi ngay / sau khi tự nhận hụt). */
function submittedNotification(customerName: string, vehicleName: string, requestId: string) {
  return {
    type: NOTIFICATION_TYPE.BOOKING_REQUEST_SUBMITTED,
    title: `Yêu cầu thuê mới: ${customerName}`,
    body: vehicleName,
    targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
    targetId: requestId,
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

/**
 * Hết hạn phản hồi — MỘT câu cho cả hai lớp (đọc trước và `updateMany` có điều kiện).
 *
 * Cố ý KHÔNG dùng `INVALID_STATUS_TRANSITION`: cột `status` trong DB có thể vẫn còn
 * `pending_host_approval` khi câu này được ném, nên "yêu cầu đã được xử lý" là một câu sai.
 */
function requestExpired(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.BOOKING_REQUEST_EXPIRED,
    message: 'Yêu cầu đã quá hạn phản hồi 60 phút — hãy liên hệ lại với khách',
  });
}

/** MỘT câu cho cả hai lớp chặn trùng (kiểm trước và ràng buộc DB) — client chỉ thấy một mã lỗi. */
function duplicateRequest(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.BOOKING_REQUEST_DUPLICATE,
    message: 'Bạn vừa gửi một yêu cầu giống hệt cho xe này — vui lòng chờ shop phản hồi',
  });
}
