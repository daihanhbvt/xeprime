import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  CustomerContactDto,
  PlatformCustomerDetailDto,
  PlatformCustomerListQueryDto,
  PlatformCustomerPageDto,
} from './dto/platform-customer.dto';
import { PlatformCustomersService } from './platform-customers.service';

/**
 * Tra cứu khách thuê toàn hệ thống (Phase 7 — build plan §11.1: "Tra cứu có masking PII").
 * CHỈ ĐỌC. SĐT/email luôn trả bản đã che; bỏ che là endpoint riêng, quyền riêng, ghi audit.
 */
@ApiTags('platform-customers')
@Controller('platform/customers')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_CUSTOMER_VIEW)
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
}
