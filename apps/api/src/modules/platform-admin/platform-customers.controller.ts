import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, Realms, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  CustomerContactDto,
  CustomerLockDto,
  PlatformCustomerDetailDto,
  PlatformCustomerListQueryDto,
  PlatformCustomerPageDto,
} from './dto/platform-customer.dto';
import { PlatformCustomersService } from './platform-customers.service';

/**
 * Tra cứu khách thuê toàn hệ thống (Phase 7 — build plan §11.1: "Tra cứu có masking PII").
 * SĐT/email luôn trả bản đã che; bỏ che là endpoint riêng, quyền riêng, ghi audit. Thao tác ghi
 * duy nhất là khoá / mở khoá tài khoản (quyền `platform.customers.lock`, đợt rà Admin 16/11/2026).
 */
@ApiTags('platform-customers')
@Controller('platform/customers')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_CUSTOMER_VIEW)
@Realms(ACCOUNT_REALM.PLATFORM)
export class PlatformCustomersController {
  constructor(private readonly customers: PlatformCustomersService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách khách thuê (phân trang, tra theo tên/SĐT/email)' })
  @ApiOkResponse({ type: PlatformCustomerPageDto })
  list(@Query() query: PlatformCustomerListQueryDto): Promise<PlatformCustomerPageDto> {
    return this.customers.list(query) as Promise<PlatformCustomerPageDto>;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một khách (kèm 10 yêu cầu thuê gần nhất, PII đã che)' })
  @ApiOkResponse({ type: PlatformCustomerDetailDto })
  getOne(@Param('id') id: string): Promise<PlatformCustomerDetailDto> {
    return this.customers.getOne(id);
  }

  // Liệt kê lại quyền đọc: `RequirePermissions` ở handler GHI ĐÈ cấp class (getAllAndOverride).
  @Post(':id/contact')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.PLATFORM_CUSTOMER_VIEW, PERMISSION.PLATFORM_CUSTOMER_PII_VIEW)
  @ApiOperation({ summary: 'Xem SĐT/email khách đầy đủ (ghi audit từng lần xem)' })
  @ApiOkResponse({ type: CustomerContactDto })
  revealContact(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CustomerContactDto> {
    return this.customers.revealContact(id, user.id);
  }

  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.PLATFORM_CUSTOMER_VIEW, PERMISSION.PLATFORM_CUSTOMER_LOCK)
  @ApiOperation({
    summary: 'Khoá tài khoản khách: thu hồi mọi phiên web + app, chặn đăng nhập (lý do bắt buộc)',
    description:
      'Một transaction: `active → locked` + thu hồi phiên + audit `customer.lock`. Không tự huỷ yêu cầu/đơn đang có. ' +
      '409 `CUSTOMER_ACCOUNT_STATE_CONFLICT` khi tài khoản không còn ở trạng thái hoạt động.',
  })
  @ApiOkResponse({ type: PlatformCustomerDetailDto })
  lock(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CustomerLockDto,
  ): Promise<PlatformCustomerDetailDto> {
    return this.customers.lock(id, user.id, dto.reason);
  }

  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.PLATFORM_CUSTOMER_VIEW, PERMISSION.PLATFORM_CUSTOMER_LOCK)
  @ApiOperation({
    summary: 'Mở khoá tài khoản khách (lý do bắt buộc, ghi audit)',
    description: '409 `CUSTOMER_ACCOUNT_STATE_CONFLICT` khi tài khoản không ở trạng thái khoá.',
  })
  @ApiOkResponse({ type: PlatformCustomerDetailDto })
  unlock(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CustomerLockDto,
  ): Promise<PlatformCustomerDetailDto> {
    return this.customers.unlock(id, user.id, dto.reason);
  }
}
