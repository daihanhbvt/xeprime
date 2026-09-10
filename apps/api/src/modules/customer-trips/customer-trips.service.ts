import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  BOOKING_REQUEST_STATUS,
  BOOKING_REQUEST_STATUS_VALUES,
  BOOKING_STATUS,
  BOOKING_STATUS_VALUES,
  CUSTOMER_TRIP_FILTER,
  CUSTOMER_TRIP_FILTER_DEFAULT,
  CUSTOMER_TRIP_FILTER_STAGES,
  CUSTOMER_TRIP_FILTER_VALUES,
  HANDOVER_PHOTO_SLOT_VALUES,
  HANDOVER_STATUS,
  HANDOVER_TYPE,
  MEMBERSHIP_STATUS,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  PAYMENT_KIND,
  PAYMENT_STATUS,
  PRIVATE_FILE_PURPOSE,
  TENANT_ROLE,
  TRIP_ROLE,
  canCustomerCancelTrip,
  customerTripStage,
  handoverOccurredAt,
  isCustomerTripFilter,
  isHandoverPhotoAddedAfterConfirmation,
  type BookingRequestStatus,
  type BookingStatus,
  type CustomerTripFilter,
  type CustomerTripStage,
  type HandoverPhotoSlot,
  type HandoverType,
  type PaginationMeta,
  type TripRole,
} from '@xeprime/types';
import { fromDateOnly } from '../../common/date-only';
import { currentSubscriptionWhere } from '../../common/plan/feature-state';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BookingsService } from '../bookings/bookings.service';
import { BookingHoldsService } from '../holds/booking-holds.service';
import { NotificationService } from '../notification/notification.service';
import { PricingService } from '../pricing/pricing.service';
import { SettlementService } from '../bookings/settlement/settlement.service';
import { SourceContractDownloadDto } from '../vehicles/dto/vehicle-source.dto';
import { VehicleContractsService } from '../vehicles/vehicle-contracts.service';
import {
  CustomerTripHandoverEvidenceDto,
  CustomerTripHandoverEvidencePhotoDto,
} from './dto/customer-trip-evidence.dto';
import {
  CUSTOMER_TRIP_DEFAULT_LIMIT,
  CUSTOMER_TRIP_MAX_LIMIT,
  CustomerTripCountsDto,
  CustomerTripDetailDto,
  CustomerTripEstimateDto,
  CustomerTripFinanceDto,
  CustomerTripListItemDto,
  CustomerTripListQueryDto,
  CustomerTripPageDto,
} from './dto/customer-trip.dto';
import { paginationMeta, resolvePaging } from '../../common/pagination';

const ZERO = new Prisma.Decimal(0);

/**
 * Người đang xem "Chuyến của tôi", và HAI phía họ có thể đứng.
 *
 * `hostTenantId` chỉ khác null khi người này là **chủ** một gian hàng đang hoạt động. Quản lý và
 * nhân viên KHÔNG có mặt ở đây có chủ đích: họ vận hành đội xe ở `/manage`, còn màn này là
 * "chuyến của TÔI" — của một con người, không phải của một chỗ làm.
 */
interface TripViewerScope {
  readonly userId: string;
  readonly hostTenantId: string | null;
  /**
   * Gian hàng THUÊ BAO được liên hệ khách ngay từ lúc có yêu cầu (ADR 0028 điều 9 — họ đã trả
   * cước và được phép chốt trực tiếp). Tuyến hoa hồng thì không: xem `canContactOn`.
   */
  readonly hostSubscribed: boolean;
}

/**
 * Vòng đời một chuyến ĐỨNG TỪ PHÍA KHÁCH — chỉ đọc.
 *
 * Ba ranh giới đóng đinh ở service này:
 *
 *  - **Không có nguồn sự thật thứ hai.** Đơn/yêu cầu/phát sinh/cọc/hoàn cọc vẫn do các module
 *    của chủ xe sở hữu; ở đây chỉ CHIẾU chúng sang cái khách được thấy. Phép tính quyết toán
 *    mượn nguyên `SettlementService` (Wave 10) để hai bên không bao giờ đọc ra hai số khác nhau.
 *  - **Quyền sở hữu nằm trong WHERE, không nằm trong một câu `if`.** Mọi truy vấn đều buộc
 *    `bookingRequest.customerUserId = người đang đăng nhập`, nên chuyến của người khác đơn giản
 *    là không tồn tại: 404, không phải 403 — 403 chính là câu trả lời "có tồn tại đấy".
 *  - **DTO là hàng rào lộ dữ liệu.** Ghi chú nội bộ của shop, ảnh bàn giao, số KM, tên nhân
 *    viên ghi phiếu, `rowVersion`… không có đường nào đi ra ngoài từ đây.
 *
 * Định danh chuyến là id **yêu cầu thuê**: nó có từ lúc khách bấm gửi, sớm hơn đơn thuê. Nhưng
 * thông báo cũ trỏ vào id ĐƠN, nên `detail()` nhận cả hai — cùng một chuyến, hai cách gọi tên.
 */
