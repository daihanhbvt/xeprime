import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OCCUPANCY_SOURCE_TYPE, PERMISSION } from '@xeprime/types';
import { CurrentTenant, RequirePermissions, TenantScoped } from '../../common/decorators';
import type { TenantContext } from '../../common/types/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { OccupancyService } from './occupancy.service';
import {
  CalendarEventDto,
  CalendarRangeQueryDto,
  CalendarResourceDto,
  CheckConflictDto,
  CheckConflictResultDto,
} from './dto/calendar.dto';

@ApiTags('calendar')
@Controller('calendar')
@TenantScoped()
export class CalendarController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly occupancy: OccupancyService,
  ) {}

  @Get('resources')
  @RequirePermissions(PERMISSION.CALENDAR_VIEW)
  @ApiOperation({ summary: 'Danh sách xe làm hàng của resource timeline' })
  @ApiOkResponse({ type: CalendarResourceDto, isArray: true })
  async resources(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: CalendarRangeQueryDto,
  ): Promise<CalendarResourceDto[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        tenantId: tenant.tenantId,
        deletedAt: null,
        ...(query.vehicleType ? { vehicleType: query.vehicleType } : {}),
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: 'insensitive' } },
                { plateNumber: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        plateNumber: true,
        vehicleType: true,
        operationStatus: true,
      },
      orderBy: [{ vehicleType: 'asc' }, { name: 'asc' }],
    });

    return vehicles.map((v) => ({
      id: v.id,
      vehicleId: v.id,
      name: v.name,
      plateNumber: v.plateNumber,
      vehicleType: v.vehicleType,
      operationStatus: v.operationStatus,
    }));
  }

  /**
   * Đọc từ `vehicle_occupancies`, không đọc từ `bookings`.
   *
   * ADR 0006: occupancies là nguồn sự thật của "xe bận lúc nào" — nó gộp cả đơn thuê,
   * khoá xe và bảo dưỡng. Đọc từ `bookings` sẽ vẽ thiếu lịch bảo dưỡng lên màn hình.
   */
  @Get('events')
  @RequirePermissions(PERMISSION.CALENDAR_VIEW)
  @ApiOperation({ summary: 'Sự kiện chiếm lịch trong khoảng thời gian' })
  @ApiOkResponse({ type: CalendarEventDto, isArray: true })
  async events(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: CalendarRangeQueryDto,
  ): Promise<CalendarEventDto[]> {
    const occupancies = await this.prisma.vehicleOccupancy.findMany({
      where: {
        tenantId: tenant.tenantId,
        // Giao nhau với khoảng đang xem: bắt đầu trước khi khoảng kết thúc, và
        // kết thúc sau khi khoảng bắt đầu. Bỏ một trong hai vế là mất các event
        // kéo dài vắt qua biên.
        startAt: { lt: query.endAt },
        endAt: { gt: query.startAt },
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

    const bookingIds = occupancies
      .filter((o) => o.sourceType === OCCUPANCY_SOURCE_TYPE.BOOKING)
      .map((o) => o.sourceId);

    const bookings = bookingIds.length
      ? await this.prisma.booking.findMany({
          where: { id: { in: bookingIds }, tenantId: tenant.tenantId },
          select: { id: true, code: true, customerName: true, status: true },
        })
      : [];

    const byId = new Map(bookings.map((b) => [b.id, b]));

    return occupancies.map((o) => {
      const booking = byId.get(o.sourceId);
      return {
        id: o.id,
        resourceId: o.vehicleId,
        type: o.sourceType,
        title: booking ? `${booking.code} · ${booking.customerName}` : nonBookingTitle(o.sourceType),
        customerName: booking?.customerName ?? null,
        startAt: o.startAt.toISOString(),
        endAt: o.endAt.toISOString(),
        status: booking?.status ?? null,
        sourceId: o.sourceId,
      };
    });
  }

  /**
   * Preview trùng lịch cho UX — ADR 0006: KHÔNG bảo vệ gì. Kết quả có thể cũ ngay khi vừa
   * trả về; chốt chặn thật là exclusion constraint lúc tạo/sửa đơn. Chỉ để cảnh báo sớm.
   */
  @Post('check-conflict')
  @RequirePermissions(PERMISSION.CALENDAR_VIEW)
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

function nonBookingTitle(sourceType: string): string {
  return sourceType === OCCUPANCY_SOURCE_TYPE.MAINTENANCE ? 'Bảo dưỡng' : 'Xe bị khóa';
}
