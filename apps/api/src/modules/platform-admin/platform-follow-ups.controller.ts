import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, Realms, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  FollowUpAssigneeDto,
  FollowUpContactDto,
  PlatformFollowUpDto,
  PlatformFollowUpListQueryDto,
  PlatformFollowUpPageDto,
  UpdateFollowUpDto,
} from './dto/platform-follow-up.dto';
import { PlatformFollowUpsService } from './platform-follow-ups.service';

/**
 * Tab "Cần chăm sóc" của Đơn thuê toàn hệ thống (ADR 0070): khách mất đơn để sale gọi lại.
 * Xem cần `platform.bookings.view`; ghi kết quả cần `platform.sales_followups.manage`.
 */
@ApiTags('platform-bookings')
@Controller('platform/follow-ups')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_BOOKING_VIEW)
@Realms(ACCOUNT_REALM.PLATFORM)
export class PlatformFollowUpsController {
  constructor(private readonly followUps: PlatformFollowUpsService) {}

  @Get()
  @ApiOperation({ summary: 'Khách mất đơn cần chăm sóc — mới kết thúc trước' })
  @ApiOkResponse({ type: PlatformFollowUpPageDto })
  list(
    @Query() query: PlatformFollowUpListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PlatformFollowUpPageDto> {
    return this.followUps.list(query, user.id) as Promise<PlatformFollowUpPageDto>;
  }

  // Khai TRƯỚC `:id` để Express không nuốt "assignees" làm một id.
  @Get('assignees')
  @RequirePermissions(PERMISSION.PLATFORM_BOOKING_VIEW, PERMISSION.PLATFORM_SALES_FOLLOWUP_MANAGE)
  @ApiOperation({ summary: 'Nhân sự giao được làm phụ trách (có quyền chăm sóc khách)' })
  @ApiOkResponse({ type: [FollowUpAssigneeDto] })
  listAssignees(): Promise<FollowUpAssigneeDto[]> {
    return this.followUps.listAssignees();
  }

  // `RequirePermissions` ở handler GHI ĐÈ cấp class — liệt kê lại quyền xem.
  @Patch(':id')
  @RequirePermissions(PERMISSION.PLATFORM_BOOKING_VIEW, PERMISSION.PLATFORM_SALES_FOLLOWUP_MANAGE)
  @ApiOperation({ summary: 'Ghi trạng thái / ghi chú / người phụ trách chăm sóc (ghi audit)' })
  @ApiOkResponse({ type: PlatformFollowUpDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFollowUpDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PlatformFollowUpDto> {
    return this.followUps.update(id, user.id, dto);
  }

  @Post(':id/contact')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.PLATFORM_BOOKING_VIEW, PERMISSION.PLATFORM_CUSTOMER_PII_VIEW)
  @ApiOperation({ summary: 'Xem SĐT/email khách đầy đủ để gọi lại (ghi audit từng lần xem)' })
  @ApiOkResponse({ type: FollowUpContactDto })
  revealContact(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FollowUpContactDto> {
    return this.followUps.revealContact(id, user.id);
  }
}