@Injectable()
export class CustomerTripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlement: SettlementService,
    /** Báo giá TẠM TÍNH cho yêu cầu chưa duyệt — cùng phép tính với lúc duyệt (ADR 0029). */
    private readonly pricing: PricingService,
    private readonly bookings: BookingsService,
    /** R3: huỷ khi đang chờ chuyển giữ chỗ phải nhả lịch + đóng hold. */
    private readonly holds: BookingHoldsService,
    /**
     * Lõi phát signed URL của kho riêng tư (Wave 4.1) — mượn, không dựng lại. Nó đã khoá sẵn
     * điều kiện tenant + xe + mục đích + trạng thái `ready` trong CHÍNH câu truy vấn, nên một
     * đường phát URL thứ hai ở đây chỉ là cơ hội để quên mất một trong bốn điều kiện đó.
     */
    private readonly files: VehicleContractsService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  async list(
    viewerUserId: string,
    query: CustomerTripListQueryDto,
  ): Promise<CustomerTripPageDto> {
    const paging = resolvePaging(query, CUSTOMER_TRIP_DEFAULT_LIMIT, CUSTOMER_TRIP_MAX_LIMIT);
    const filter: CustomerTripFilter = isCustomerTripFilter(query.filter)
      ? query.filter
      : CUSTOMER_TRIP_FILTER_DEFAULT;

    const scope = await this.resolveScope(viewerUserId);
    const where = this.whereFor(scope, filter);

    const [total, rows, counts] = await Promise.all([
      this.prisma.bookingRequest.count({ where }),
      this.prisma.bookingRequest.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: LIST_SELECT,
      }),
      this.counts(scope),
    ]);

    const [surchargeTotals, estimates] = await Promise.all([
      this.surchargeTotals(rows.map((row) => row.bookingId)),
      this.estimateQuotes(rows),
    ]);

    const meta: PaginationMeta = paginationMeta(paging, total);
    return {
      data: rows.map((row) => toListItem(row, surchargeTotals, scope, estimates)),
      meta,
      counts,
    };
  }

  /**
   * Người xem là ai, và họ có phải chủ một gian hàng không.
   *
   * MỘT truy vấn cho cả hai câu hỏi: vai chủ gian hàng và gói hiện hành của gian hàng đó. Gói
   * quyết định đúng một chuyện ở màn này — được liên hệ khách trước khi duyệt hay không.
   */
  private async resolveScope(userId: string): Promise<TripViewerScope> {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        userId,
        status: MEMBERSHIP_STATUS.ACTIVE,
        roleKey: TENANT_ROLE.SHOP_OWNER,
      },
      select: {
        tenantId: true,
        tenant: {
          select: {
            subscriptions: {
              where: currentSubscriptionWhere(new Date()),
              take: 1,
              select: { id: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      userId,
      hostTenantId: membership?.tenantId ?? null,
      hostSubscribed: (membership?.tenant.subscriptions.length ?? 0) > 0,
    };
  }

  /**
   * Tổng TẠM TÍNH cho những dòng CHƯA có đơn — số tiền khách sẽ phải trả nếu chuyến đi tiếp.
   *
   * Chỉ chạy cho dòng chưa có đơn: có đơn rồi thì giá đã đóng băng ở đó (ADR 0024) và đọc lại
   * chính sách là mở đường cho hai màn hiện hai con số.
   *
   * Chi phí: vài truy vấn nhẹ cho MỖI dòng chưa có đơn, chạy song song, tối đa bằng cỡ trang
   * (10). Chấp nhận được vì yêu cầu chờ duyệt hết hạn nhanh nên số dòng như vậy luôn nhỏ.
   * Muốn về 0 truy vấn thì phải LƯU báo giá lúc khách gửi yêu cầu — việc đó cần một cột mới
   * và không giúp gì cho dữ liệu đã có, nên chưa làm.
   */
  private async estimateQuotes(
    rows: Prisma.BookingRequestGetPayload<{ select: typeof LIST_SELECT }>[],
  ): Promise<Map<string, TripEstimate>> {
    const pending = rows.filter((row) => row.booking === null);
    if (pending.length === 0) return new Map();

    const quotes = await Promise.all(
      pending.map(async (row) => {
        const quote = await this.pricing.estimateQuote({
          tenantId: row.tenantId,
          vehicleId: row.vehicle.id,
          serviceType: row.serviceType,
          routeType: row.routeType,
          pickupAt: row.pickupAt,
          returnAt: row.returnAt,
          longTermPackageMonths: row.longTermPackageMonths,
          vehicle: row.vehicle,
        });
        return [row.id, quote] as const;
      }),
    );

    return new Map(
      quotes.filter((entry): entry is readonly [string, TripEstimate] => entry[1] !== null),
    );
  }

  /**
   * Tổng phát sinh còn hiệu lực của MỘT TRANG đơn — một truy vấn `groupBy` cho cả trang, không
   * phải một lần gọi quyết toán cho mỗi dòng (N+1).
   *
   * Tồn tại để `totalAmount` ở danh sách bằng đúng `finalTotal` ở chi tiết. Trước Wave 11.1 danh
   * sách đọc thẳng `bookings.total_amount` — con số CỐ Ý không gồm phát sinh (Wave 10) — nên một
   * chuyến có phụ phí hiện hai số `Tổng thanh toán` khác nhau ở hai màn.
   */
  private async surchargeTotals(
    bookingIds: (string | null)[],
  ): Promise<Map<string, Prisma.Decimal>> {
    const ids = bookingIds.filter((id): id is string => id !== null);
    if (ids.length === 0) return new Map();

    const rows = await this.prisma.bookingSurcharge.groupBy({
      by: ['bookingId'],
      // Cùng điều kiện với `SettlementService.moneySnapshot` — khoản đã huỷ mềm không tính.
      where: { bookingId: { in: ids }, voidedAt: null },
      _sum: { amount: true },
    });

    return new Map(rows.map((row) => [row.bookingId, row._sum.amount ?? ZERO]));
  }

  /**
   * Một chuyến. `id` là id yêu cầu HOẶC id đơn — thông báo của Wave 5/9/10 trỏ vào cả hai loại,
   * và bắt khách phải biết mình đang cầm loại id nào là một yêu cầu vô lý.
   */
  async detail(viewerUserId: string, id: string): Promise<CustomerTripDetailDto> {
    const scope = await this.resolveScope(viewerUserId);
    const row = await this.prisma.bookingRequest.findFirst({
      where: {
        // Quyền sở hữu nằm TRONG truy vấn, cả hai phía: chuyến tôi đi thuê, hoặc chuyến trên xe
        // của gian hàng tôi làm chủ. Không phải của tôi ⇒ đơn giản là không tồn tại.
        AND: [scopeWhere(scope), { OR: [{ id }, { bookingId: id }] }],
      },
      select: DETAIL_SELECT,
    });
    if (!row) throw tripNotFound();

    const booking = row.booking;
    const [surcharges, estimates] = await Promise.all([
      this.surchargeTotals([row.bookingId]),
      this.estimateQuotes([row]),
    ]);
    const base = toListItem(row, surcharges, scope, estimates);

    return {
      ...base,
      customerNote: row.note,
      rejectReason: row.rejectReason,
      actualPickupAt: booking?.actualPickupAt?.toISOString() ?? null,
      actualReturnAt: booking?.actualReturnAt?.toISOString() ?? null,
      finance: booking ? await this.finance(booking) : null,
      /*
       * Loại trừ với `finance`: có đơn thì tiền đã đóng băng ở đó. Chưa có đơn thì trưng bảng
       * kê tạm tính — khách vừa xem đúng những dòng này trước khi bấm gửi yêu cầu.
       */
      estimate: booking ? null : toEstimate(estimates.get(row.id)),
      /*
       * Khoản giữ chỗ là tiền của KHÁCH, nên chỉ khách nhìn thấy nó — service tự khoá thêm một
       * lần theo `customerUserId`. Chủ xe xem cùng chuyến này thì `null`: cọc và tiền thuê giữa
       * hai bên không đi qua nền tảng ở tuyến cơ bản (ADR 0028 điều 7A), và bày một ô tiền mà
       * họ không thu được là mời họ hiểu nhầm rằng nền tảng đang giữ hộ.
       */
      hold:
        base.role === TRIP_ROLE.RENTER
          ? await this.holds.findForTrip(row.id, viewerUserId)
          : null,
      review: booking?.review
        ? {
            id: booking.review.id,
            rating: booking.review.rating,
            comment: booking.review.comment,
            createdAt: booking.review.createdAt.toISOString(),
          }
        : null,
    };
  }

  /**
   * Khách tự huỷ chuyến — đường GHI duy nhất của module này.
   *
   * Hai trường hợp, hai bảng khác nhau, cố ý không gộp:
   *
   *  - **Chưa được duyệt** (chưa có đơn): đổi chính yêu cầu sang `cancelled_by_customer`. Yêu
   *    cầu chờ duyệt KHÔNG chiếm lịch (ADR 0006) nên không có gì để nhả.
   *  - **Đã duyệt, chưa giao xe**: huỷ ĐƠN qua `BookingsService.transitionWithinTx` — nơi đã
   *    giữ sẵn luật chuyển trạng thái, nhả `vehicle_occupancies`, audit và báo cho gian hàng.
   *    Trạng thái yêu cầu giữ nguyên `converted_to_booking`: nó là lịch sử có thật, và tab
   *    "Đã huỷ" đã bắt chuyến này qua trạng thái ĐƠN rồi.
   *
   * Đã giao xe thì không huỷ được — xe đang ở ngoài đường, việc cần làm là gọi chủ xe.
   *
   * Chống đua ở cả hai nhánh bằng điều kiện trạng thái trong WHERE, không phải bằng câu `if`
   * đọc trước: gian hàng bấm duyệt đúng lúc khách bấm huỷ là chuyện có thật.
   */
  async cancel(customerUserId: string, id: string): Promise<CustomerTripDetailDto> {
    const row = await this.prisma.bookingRequest.findFirst({
      where: { customerUserId, OR: [{ id }, { bookingId: id }] },
      select: {
        id: true,
        tenantId: true,
        status: true,
        vehicle: { select: { name: true } },
        booking: { select: { id: true, code: true, tenantId: true, status: true } },
      },
    });
    if (!row) throw tripNotFound();

    const stage = customerTripStage({
      requestStatus: row.status as BookingRequestStatus,
      bookingStatus: (row.booking?.status as BookingStatus | undefined) ?? null,
    });
    if (!canCustomerCancelTrip(stage)) throw cancelNotAllowed(stage);

    const booking = row.booking;
    if (booking) {
      await this.prisma.$transaction(async (tx) => {
        await this.bookings.transitionWithinTx(
          tx,
          booking.tenantId,
          booking.id,
          customerUserId,
          booking.status as BookingStatus,
          BOOKING_STATUS.CANCELLED,
          // Khách thao tác, không phải nhân viên gian hàng — audit phải phân biệt được.
          { actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER },
        );
      });
      return this.detail(customerUserId, id);
    }

    /*
     * Hai trạng thái huỷ được mà chưa có đơn: `pending_host_approval` (chưa ai duyệt) và
     * `awaiting_hold` (đã duyệt, đang chờ khách chuyển giữ chỗ — R3). Cái sau CHIẾM LỊCH nên
     * huỷ phải nhả chỗ và đóng hold; cái trước không giữ gì cả.
     */
    const cancellable: string[] = [
      BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
      BOOKING_REQUEST_STATUS.AWAITING_HOLD,
    ];
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.bookingRequest.updateMany({
        where: { id: row.id, status: { in: cancellable } },
        data: { status: BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER },
      });
      if (claimed.count > 0 && row.status === BOOKING_REQUEST_STATUS.AWAITING_HOLD) {
        await this.holds.cancelForRequestWithinTx(tx, {
          requestId: row.id,
          tenantId: row.tenantId,
          actorUserId: customerUserId,
          actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
        });
      }
      // 0 dòng = gian hàng vừa duyệt/từ chối xen vào giữa. Không ghi đè quyết định của họ.
      if (claimed.count === 0) throw cancelNotAllowed(stage);

      await this.audit.record(
        {
          tenantId: row.tenantId,
          actorUserId: customerUserId,
          actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
          action: 'booking_request.cancel',
          targetType: 'booking_request',
          targetId: row.id,
          before: { status: row.status },
          after: { status: BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER },
        },
        tx,
      );

      // Hộp thư yêu cầu của gian hàng phải biết ngay là không còn gì để bấm.
      await this.notifications.emitToTenantMembers(
        row.tenantId,
        {
          type: NOTIFICATION_TYPE.BOOKING_REQUEST_CANCELLED,
          title: 'Khách đã huỷ yêu cầu thuê',
          body: row.vehicle.name,
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
          targetId: row.id,
        },
        tx,
      );
    });

    return this.detail(customerUserId, id);
  }

  // ── Bằng chứng bàn giao ───────────────────────────────────────────────────

  /**
   * Biên bản giao / nhận lại xe của CHÍNH chuyến này — chỉ đọc.
   *
   * Ba lằn ranh:
   *
   *  - **Chỉ biên bản ĐÃ XÁC NHẬN.** Nháp và "chờ xác nhận" chưa có hiệu lực nghiệp vụ nào
   *    (KM chưa vào hồ sơ xe, đơn chưa đổi trạng thái) nên trưng chúng ra là mời khách đối
   *    chiếu với thứ gian hàng còn đang gõ dở; bản đã huỷ thì không còn là hồ sơ của chuyến
   *    nào. Vì thế biên bản giao xe xuất hiện đúng lúc shop bấm xác nhận giao, biên bản nhận
   *    lại xuất hiện đúng lúc shop bấm xác nhận nhận — không sớm hơn một giây nào.
   *  - **Quyền sở hữu nằm trong WHERE.** `requireTrip` buộc chuyến thuộc người đang đăng
   *    nhập, rồi mọi truy vấn sau đó khoá theo `bookingId` + `tenantId` lấy TỪ chuyến đó.
   *    Đoán được id biên bản của người khác cũng không có đường nào đi vào đây.
   *  - **DTO là hàng rào.** Ghi chú nội bộ, tên người xác nhận, id file riêng tư không có mặt
   *    trong `CustomerTripHandoverEvidenceDto` — xem chú thích ở chính DTO đó.
   *
   * Không phân trang: mỗi chuyến tối đa HAI biên bản, mỗi biên bản tối đa `HANDOVER_MAX_PHOTOS`
   * ảnh. Trần đó là ràng buộc nghiệp vụ có sẵn, không phải may rủi.
   */
  async handoverEvidence(
    customerUserId: string,
    id: string,
  ): Promise<CustomerTripHandoverEvidenceDto[]> {
    const trip = await this.requireTrip(customerUserId, id);
    // Yêu cầu chưa được duyệt thì chưa có đơn, chưa có chuyến để mà bàn giao. Rỗng, không lỗi.
    if (!trip.bookingId || !trip.tenantId) return [];

    const rows = await this.prisma.vehicleHandover.findMany({
      where: {
        bookingId: trip.bookingId,
        tenantId: trip.tenantId,
        status: HANDOVER_STATUS.CONFIRMED,
      },
      select: EVIDENCE_SELECT,
    });

    // Thứ tự KỂ CHUYỆN, không phải thứ tự ghi vào bảng: giao xe trước, nhận lại sau.
    return EVIDENCE_ORDER.flatMap((type) => {
      const row = rows.find((candidate) => candidate.type === type);
      return row ? [toEvidence(row)] : [];
    });
  }

  /**
   * URL ký ngắn hạn cho MỘT ảnh hiện trạng, mở theo GÓC CHỤP.
   *
   * Khoá là `(chuyến của tôi, chiều bàn giao, góc chụp)` — đúng bộ ba khách nhìn thấy trên màn
   * hình — chứ KHÔNG phải `fileId`. Nhờ vậy không định danh file nào rời khỏi server, và không
   * tham số nào cầm đi thử ở chuyến khác được: đổi `:id` sang chuyến của người khác thì
   * `requireTrip` đã trả 404 trước khi có gì được ký.
   *
   * Ảnh vắng mặt và ảnh của chuyến người khác trả CÙNG một lỗi 404 — phân biệt hai cái đó là
   * cách lịch sự để xác nhận "có tấm ảnh đó đấy, chỉ là không phải của bạn".
   */
  async handoverEvidencePhotoUrl(
    customerUserId: string,
    id: string,
    type: HandoverType,
    slot: HandoverPhotoSlot,
  ): Promise<SourceContractDownloadDto> {
    const trip = await this.requireTrip(customerUserId, id);
    if (!trip.bookingId || !trip.tenantId) throw evidencePhotoNotFound();

    const handover = await this.prisma.vehicleHandover.findFirst({
      where: {
        bookingId: trip.bookingId,
        tenantId: trip.tenantId,
        type,
        status: HANDOVER_STATUS.CONFIRMED,
      },
      select: {
        tenantId: true,
        vehicleId: true,
        // `@@unique([handoverId, slot])` — một góc chụp đúng một ảnh, nên đây luôn 0 hoặc 1.
        photos: { where: { slot }, select: { privateFileId: true } },
      },
    });

    const privateFileId = handover?.photos[0]?.privateFileId;
    if (!handover || !privateFileId) throw evidencePhotoNotFound();

    return this.files.downloadFor(
      handover.tenantId,
      handover.vehicleId,
      privateFileId,
      PRIVATE_FILE_PURPOSE.HANDOVER_PHOTO,
    );
  }

  /**
   * Chuyến của CHÍNH người đang đăng nhập, rút còn hai định danh mà mọi truy vấn phụ cần.
   *
   * `tenantId` lấy từ ĐƠN chứ không từ yêu cầu: đơn mới là thứ các bảng vận hành (bàn giao,
   * ảnh, file riêng tư) khoá theo, nên trùng khớp hai bên phải là ĐIỀU KIỆN, không phải giả định.
   */
  private async requireTrip(customerUserId: string, id: string) {
    const row = await this.prisma.bookingRequest.findFirst({
      where: { customerUserId, OR: [{ id }, { bookingId: id }] },
      select: { bookingId: true, booking: { select: { tenantId: true } } },
    });
    if (!row) throw tripNotFound();
    return { bookingId: row.bookingId, tenantId: row.booking?.tenantId ?? null };
  }

  // ── Tiền ──────────────────────────────────────────────────────────────────

  /**
   * Toàn bộ tiền của chuyến, tính đúng MỘT lần.
   *
   * Chống đếm trùng ở hai chỗ dễ sai nhất:
   *
   *  1. **Cọc không được cộng vào tiền thuê đã trả.** `bookings.paid_amount` cộng dồn MỌI lần
   *     thu, kể cả lần thu cọc — đọc nó thành "đã trả tiền thuê" là cộng khoản cọc hai lần
   *     (một lần ở hoá đơn, một lần ở khối cọc). Nên `rentalPaid` đếm lại từ `payments` với
   *     `kind = 'rental'`; `depositReceived` lấy phần `kind = 'deposit'`. Hai tập rời nhau,
   *     cùng một bảng, không giao nhau.
   *  2. **Phát sinh chỉ cộng vào tổng MỘT lần.** `bookings.total_amount` KHÔNG bao gồm phát
   *     sinh (Wave 10 cố ý không đụng tới nó), nên `finalTotal = rentalTotal + surchargeTotal`.
   *     Phần khấu trừ vào cọc là CÁCH TRẢ cho phần đó, không phải một khoản thu thêm.
   */
  private async finance(booking: BookingRow): Promise<CustomerTripFinanceDto> {
    const [settlement, rentalPaidAgg] = await Promise.all([
      // Cùng một phép tính với màn chủ xe (Wave 10) — không dựng lại công thức ở đây.
      this.settlement.get(booking.tenantId, booking.id),
      this.prisma.payment.aggregate({
        where: {
          tenantId: booking.tenantId,
          bookingId: booking.id,
          kind: PAYMENT_KIND.RENTAL,
          status: PAYMENT_STATUS.SUCCEEDED,
        },
        _sum: { amount: true },
      }),
    ]);

    const rentalTotal = new Prisma.Decimal(booking.totalAmount);
    const surchargeTotal = new Prisma.Decimal(settlement.surchargeTotal);
    const depositReceived = new Prisma.Decimal(settlement.depositReceived);

    // Khấu trừ = phần phát sinh mà tiền cọc gánh được. Vượt quá thì phần dư là `additionalDue`
    // (server đã tính), khách trả trực tiếp — không bao giờ hiện một khoản khấu trừ âm.
    const depositDeducted = Prisma.Decimal.min(surchargeTotal, depositReceived);

    return {
      currency: 'VND',
      baseAmount: booking.baseAmount.toFixed(2),
      discountAmount: booking.discountAmount.toFixed(2),
      deliveryFee: booking.deliveryFee.toFixed(2),
      rentalTotal: rentalTotal.toFixed(2),
      surcharges: settlement.surcharges.map((row) => ({
        category: row.category,
        amount: row.amount,
        reason: row.reason,
        recordedAt: row.createdAt,
      })),
      surchargeTotal: surchargeTotal.toFixed(2),
      finalTotal: rentalTotal.plus(surchargeTotal).toFixed(2),
      rentalPaid: (rentalPaidAgg._sum.amount ?? ZERO).toFixed(2),
      depositRequired: settlement.depositRequired,
      depositReceived: settlement.depositReceived,
      depositDeducted: depositDeducted.toFixed(2),
      additionalDue: settlement.additionalDue,
      expectedRefund: settlement.proposedRefund,
      depositStatus: settlement.depositStatus,
      // Bản ghi hoàn cọc do chủ xe lập; khách CHỈ đọc — không có đường sửa nào từ đây.
      refundAmount: settlement.refund?.refundAmount ?? null,
      refundMethod: settlement.refund?.refundMethod ?? null,
      refundedAt: settlement.refund?.refundedAt ?? null,
      refundReference: settlement.refund?.reference ?? null,
      legacyPricing: booking.priceSnapshot === null,
    };
  }

  // ── Lọc & đếm ─────────────────────────────────────────────────────────────

  /**
   * Điều kiện lọc theo TAB. Chặng của khách là giá trị suy ra chứ không phải cột, nên mỗi tab
   * dịch ngược thành một vị từ trên hai cột trạng thái thật — vẫn lọc và phân trang ở DB, không
   * bao giờ kéo cả danh sách về rồi lọc trong Node.
   *
   * Danh sách trạng thái lấy từ `FILTER_STATUSES` (suy ngược bằng chính `customerTripStage`),
   * không viết tay: bản trước liệt kê tay và đã bỏ sót `awaiting_hold`, `hold_expired` cùng các
   * yêu cầu đã duyệt mà chưa có đơn — những chuyến đó không nằm trong tab nào và biến mất khỏi
   * màn hình của khách.
   */
  private whereFor(
    scope: TripViewerScope,
    filter: CustomerTripFilter,
  ): Prisma.BookingRequestWhereInput {
    const { bookingStatuses, requestStatuses } = FILTER_STATUSES[filter];

    /*
     * HAI mệnh đề `OR` độc lập, nên chúng phải nằm trong `AND` chứ không gộp làm một: một
     * object Prisma chỉ có MỘT khoá `OR`, và gộp "chuyến của ai" với "chuyến ở chặng nào" cho
     * ra "chuyến của tôi HOẶC chuyến đang chạy" — tức là lộ chuyến của người khác.
     */
    return {
      AND: [
        scopeWhere(scope),
        {
          // Có đơn thuê thì đơn nói; chưa có đơn thì trạng thái yêu cầu nói — đúng thứ tự ưu
          // tiên của `customerTripStage`, nên hai nhánh không bao giờ nhận cùng một dòng.
          OR: [
            { booking: { is: { status: { in: bookingStatuses } } } },
            { booking: { is: null }, status: { in: requestStatuses } },
          ],
        },
      ],
    };
  }

  /** Đếm cho từng tab bằng CHÍNH vị từ của tab đó — con số trên tab và danh sách không lệch. */
  private async counts(scope: TripViewerScope): Promise<CustomerTripCountsDto> {
    const count = (filter: CustomerTripFilter) =>
      this.prisma.bookingRequest.count({ where: this.whereFor(scope, filter) });

    const [current, history] = await Promise.all([
      count(CUSTOMER_TRIP_FILTER.CURRENT),
      count(CUSTOMER_TRIP_FILTER.HISTORY),
    ]);
    return { current, history };
  }
}

