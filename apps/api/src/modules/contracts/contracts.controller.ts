import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION } from '@xeprime/types';
import { BRANCH_SCOPED_RESOURCE, BranchScoped, CurrentTenant, CurrentUser, Realms, RequirePermissions, TenantScoped } from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { ContractDto } from './dto/contract.dto';
import { ContractsService } from './contracts.service';

/**
 * Hợp đồng thuê — tenant-scoped. Tạo cần `CONTRACT_MANAGE` (quản lý); xem/in cho `BOOKING_VIEW`
 * (nhân viên xem đơn cũng xem được HĐ). Tạo idempotent theo booking (bấm lại trả bản cũ).
 *
 * **Bộ CƠ BẢN từ 20/11/2026 (SR-245, sửa ADR 0027 điều 1)**: hợp đồng của TỪNG ĐƠN là giấy tờ
 * của chuyến, như tiền của từng đơn — chủ xe cá nhân (tuyến hoa hồng) lập/xem/in được y như gian
 * hàng, nên controller KHÔNG còn `@SubscriptionTrackOnly()` lẫn `@RequiresFeature(CONTRACTS)`.
 * Bên cho thuê trên hợp đồng đã đứng tên theo tuyến từ trước (ADR 0054, `resolveStorefront`).
 * Phiên hỗ trợ vẫn không vào được: không route nào khai `@SupportAction`.
 */
@ApiTags('contracts')
@Controller()
@TenantScoped()
@Realms(ACCOUNT_REALM.PARTNER)
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Post('bookings/:id/contract')
  @RequirePermissions(PERMISSION.CONTRACT_MANAGE)
  @ApiOperation({ summary: 'Tạo (hoặc lấy) hợp đồng từ một đơn thuê - idempotent' })
  @ApiCreatedResponse({ type: ContractDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') bookingId: string,
  ): Promise<ContractDto> {
    return this.contracts.createFromBooking(tenant.tenantId, user.id, bookingId);
  }

  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
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

  @BranchScoped(BRANCH_SCOPED_RESOURCE.CONTRACT)
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
