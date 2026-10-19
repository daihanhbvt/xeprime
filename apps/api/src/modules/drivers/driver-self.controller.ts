import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM } from '@xeprime/types';
import { CurrentUser, Realms } from '../../common/decorators';
import { OkResultDto } from '../../common/dto/api-response.dto';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { DriverSelfService } from './driver-self.service';
import { DriversService } from './drivers.service';
import {
  DriverPendingCountsDto,
  DriverTripDetailDto,
  DriverTripListQueryDto,
  DriverTripPageDto,
  MyDriverLinkListQueryDto,
  MyDriverLinkPageDto,
} from './dto/driver.dto';

/**
 * Tài khoản KHÁCH trong vai TÀI XẾ (ADR 0063) — chỉ realm khách, không tenant-scoped.
 *
 * Không tham số nào nhận danh tính: người lái luôn là `userId` của phiên. Không có đường đổi
 * trạng thái ĐƠN ở đây — tài xế chỉ nhận/từ chối LƯỢT GÁN của chính mình; giao nhận xe, huỷ,
 * khách không đến vẫn là việc của bên thuê.
 */
@ApiTags('driver-self')
@Controller('driver')
@Realms(ACCOUNT_REALM.CUSTOMER)
export class DriverSelfController {
  constructor(
    private readonly self: DriverSelfService,
    private readonly drivers: DriversService,
  ) {}

  @Get('links')
  @ApiOperation({ summary: 'Nơi tôi làm tài xế — lời mời + liên kết (hoặc lịch sử)' })
  @ApiOkResponse({ type: MyDriverLinkPageDto })
  links(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MyDriverLinkListQueryDto,
  ): Promise<MyDriverLinkPageDto> {
    return this.self.links(user.id, query);
  }

  @Get('pending-counts')
  @ApiOperation({ summary: 'Số lời mời và chuyến đang chờ tôi trả lời' })
  @ApiOkResponse({ type: DriverPendingCountsDto })
  pendingCounts(@CurrentUser() user: AuthenticatedUser): Promise<DriverPendingCountsDto> {
    return this.self.pendingCounts(user.id);
  }

  @Post('links/:id/accept')
  @ApiOperation({ summary: 'Chấp nhận lời mời làm tài xế' })
  @ApiOkResponse({ type: OkResultDto })
  async acceptLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.drivers.respondToInvite(user.id, id, true);
    return { ok: true };
  }

  @Post('links/:id/decline')
  @ApiOperation({ summary: 'Từ chối lời mời làm tài xế' })
  @ApiOkResponse({ type: OkResultDto })
  async declineLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.drivers.respondToInvite(user.id, id, false);
    return { ok: true };
  }

  @Post('links/:id/leave')
  @ApiOperation({
    summary: 'Ngừng làm tài xế cho bên này',
    description:
      'Chuyến chưa nhận xe được trả lại bên thuê. Đang chạy chuyến thì 409 `DRIVER_HAS_ACTIVE_TRIP`.',
  })
  @ApiOkResponse({ type: OkResultDto })
  async leave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.drivers.leave(user.id, id);
    return { ok: true };
  }

  @Get('trips')
  @ApiOperation({ summary: 'Chuyến tôi lái (sắp tới / đã qua, phân trang)' })
  @ApiOkResponse({ type: DriverTripPageDto })
  trips(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DriverTripListQueryDto,
  ): Promise<DriverTripPageDto> {
    return this.self.trips(user.id, query);
  }

  @Get('trips/:id')
  @ApiOperation({ summary: 'Chi tiết một chuyến tôi được gán (404 nếu không phải của tôi)' })
  @ApiOkResponse({ type: DriverTripDetailDto })
  trip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DriverTripDetailDto> {
    return this.self.trip(user.id, id);
  }

  @Post('trips/:id/accept')
  @ApiOperation({ summary: 'Nhận chuyến được gán' })
  @ApiOkResponse({ type: DriverTripDetailDto })
  async acceptTrip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DriverTripDetailDto> {
    await this.drivers.respondToTrip(user.id, id, true);
    return this.self.trip(user.id, id);
  }

  @Post('trips/:id/decline')
  @ApiOperation({
    summary: 'Từ chối chuyến được gán',
    description:
      'Đơn quay về chưa có tài xế và bên thuê được báo. Chuyến biến khỏi danh sách của tôi.',
  })
  @ApiOkResponse({ type: OkResultDto })
  async declineTrip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.drivers.respondToTrip(user.id, id, false);
    return { ok: true };
  }
}