/**
 * Tab → hai tập trạng thái THẬT ở DB, suy ngược bằng chính phép chiếu `customerTripStage`.
 *
 * Đây là chỗ duy nhất biết tab nào ứng với trạng thái nào, và nó không liệt kê gì cả: mỗi
 * trạng thái vận hành được đem chiếu ra chặng rồi hỏi xem chặng đó thuộc tab nào. Thêm một
 * trạng thái vào `BOOKING_STATUS`/`BOOKING_REQUEST_STATUS` là nó tự vào đúng tab — không có
 * đường nào để một chuyến rơi ra ngoài mọi tab rồi biến mất khỏi màn hình khách.
 */
type FilterStatuses = Readonly<
  Record<
    CustomerTripFilter,
    { bookingStatuses: BookingStatus[]; requestStatuses: BookingRequestStatus[] }
  >
>;

const FILTER_STATUSES: FilterStatuses = Object.fromEntries(
  CUSTOMER_TRIP_FILTER_VALUES.map((filter) => {
    const stages: readonly CustomerTripStage[] = CUSTOMER_TRIP_FILTER_STAGES[filter];
    return [
      filter,
      {
        bookingStatuses: BOOKING_STATUS_VALUES.filter((status) =>
          stages.includes(
            customerTripStage({
              // Yêu cầu đã sinh đơn thì trạng thái của nó chỉ còn là lịch sử — phép chiếu bỏ qua.
              requestStatus: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
              bookingStatus: status,
            }),
          ),
        ),
        requestStatuses: BOOKING_REQUEST_STATUS_VALUES.filter((status) =>
          stages.includes(customerTripStage({ requestStatus: status, bookingStatus: null })),
        ),
      },
    ];
  }),
  // `Object.fromEntries` trả `{ [k: string]: … }`; ép về đúng bản đồ theo tab. An toàn vì khoá
  // đi thẳng từ `CUSTOMER_TRIP_FILTER_VALUES` nên không thiếu tab nào.
) as FilterStatuses;

