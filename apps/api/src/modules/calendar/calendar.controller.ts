import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  addCalendarMonthsVn,
  vnDayStart,
  OCCUPANCY_SOURCE_TYPE,
  OCCUPANCY_SOURCE_TYPE_META,
  PERMISSION,
  SERVICE_TYPE,
  type OccupancySourceType,
  SUPPORT_CAPABILITY,
} from '@xeprime/types';
import {
  CurrentTenant,
  Realms,
  RequirePermissions,
  SupportAction,
  TenantScoped,
} from '../../common/decorators';
import type { TenantContext } from '../../common/types/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { QuoteBreakdownDto } from '../pricing/dto/pricing.dto';
import { OccupancyService } from './occupancy.service';
import {
  CalendarAvailabilityDto,
  CalendarDailyPriceDto,
  CalendarEventDto,
  CalendarEventsQueryDto,
  CalendarQuoteQueryDto,
  CalendarRangeQueryDto,
  CalendarResourceDto,
  CheckConflictDto,
  CheckConflictResultDto,
} from './dto/calendar.dto';
import { VehicleBusyDaysDto, VehicleBusyDaysQueryDto } from './dto/busy-days.dto';
import { resolveBranchScope, vehicleBranchWhere } from '../../common/dto/branch-scope';
import { fromDateOnly } from '../../common/date-only';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Asia/Ho_Chi_Minh = UTC+7 cố định (không DST) — đủ để gán nhãn ngày local. */
const TZ_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Nhãn ngày local (YYYY-MM-DD) của cột thứ `i` kể từ đầu khoảng xem. */
function localDayKey(rangeStart: Date, dayIndex: number): string {
  return new Date(rangeStart.getTime() + dayIndex * MS_PER_DAY + TZ_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/** Điều kiện lọc xe dùng CHUNG cho resources / availability / daily-prices — không được lệch nhau. */
function vehicleWhere(
  tenant: TenantContext,
  query: CalendarRangeQueryDto,
): Prisma.VehicleWhereInput {
  return {
    tenantId: tenant.tenantId,
    deletedAt: null,
    ...(query.vehicleType ? { vehicleType: query.vehicleType } : {}),
    // Lịch theo chi nhánh: chỉ thu hẹp danh sách xe, `tenantId` vẫn là ranh giới thật.
    branchId: resolveBranchScope(query.branchId, tenant.allowedBranchIds),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { plateNumber: { contains: query.q, mode: 'insensitive' } },
            { code: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

@ApiTags('calendar')
@Controller('calendar')
@TenantScoped()
@Realms(ACCOUNT_REALM.PARTNER)
export class CalendarController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly occupancy: OccupancyService,
    private readonly pricing: PricingService,
  ) {}

  @Get('resources')
  @RequirePermissions(PERMISSION.CALENDAR_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.CALENDAR_VIEW)
  @ApiOperation({ summary: 'Danh sách xe làm hàng của resource timeline' })
  @ApiOkResponse({ type: CalendarResourceDto, isArray: true })
  async resources(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: CalendarRangeQueryDto,
  ): Promise<CalendarResourceDto[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: vehicleWhere(tenant, query),
      // Chỉ những gì cột xe cần — KHÔNG kéo cả hồ sơ xe cho từng hàng lịch.
      select: {
        id: true,
        name: true,
        code: true,
        plateNumber: true,
        mainImageUrl: true,
        weekdayPrice: true,
        hourlyPrice: true,
        vehicleType: true,
        operationStatus: true,
      },
      orderBy: [{ vehicleType: 'asc' }, { name: 'asc' }],
    });

    const sort = query.sort ?? 'next_booking';

    /**
     * `next_booking` (mặc định): xếp theo lịch ĐANG chạy/sắp tới gần nhất — một groupBy trên
     * occupancies cho cả đội xe (không N+1). Xe đang có khách (start trong quá khứ, chưa trả)
     * tự nhiên đứng đầu vì min(start) nhỏ nhất; xe trống lịch rơi xuống cuối theo tên.
     */
    if (sort === 'next_booking' && vehicles.length > 0) {
      const upcoming = await this.prisma.vehicleOccupancy.groupBy({
        by: ['vehicleId'],
        where: {
          tenantId: tenant.tenantId,
          vehicleId: { in: vehicles.map((v) => v.id) },
          endAt: { gt: new Date() },
        },
        _min: { startAt: true },
      });
      const nextBy = new Map(upcoming.map((u) => [u.vehicleId, u._min.startAt?.getTime() ?? 0]));
      vehicles.sort((a, b) => {
        const na = nextBy.get(a.id);
        const nb = nextBy.get(b.id);
        if (na != null && nb != null && na !== nb) return na - nb;
        if (na != null && nb == null) return -1;
        if (na == null && nb != null) return 1;
        return a.name.localeCompare(b.name, 'vi');
      });
    } else if (sort === 'price_asc' || sort === 'price_desc') {
      const dir = sort === 'price_asc' ? 1 : -1;
      vehicles.sort((a, b) => {
        // Xe chưa cấu hình giá luôn xuống cuối, bất kể chiều sắp xếp.
        if (a.weekdayPrice == null && b.weekdayPrice == null)
          return a.name.localeCompare(b.name, 'vi');
        if (a.weekdayPrice == null) return 1;
        if (b.weekdayPrice == null) return -1;
        const diff = a.weekdayPrice.comparedTo(b.weekdayPrice);
        return diff !== 0 ? dir * diff : a.name.localeCompare(b.name, 'vi');
      });
    }
    // `name`: giữ nguyên orderBy của DB (loại xe rồi tên).

    return vehicles.map((v) => ({
      id: v.id,
      vehicleId: v.id,
      name: v.name,
      code: v.code,
      plateNumber: v.plateNumber,
      mainImageUrl: v.mainImageUrl,
      weekdayPrice: v.weekdayPrice ? v.weekdayPrice.toFixed(0) : null,
      hourlyPrice: v.hourlyPrice ? v.hourlyPrice.toFixed(0) : null,
      vehicleType: v.vehicleType,
      operationStatus: v.operationStatus,
    }));
  }

  /**
   * Báo giá NỘI BỘ cho luồng "Đặt xe" trên lịch — cùng PricingService (kèm giá riêng theo ngày)
   * với báo giá công khai, nhưng scope theo TENANT nên xe chưa lên chợ vẫn báo được.
   * Xe chưa cấu hình giá ngày → 400 VALIDATION_FAILED, FE rơi về nhập tiền tay.
   */
  @Get('quote')
  @RequirePermissions(PERMISSION.BOOKING_CREATE)
  @ApiOperation({ summary: 'Báo giá nội bộ cho một xe của gian hàng (kèm giá riêng theo ngày)' })
  @ApiOkResponse({ type: QuoteBreakdownDto })
  async quote(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: CalendarQuoteQueryDto,
  ): Promise<QuoteBreakdownDto> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: query.vehicleId, tenantId: tenant.tenantId, deletedAt: null },
      select: {
        id: true,
        weekdayPrice: true,
        weekendPrice: true,
        serviceTypes: true,
        monthlyPrice: true,
        withDriverDailyPrice: true,
        withDriverInterCityPrice: true,
        withDriverOneWayPrice: true,
        discountPercent: true,
      },
    });
    if (!vehicle) {
      throw new NotFoundException({ code: API_ERROR_CODE.NOT_FOUND, message: 'Không tìm thấy xe' });
    }
    // Cùng luật với public quote: báo giá cho dịch vụ xe không phục vụ là con số vô nghĩa.
    if (query.serviceType && !vehicle.serviceTypes.includes(query.serviceType)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Xe không phục vụ loại dịch vụ này',
      });
    }

    const policy = await this.pricing.effectivePolicy(tenant.tenantId, vehicle.id);

    // Dài hạn: giá theo GÓI tháng lịch, không phụ thuộc khoảng ngày (ADR 0011). Nhân viên và
    // khách vì thế luôn thấy cùng một con số cho cùng một gói.
    if (query.serviceType === SERVICE_TYPE.LONG_TERM) {
      return this.pricing.buildLongTermPackageQuote({
        monthlyPrice: vehicle.monthlyPrice ? vehicle.monthlyPrice.toFixed(0) : null,
        packageMonths: query.packageMonths!,
        policy,
        delivery: null,
      });
    }

    if (!query.pickupAt || !query.returnAt) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Thiếu thời gian nhận/trả xe',
      });
    }
    const dailyOverrides = await this.pricing.dailyOverridesFor(
      vehicle.id,
      query.pickupAt,
      query.returnAt,
    );
    return this.pricing.buildDailyQuote({
      weekdayPrice: vehicle.weekdayPrice ? vehicle.weekdayPrice.toFixed(0) : null,
      weekendPrice: vehicle.weekendPrice ? vehicle.weekendPrice.toFixed(0) : null,
      pickupAt: query.pickupAt,
      returnAt: query.returnAt,
      policy,
      delivery: null,
      dailyOverrides,
      // Giá theo DỊCH VỤ + LỘ TRÌNH (17/08): staff và khách nhìn cùng con số cho cùng chuyến.
      serviceType: query.serviceType,
      routeType: query.serviceType === SERVICE_TYPE.WITH_DRIVER ? (query.routeType ?? null) : null,
      withDriverDailyPrice: vehicle.withDriverDailyPrice
        ? vehicle.withDriverDailyPrice.toFixed(0)
        : null,
      withDriverInterCityPrice: vehicle.withDriverInterCityPrice
        ? vehicle.withDriverInterCityPrice.toFixed(0)
        : null,
      withDriverOneWayPrice: vehicle.withDriverOneWayPrice
        ? vehicle.withDriverOneWayPrice.toFixed(0)
        : null,
      discountPercent: vehicle.discountPercent,
    });
  }

  /**
   * Lịch bận theo ngày của MỘT xe của gian hàng — cho ô chọn thời gian của luồng đặt hộ, để ngày đã
   * kín bị khoá (gạch chéo) y như phía khách. Cửa công khai (`/public/booking-requests/busy-days`)
   * chỉ trả cho xe đang lên chợ; xe nội bộ cũng nhận đơn lập tay nên cần cửa này, scope theo TENANT.
   *
   * Cùng phép tính với phía khách (`OccupancyService.listBusyDays`) — hai luồng tô một chiếc xe y
   * hệt nhau. Cùng quyền với báo giá nội bộ: dữ liệu này chỉ phục vụ việc lập đơn. Xe ngoài phạm vi
   * chi nhánh được giao trả 404 như xe của gian hàng khác (ADR 0052).
   *
   * ADR 0006: preview cho UX — constraint lúc tạo đơn mới là chốt chặn.
   */
  @Get('busy-days')
  @RequirePermissions(PERMISSION.BOOKING_CREATE)
  @ApiOperation({
    summary: 'Lịch bận theo ngày của một xe của gian hàng (tô ô chọn thời gian thuê)',
  })
  @ApiOkResponse({ type: VehicleBusyDaysDto })
  async busyDays(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: VehicleBusyDaysQueryDto,
  ): Promise<VehicleBusyDaysDto> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: query.vehicleId,
        tenantId: tenant.tenantId,
        deletedAt: null,
        branchId: resolveBranchScope(undefined, tenant.allowedBranchIds),
      },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException({ code: API_ERROR_CODE.NOT_FOUND, message: 'Không tìm thấy xe' });
    }
    return this.occupancy.listBusyDays(vehicle.id, query.from, query.to);
  }

  /**
   * Hàng "Xe còn trống": với MỖI ngày local trong khoảng xem, đếm số xe (trong toàn bộ đội xe
   * đã lọc — không chỉ các hàng đang virtualize) KHÔNG có occupancy nào chạm vào ngày đó.
   *
   * Chiếm một phần ngày cũng tính là bận cả ngày ở mức tổng hợp này. Ranh giới ngày theo
   * Asia/Ho_Chi_Minh — `startAt` từ FE đã là nửa đêm VN nên cột thứ i là [start+i·24h, +24h).
   */
  @Get('availability')
  @RequirePermissions(PERMISSION.CALENDAR_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.CALENDAR_VIEW)
  @ApiOperation({ summary: 'Số xe còn trống theo từng ngày của khoảng đang xem' })
  @ApiOkResponse({ type: CalendarAvailabilityDto })
  async availability(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: CalendarRangeQueryDto,
  ): Promise<CalendarAvailabilityDto> {
    const dayCount = Math.max(
      0,
      Math.min(62, Math.round((query.endAt.getTime() - query.startAt.getTime()) / MS_PER_DAY)),
    );

    const vehicles = await this.prisma.vehicle.findMany({
      where: vehicleWhere(tenant, query),
      select: { id: true },
    });
    const vehicleIds = vehicles.map((v) => v.id);
    if (vehicleIds.length === 0 || dayCount === 0) {
      return {
        days: Array.from({ length: dayCount }, (_, i) => ({
          date: localDayKey(query.startAt, i),
          availableCount: 0,
        })),
        totalVehicles: 0,
      };
    }

    const occupancies = await this.prisma.vehicleOccupancy.findMany({
      where: {
        tenantId: tenant.tenantId,
        vehicleId: { in: vehicleIds },
        startAt: { lt: query.endAt },
        endAt: { gt: query.startAt },
      },
      select: { vehicleId: true, startAt: true, endAt: true },
    });

    // Đánh dấu xe bận theo cột ngày: một occupancy phủ [i0, i1] cột. O(events × ngày phủ).
    const busyByDay: Array<Set<string>> = Array.from({ length: dayCount }, () => new Set());
    const rangeStartMs = query.startAt.getTime();
    for (const o of occupancies) {
      const first = Math.max(0, Math.floor((o.startAt.getTime() - rangeStartMs) / MS_PER_DAY));
      // Nửa mở [start, end): kết thúc ĐÚNG nửa đêm không chạm sang cột kế tiếp.
      const last = Math.min(
        dayCount - 1,
        Math.ceil((o.endAt.getTime() - rangeStartMs) / MS_PER_DAY) - 1,
      );
      for (let i = first; i <= last; i++) busyByDay[i]!.add(o.vehicleId);
    }

    return {
      days: busyByDay.map((busy, i) => ({
        date: localDayKey(query.startAt, i),
        availableCount: vehicleIds.length - busy.size,
      })),
      totalVehicles: vehicleIds.length,
    };
  }

  /**
   * Dấu "giá riêng" cho MỌI xe đang lọc trong khoảng xem — một request cho cả lưới, không
   * N+1 theo từng xe. Chi tiết/sửa giá đi qua `/vehicles/:id/daily-prices`.
   */
  @Get('daily-prices')
  @RequirePermissions(PERMISSION.CALENDAR_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.CALENDAR_VIEW)
  @ApiOperation({ summary: 'Bản ghi đè giá theo ngày của các xe đang lọc, trong khoảng xem' })
  @ApiOkResponse({ type: CalendarDailyPriceDto, isArray: true })
  async dailyPrices(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: CalendarRangeQueryDto,
  ): Promise<CalendarDailyPriceDto[]> {
    const dayCount = Math.max(
      1,
      Math.min(62, Math.round((query.endAt.getTime() - query.startAt.getTime()) / MS_PER_DAY)),
    );
    const from = new Date(`${localDayKey(query.startAt, 0)}T00:00:00.000Z`);
    const to = new Date(`${localDayKey(query.startAt, dayCount - 1)}T00:00:00.000Z`);

    const rows = await this.prisma.vehicleDailyPrice.findMany({
      where: {
        tenantId: tenant.tenantId,
        date: { gte: from, lte: to },
        // Cùng bộ lọc xe với resources — dấu giá không hiện cho hàng không tồn tại.
        vehicle: vehicleWhere(tenant, query),
      },
      select: { vehicleId: true, date: true, dailyPrice: true, hourlyPrice: true },
    });

    return rows.map((r) => ({
      vehicleId: r.vehicleId,
      date: r.date.toISOString().slice(0, 10),
      dailyPrice: r.dailyPrice ? r.dailyPrice.toFixed(0) : null,
      hourlyPrice: r.hourlyPrice ? r.hourlyPrice.toFixed(0) : null,
    }));
  }

  /**
   * Đọc từ `vehicle_occupancies`, không đọc từ `bookings`.
   *
   * ADR 0006: occupancies là nguồn sự thật của "xe bận lúc nào" — nó gộp cả đơn thuê,
   * khoá xe và bảo dưỡng. Đọc từ `bookings` sẽ vẽ thiếu lịch bảo dưỡng lên màn hình.
   *
   * Lọc chi nhánh đi qua QUAN HỆ xe (`vehicle.branchId`) vì `vehicle_occupancies` không mang
   * cột chi nhánh — `vehicles` là bảng DUY NHẤT có nó. Phải có mặt ở đây chứ không chỉ ở
   * `resources`: lưới chỉ vẽ event của những hàng nó đang hiện, nên thiếu bộ lọc này thì màn
   * hình trông vẫn đúng trong khi phản hồi mang theo cả lịch — và TÊN KHÁCH — của chi nhánh khác.
   */
  @Get('events')
  @RequirePermissions(PERMISSION.CALENDAR_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.CALENDAR_VIEW)
  @ApiOperation({ summary: 'Sự kiện chiếm lịch trong khoảng thời gian' })
  @ApiOkResponse({ type: CalendarEventDto, isArray: true })
  async events(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: CalendarEventsQueryDto,
  ): Promise<CalendarEventDto[]> {
    /*
     * Tên khách, dịch vụ, số tiền của một YÊU CẦU là dữ liệu của hộp thư yêu cầu — người chỉ có
     * quyền xem lịch vẫn thấy chỗ bị giữ, nhưng không thấy của ai. `permissions` có thể vắng ở
     * lời gọi nội bộ (spec) — vắng thì coi như không có quyền.
     */
    const canSeeRequests = Boolean(tenant.permissions?.includes(PERMISSION.BOOKING_REQUEST_VIEW));
    const branchScope = resolveBranchScope(query.branchId, tenant.allowedBranchIds);

    const occupancies = await this.prisma.vehicleOccupancy.findMany({
      where: {
        tenantId: tenant.tenantId,
        // Giao nhau với khoảng đang xem: bắt đầu trước khi khoảng kết thúc, và
        // kết thúc sau khi khoảng bắt đầu. Bỏ một trong hai vế là mất các event
        // kéo dài vắt qua biên.
        startAt: { lt: query.endAt },
        endAt: { gt: query.startAt },
        // Thu hẹp theo chi nhánh; `tenantId` ở trên vẫn là ranh giới thật.
        ...vehicleBranchWhere(branchScope),
      },
      select: {
        id: true,
        vehicleId: true,
        sourceType: true,
        sourceId: true,
        startAt: true,
        endAt: true,
      },
      orderBy: { startAt: 'asc' },
    });

    // Batch-load phần tóm tắt theo TỪNG loại nguồn — một query mỗi loại, không N+1 theo event.
    const idsOf = (type: OccupancySourceType) =>
      occupancies.filter((o) => o.sourceType === type).map((o) => o.sourceId);
    const bookingIds = idsOf(OCCUPANCY_SOURCE_TYPE.BOOKING);
    const blockIds = idsOf(OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE);
    const holdRequestIds = idsOf(OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST);

    const [bookings, blocks, holdRequests, pendingRequests] = await Promise.all([
      bookingIds.length
        ? this.prisma.booking.findMany({
            where: { id: { in: bookingIds }, tenantId: tenant.tenantId },
            select: {
              id: true,
              code: true,
              customerName: true,
              status: true,
              serviceType: true,
              totalAmount: true,
            },
          })
        : [],
      blockIds.length
        ? this.prisma.vehicleBlock.findMany({
            where: { id: { in: blockIds }, tenantId: tenant.tenantId },
            select: { id: true, reason: true },
          })
        : [],
      holdRequestIds.length
        ? this.prisma.bookingRequest.findMany({
            where: { id: { in: holdRequestIds }, tenantId: tenant.tenantId },
            select: {
              id: true,
              status: true,
              customerName: true,
              serviceType: true,
              hold: { select: { priceSnapshotJson: true } },
            },
          })
        : [],
      query.includePendingRequests && canSeeRequests
        ? this.pendingRequestEvents(tenant.tenantId, query, branchScope)
        : [],
    ]);

    const bookingById = new Map(bookings.map((b) => [b.id, b]));
    const blockById = new Map(blocks.map((b) => [b.id, b]));
    const holdById = new Map(holdRequests.map((r) => [r.id, r]));

    const occupied = occupancies.map((o): CalendarEventDto => {
      const base = {
        id: o.id,
        resourceId: o.vehicleId,
        type: o.sourceType,
        startAt: o.startAt.toISOString(),
        endAt: o.endAt.toISOString(),
        sourceId: o.sourceId,
        occupying: true,
      };
      const booking = bookingById.get(o.sourceId);
      if (booking) {
        return {
          ...base,
          title: `${booking.code} · ${booking.customerName}`,
          customerName: booking.customerName,
          status: booking.status,
          code: booking.code,
          serviceType: booking.serviceType,
          amount: booking.totalAmount.toFixed(0),
        };
      }
      const hold = holdById.get(o.sourceId);
      if (hold) {
        return {
          ...base,
          title: nonBookingTitle(o.sourceType),
          customerName: canSeeRequests ? hold.customerName : null,
          status: hold.status,
          code: null,
          serviceType: canSeeRequests ? hold.serviceType : null,
          amount: canSeeRequests ? holdRentalTotal(hold.hold?.priceSnapshotJson) : null,
        };
      }
      return {
        ...base,
        title: nonBookingTitle(o.sourceType),
        customerName: null,
        status: blockById.get(o.sourceId)?.reason ?? null,
        code: null,
        serviceType: null,
        amount: null,
      };
    });

    return [...occupied, ...pendingRequests];
  }

  /**
   * Yêu cầu CHỜ DUYỆT giao với khoảng xem — lớp HIỂN THỊ, không phải lịch bận.
   *
   * Không đọc `vehicle_occupancies` vì chúng không có ở đó: gửi yêu cầu KHÔNG chiếm lịch (ADR 0044
   * điều 1) và nhiều khách được hỏi cùng một khung giờ. `occupying = false` để client vẽ khác đi
   * và không đếm chúng là "ngày bận".
   *
   * Dài hạn mô hình gói chưa có lịch chính xác (`pickup_at` NULL — gian hàng chốt khi duyệt): vẽ
   * NGUYỆN VỌNG của khách — từ ngày muốn nhận (hoặc đầu khoảng linh hoạt) cộng đúng số THÁNG LỊCH
   * của gói (ADR 0011). Bản ghi dài hạn legacy không có gói thì vẽ một tháng.
   */
  private async pendingRequestEvents(
    tenantId: string,
    query: CalendarEventsQueryDto,
    branchScope: ReturnType<typeof resolveBranchScope>,
  ): Promise<CalendarEventDto[]> {
    const rows = await this.prisma.bookingRequest.findMany({
      where: {
        tenantId,
        status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
        vehicle: {
          deletedAt: null,
          ...(branchScope === undefined ? {} : { branchId: branchScope }),
        },
        OR: [
          { pickupAt: { lt: query.endAt }, returnAt: { gt: query.startAt } },
          {
            pickupAt: null,
            OR: [
              { requestedPickupDate: { lt: query.endAt } },
              { pickupWindowStartDate: { lt: query.endAt } },
            ],
          },
        ],
      },
      select: {
        id: true,
        vehicleId: true,
        customerName: true,
        serviceType: true,
        pickupAt: true,
        returnAt: true,
        requestedPickupDate: true,
        pickupWindowStartDate: true,
        longTermPackageMonths: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const events: CalendarEventDto[] = [];
    for (const r of rows) {
      const span = pendingRequestSpan(r);
      // Vế dài hạn của câu truy vấn chỉ chặn được đầu khoảng; đuôi nguyện vọng lọc ở đây.
      if (!span || span.endAt <= query.startAt || span.startAt >= query.endAt) continue;
      events.push({
        id: r.id,
        resourceId: r.vehicleId,
        type: OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST,
        title: r.customerName,
        customerName: r.customerName,
        startAt: span.startAt.toISOString(),
        endAt: span.endAt.toISOString(),
        status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
        sourceId: r.id,
        occupying: false,
        code: null,
        serviceType: r.serviceType,
        amount: null,
      });
    }
    return events;
  }

  /**
   * Preview trùng lịch cho UX — ADR 0006: KHÔNG bảo vệ gì. Kết quả có thể cũ ngay khi vừa
   * trả về; chốt chặn thật là exclusion constraint lúc tạo/sửa đơn. Chỉ để cảnh báo sớm.
   */
  @Post('check-conflict')
  @RequirePermissions(PERMISSION.CALENDAR_VIEW)
  // Phiên hỗ trợ: hộp thoại khoá lịch gọi nó để cảnh báo sớm. POST nhưng KHÔNG ghi gì — capability
  // đọc, không đòi lý do (ADR 0050 §13).
  @SupportAction(SUPPORT_CAPABILITY.CALENDAR_VIEW)
  @ApiOperation({ summary: 'Xem trước trùng lịch (preview, không phải lớp bảo vệ)' })
  @ApiOkResponse({ type: CheckConflictResultDto })
  async checkConflict(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CheckConflictDto,
  ): Promise<CheckConflictResultDto> {
    // Xe phải thuộc gian hàng — không cho dò lịch xe của shop khác qua vehicleId đoán được.
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, tenantId: tenant.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!vehicle) return { hasConflict: false, conflicts: [] };

    const conflicts = await this.occupancy.findOverlapping(
      dto.vehicleId,
      dto.startAt,
      dto.endAt,
      dto.excludeSourceId,
    );
    return { hasConflict: conflicts.length > 0, conflicts };
  }
}

/**
 * Nhãn của một occupancy KHÔNG phải đơn thuê.
 *
 * Lấy từ META của loại nguồn thay vì if/else hai nhánh: nhánh else cũ dán "Xe bị khóa" lên
 * MỌI loại chưa liệt kê — nên một khoản giữ chỗ (`booking_request`, sinh khi gian hàng duyệt
 * yêu cầu ở tuyến hoa hồng) hiện lên lịch như một lệnh khoá xe, trong khi thẻ xem nhanh của
 * chính nó lại ghi "Chờ giữ chỗ".
 */
/**
 * Tiền thuê đã chốt của một khoản giữ chỗ — đọc từ snapshot đóng băng lúc duyệt (ADR 0024), không
 * tính lại theo chính sách hôm nay. Snapshot hỏng/thiếu thì `null`: thẻ lịch không đoán số.
 */
function holdRentalTotal(snapshot: Prisma.JsonValue | undefined): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const total = (snapshot as { totalAmount?: unknown }).totalAmount;
  return typeof total === 'string' ? total : null;
}

/**
 * Khoảng VẼ của một yêu cầu chờ duyệt. Có lịch thì dùng lịch; dài hạn mô hình gói thì từ ngày
 * nguyện vọng (`requested_pickup_date`, hoặc đầu khoảng linh hoạt) cộng số THÁNG LỊCH của gói.
 */
function pendingRequestSpan(r: {
  pickupAt: Date | null;
  returnAt: Date | null;
  requestedPickupDate: Date | null;
  pickupWindowStartDate: Date | null;
  longTermPackageMonths: number | null;
}): { startAt: Date; endAt: Date } | null {
  if (r.pickupAt && r.returnAt) return { startAt: r.pickupAt, endAt: r.returnAt };
  const wishDay = fromDateOnly(r.requestedPickupDate ?? r.pickupWindowStartDate);
  if (!wishDay) return null;
  const startAt = vnDayStart(wishDay);
  return { startAt, endAt: addCalendarMonthsVn(startAt, r.longTermPackageMonths ?? 1) };
}

function nonBookingTitle(sourceType: string): string {
  return (
    OCCUPANCY_SOURCE_TYPE_META[sourceType as OccupancySourceType]?.label ??
    OCCUPANCY_SOURCE_TYPE_META[OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE].label
  );
}
