import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentTenant, CurrentUser, RequirePermissions, TenantScoped } from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { ContractDto } from './dto/contract.dto';
import { ContractsService } from './contracts.service';

/**
 * Hợp đồng thuê — tenant-scoped. Tạo cần `CONTRACT_MANAGE` (quản lý); xem/in cho `BOOKING_VIEW`
 * (nhân viên xem đơn cũng xem được HĐ). Tạo idempotent theo booking (bấm lại trả bản cũ).
 */
@ApiTags('contracts')
@Controller()
@TenantScoped()
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Post('bookings/:id/contract')
  @RequirePermissions(PERMISSION.CONTRACT_MANAGE)
  @ApiOperation({ summary: 'Tạo (hoặc lấy) hợp đồng từ một đơn thuê — idempotent' })
  @ApiCreatedResponse({ type: ContractDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') bookingId: string,
  ): Promise<ContractDto> {
    return this.contracts.createFromBooking(tenant.tenantId, user.id, bookingId);
  }

  @Get('bookings/:id/contract')
  @RequirePermissions(PERMISSION.BOOKING_VIEW)
  @ApiOperation({ summary: 'Hợp đồng của một đơn (nếu đã tạo)' })
  @ApiOkResponse({ type: ContractDto })
  byBooking(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') bookingId: string,
  ): Promise<ContractDto> {
    return this.contracts.getByBooking(tenant.tenantId, bookingId);
  }

  @Get('contracts/:id')
  @RequirePermissions(PERMISSION.BOOKING_VIEW)
  @ApiOperation({ summary: 'Chi tiết một hợp đồng (để xem/in)' })
  @ApiOkResponse({ type: ContractDto })
  getOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<ContractDto> {
    return this.contracts.getById(tenant.tenantId, id);
  }
}