// ── Truy vấn ─────────────────────────────────────────────────────────────────

const BOOKING_SELECT = {
  id: true,
  tenantId: true,
  code: true,
  status: true,
  serviceType: true,
  longTermPackageMonths: true,
  routeType: true,
  pickupAddress: true,
  destination: true,
  pickupAt: true,
  returnAt: true,
  actualPickupAt: true,
  actualReturnAt: true,
  baseAmount: true,
  discountAmount: true,
  deliveryFee: true,
  totalAmount: true,
  priceSnapshot: true,
  vehicle: { select: { plateNumber: true } },
  review: { select: { id: true, rating: true, comment: true, createdAt: true } },
} satisfies Prisma.BookingSelect;

const LIST_SELECT = {
  id: true,
  status: true,
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
  deliveryAddress: true,
  createdAt: true,
  bookingId: true,
  tenantId: true,
  // Ba trường dưới đây phục vụ PHÍA CHỦ XE: ai đang thuê, và còn bao lâu phải trả lời.
  customerUserId: true,
  customerName: true,
  customerPhone: true,
  respondBy: true,
  vehicle: {
    select: {
      id: true,
      name: true,
      plateNumber: true,
      mainImageUrl: true,
      seatCount: true,
      transmission: true,
      fuelType: true,
      // Bảng giá của xe — để báo giá TẠM TÍNH cho yêu cầu chưa duyệt không phải đọc lại
      // bảng xe một lượt cho mỗi dòng (xem `PricingService.estimateCustomerTotal`).
      weekdayPrice: true,
      weekendPrice: true,
      monthlyPrice: true,
      withDriverDailyPrice: true,
      withDriverInterCityPrice: true,
      withDriverOneWayPrice: true,
      discountPercent: true,
    },
  },
  tenant: { select: { name: true, slug: true, ratingAvg: true, ratingCount: true, phone: true } },
  booking: { select: BOOKING_SELECT },
} satisfies Prisma.BookingRequestSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  note: true,
  rejectReason: true,
} satisfies Prisma.BookingRequestSelect;

