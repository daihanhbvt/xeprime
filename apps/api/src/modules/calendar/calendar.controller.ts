import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OCCUPANCY_SOURCE_TYPE, PERMISSION } from '@xeprime/types';
import { CurrentTenant, RequirePermissions, TenantScoped } from '../../common/decorators';
import type { TenantContext } from '../../common/types/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { CalendarEventDto, CalendarRangeQueryDto, CalendarResourceDto } from './dto/calendar.dto';

@ApiTags('calendar')
@Controller('calendar')
@TenantScoped()
export class CalendarController {
  constructor(private readonly prisma: PrismaService) {}

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
}

function nonBookingTitle(sourceType: string): string {
  return sourceType === OCCUPANCY_SOURCE_TYPE.MAINTENANCE ? 'Bảo dưỡng' : 'Xe bị khóa';
}