type TripRow = Prisma.BookingRequestGetPayload<{ select: typeof DETAIL_SELECT }>;
type BookingRow = NonNullable<TripRow['booking']>;

function toListItem(
  row: TripRow | Prisma.BookingRequestGetPayload<{ select: typeof LIST_SELECT }>,
  surchargeTotals: Map<string, Prisma.Decimal>,
  scope: TripViewerScope,
  estimates: Map<string, TripEstimate>,
) {
  const booking = row.booking;
  const stage = customerTripStage({
    requestStatus: row.status as BookingRequestStatus,
    bookingStatus: (booking?.status as BookingStatus | undefined) ?? null,
  });
  const engaged = isEngagedTrip(row.status as BookingRequestStatus, Boolean(booking));
  /*
   * Tôi đi thuê hay tôi cho thuê. So `customerUserId` chứ không so tenant: một chủ gian hàng
   * thuê xe của chính mình vẫn đang ở vai KHÁCH trên chuyến đó, và màn hình phải nói đúng vai
   * để họ không thấy nút "Duyệt" trên yêu cầu do chính mình gửi.
   */
  const role: TripRole =
    row.customerUserId === scope.userId ? TRIP_ROLE.RENTER : TRIP_ROLE.HOST;
  const canContact = canContactOn(engaged, role, scope);

  const item: CustomerTripListItemDto = {
    id: row.id,
    bookingId: booking?.id ?? null,
    code: booking?.code ?? null,
    stage,
    role,
    renter:
      role === TRIP_ROLE.HOST
        ? { name: row.customerName, phone: canContact ? row.customerPhone : null }
        : null,
    // Hạn trả lời chỉ còn nghĩa khi yêu cầu ĐANG chờ chủ xe; qua bước đó nó là một mốc đã chết.
    respondBy:
      row.status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL
        ? row.respondBy.toISOString()
        : null,
    canContact,
    vehicle: {
      id: row.vehicle.id,
      name: row.vehicle.name,
      imageUrl: row.vehicle.mainImageUrl,
      seatCount: row.vehicle.seatCount,
      transmission: row.vehicle.transmission,
      fuelType: row.vehicle.fuelType,
      /*
       * Biển số chỉ giấu với NGƯỜI ĐI THUÊ trước khi chuyến gắn kết — đó là dữ liệu của gian
       * hàng. Chủ xe nhìn chính chiếc xe của mình thì không có gì để giấu, và thiếu biển số họ
       * không phân biệt nổi hai chiếc cùng đời trong danh sách.
       */
      plateNumber:
        role === TRIP_ROLE.HOST
          ? (booking?.vehicle.plateNumber ?? row.vehicle.plateNumber)
          : engaged
            ? (booking?.vehicle.plateNumber ?? null)
            : null,
    },
    shop: {
      name: row.tenant.name,
      slug: row.tenant.slug,
      ratingAvg: Number(row.tenant.ratingAvg),
      ratingCount: row.tenant.ratingCount,
      phone: canContact ? row.tenant.phone : null,
    },
    // Giờ trên ĐƠN thắng giờ trên yêu cầu: shop dời lịch thì đơn mới là cái đang có hiệu lực.
    // Yêu cầu dài hạn chờ duyệt chưa có lịch nào — trả null, KHÔNG suy ra ngày từ nguyện vọng.
    pickupAt: (booking?.pickupAt ?? row.pickupAt)?.toISOString() ?? null,
    returnAt: (booking?.returnAt ?? row.returnAt)?.toISOString() ?? null,
    // Hành trình cùng nguyên tắc đơn-thắng-yêu-cầu (17/08): shop sửa lộ trình/địa chỉ trên đơn
    // thì khách phải thấy bản đang hiệu lực, không phải bản mình gõ lúc gửi.
    serviceType: booking?.serviceType ?? row.serviceType,
    longTermPackageMonths: booking?.longTermPackageMonths ?? row.longTermPackageMonths,
    pickupPreference: row.pickupPreference,
    requestedPickupDate: fromDateOnly(row.requestedPickupDate),
    pickupWindowStartDate: fromDateOnly(row.pickupWindowStartDate),
    pickupWindowEndDate: fromDateOnly(row.pickupWindowEndDate),
    routeType: booking ? booking.routeType : row.routeType,
    pickupAddress: booking ? booking.pickupAddress : row.pickupAddress,
    destination: booking ? booking.destination : row.destination,
    deliveryRequested: row.deliveryRequested,
    deliveryAddress: row.deliveryAddress,
    /*
     * Tổng DỊCH VỤ mới nhất = tiền thuê (đã gồm khuyến mãi + phí giao nhận hiện hành) + phát
     * sinh còn hiệu lực. Đúng công thức `finalTotal` ở chi tiết, nên hai màn không bao giờ hiện
     * hai số. Cọc KHÔNG nằm trong đây, và phần phát sinh khấu trừ vào cọc cũng không bị cộng
     * thêm lần nữa — nó chỉ là cách khách đã trả cho phần phát sinh này.
     */
    /*
     * Có đơn thì đọc số ĐÃ ĐÓNG BĂNG; chưa có đơn thì báo giá tạm tính (gồm phụ phí phía
     * khách — ADR 0029). Hai nguồn loại trừ nhau theo đúng thứ tự đó, nên không có chuyến
     * nào đọc ra hai con số.
     */
    totalAmount: booking
      ? booking.totalAmount.plus(surchargeTotals.get(booking.id) ?? ZERO).toFixed(2)
      : (customerTotalOf(estimates.get(row.id)) ?? null),
    totalIsEstimate: !booking && estimates.has(row.id),
    canReview: booking?.status === BOOKING_STATUS.COMPLETED && !booking.review,
    hasReview: Boolean(booking?.review),
    createdAt: row.createdAt.toISOString(),
  };
  return item;
}

/**
 * Chuyến đã thật sự thành QUAN HỆ giữa khách và gian hàng — điều kiện để lộ SĐT shop và biển số.
 *
 * Danh sách CHO PHÉP, không phải "khác chờ duyệt". Điều kiện phủ định cũ (`stage !== pending`)
 * coi cả yêu cầu bị từ chối, quá hạn và khách tự huỷ là đã-gắn-kết — tức là gửi một yêu cầu rồi
 * tự huỷ ngay là đủ để moi số điện thoại của mọi gian hàng trên sàn. Thêm một trạng thái kết
 * thúc mới trong tương lai cũng sẽ tự động rơi vào phía AN TOÀN thay vì tự động lộ.
 */
/**
 * Phạm vi ĐỌC của một người trên bảng `booking_requests` — trả về mảnh `where`, không phải một
 * câu `if` sau khi đọc.
 *
 * Chủ gian hàng thấy CẢ chuyến mình đi thuê lẫn chuyến trên xe của gian hàng mình; người khác
 * chỉ thấy chuyến của chính họ. `customerUserId` có thể null (đơn do nhân viên nhập tay), nên
 * nhánh khách phải so bằng giá trị thật chứ không dựa vào một mặc định.
 */
/** Bảng kê tạm tính của một chuyến chưa có đơn — trả nguyên từ `PricingService`. */
type TripEstimate = NonNullable<Awaited<ReturnType<PricingService['estimateQuote']>>>;

/** Số KHÁCH TRẢ cả chuyến. Không có chính sách phí ⇒ đúng bằng giá thuê, không cộng gì thêm. */
function customerTotalOf(estimate: TripEstimate | undefined): string | null {
  if (!estimate) return null;
  return estimate.fees?.customerTotalAmount ?? estimate.breakdown.totalAmount;
}

function toEstimate(estimate: TripEstimate | undefined): CustomerTripEstimateDto | null {
  if (!estimate) return null;
  return {
    rows: estimate.breakdown.rows,
    rentalTotal: estimate.breakdown.totalAmount,
    depositAmount: estimate.breakdown.depositAmount,
    fees: estimate.fees,
  };
}

function scopeWhere(scope: TripViewerScope): Prisma.BookingRequestWhereInput {
  if (!scope.hostTenantId) return { customerUserId: scope.userId };
  return {
    OR: [{ customerUserId: scope.userId }, { tenantId: scope.hostTenantId }],
  };
}

/**
 * Hai bên được liên hệ trực tiếp chưa — MỘT cổng cho cả SĐT khách lẫn SĐT gian hàng.
 *
 * Mặc định là "chỉ khi chuyến đã thành quan hệ thật" (`isEngagedTrip`): nền tảng không dẫn hai
 * người ra ngoài trước khi có một chuyến, vì một yêu cầu gửi rồi tự huỷ sẽ thành cách moi số
 * điện thoại (ADR 0028 điều 9).
 *
 * Ngoại lệ đúng MỘT chỗ: gian hàng THUÊ BAO nhìn yêu cầu gửi tới xe của họ. Họ đã trả cước, và
 * ADR 0028 điều 1 cho phép họ liên hệ và chốt trực tiếp — chặn ở đó là lấy đi thứ họ vừa mua.
 * Ngoại lệ này KHÔNG áp cho chiều ngược lại: khách vẫn chưa thấy SĐT gian hàng trước khi duyệt.
 */
function canContactOn(engaged: boolean, role: TripRole, scope: TripViewerScope): boolean {
  if (engaged) return true;
  return role === TRIP_ROLE.HOST && scope.hostSubscribed;
}

function isEngagedTrip(requestStatus: BookingRequestStatus, hasBooking: boolean): boolean {
  if (hasBooking) return true;
  return (
    requestStatus === BOOKING_REQUEST_STATUS.APPROVED_BY_HOST ||
    requestStatus === BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING
  );
}

/**
 * Chuyến không tồn tại VÀ chuyến của người khác trả về cùng một lỗi. Phân biệt hai cái đó là
 * cách lịch sự để xác nhận "id này có thật, chỉ là không phải của bạn".
 */
/**
 * Chặng hiện tại không cho huỷ nữa.
 *
 * `details.stage` để FE nói đúng lối đi tiếp: xe đã giao thì mời liên hệ chủ xe, còn chuyến đã
 * khép lại thì chỉ cần tải lại danh sách — hai câu khác hẳn nhau cho cùng một mã lỗi.
 */
function cancelNotAllowed(stage: CustomerTripStage): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.TRIP_CANCEL_NOT_ALLOWED,
    message: 'Chuyến này không còn huỷ được nữa',
    details: { stage },
  });
}

// ── Bằng chứng bàn giao ──────────────────────────────────────────────────────

/** Hai chiều của chuyến, theo đúng thứ tự chúng xảy ra. */
const EVIDENCE_ORDER: readonly HandoverType[] = [HANDOVER_TYPE.PICKUP, HANDOVER_TYPE.RETURN];

/**
 * Cột được đọc cho bề mặt khách — danh sách CHO PHÉP, không phải "lấy hết rồi bỏ bớt". Thêm
 * một cột nội bộ vào bảng bàn giao sau này sẽ không tự động rò ra đây.
 */
const EVIDENCE_SELECT = {
  type: true,
  odometerKm: true,
  condition: true,
  occurredAt: true,
  confirmedAt: true,
  photos: { select: { slot: true, createdAt: true } },
} satisfies Prisma.VehicleHandoverSelect;

type EvidenceRow = Prisma.VehicleHandoverGetPayload<{ select: typeof EVIDENCE_SELECT }>;

/** Thứ tự ô ảnh trên màn: theo GÓC CHỤP cố định, không theo lúc tải lên. */
const SLOT_RANK = new Map<string, number>(
  HANDOVER_PHOTO_SLOT_VALUES.map((slot, index) => [slot as string, index]),
);

function toEvidence(row: EvidenceRow): CustomerTripHandoverEvidenceDto {
  const confirmedAt = row.confirmedAt;

  const photos: CustomerTripHandoverEvidencePhotoDto[] = [...row.photos]
    .sort(
      (a, b) =>
        slotRank(a.slot) - slotRank(b.slot) || a.createdAt.getTime() - b.createdAt.getTime(),
    )
    .map((photo) => ({
      slot: photo.slot,
      uploadedAt: photo.createdAt.toISOString(),
      addedAfterConfirmation: isHandoverPhotoAddedAfterConfirmation(photo.createdAt, confirmedAt),
    }));

  return {
    type: row.type,
    occurredAt: handoverOccurredAt(row.occurredAt, confirmedAt)?.toISOString() ?? null,
    confirmedAt: confirmedAt?.toISOString() ?? null,
    /*
     * `null` nghĩa là "chưa ai đọc chỉ số này" và phải đi tới giao diện nguyên vẹn. Ép về 0 ở
     * đây là bịa ra một con số đồng hồ chưa từng tồn tại — đúng thứ design 14 §7 cấm.
     */
    odometerKm: row.odometerKm,
    // Suy từ chính con số, không đọc cờ `odometer_missing`: cờ và số không được phép nói
    // ngược nhau trên màn của khách, kể cả khi một bản ghi cũ nào đó lệch.
    odometerMissing: row.odometerKm === null,
    condition: row.condition,
    photos,
  };
}

/** Góc lạ (dữ liệu cũ, hoặc slot thêm về sau) rơi xuống CUỐI thay vì trộn vào giữa lưới. */
function slotRank(slot: string): number {
  return SLOT_RANK.get(slot) ?? SLOT_RANK.size;
}

/**
 * Ảnh không tồn tại VÀ ảnh của chuyến người khác trả về cùng một lỗi — cùng lý do với
 * {@link tripNotFound}.
 */
function evidencePhotoNotFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy ảnh hiện trạng của chuyến này',
  });
}

function tripNotFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy chuyến đi này',
  });
}
