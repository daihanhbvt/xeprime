import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { CustomersService } from './customers.service';
import {
  CreateCustomerNoteDto,
  CreateTenantCustomerDto,
  CustomerBookingListQueryDto,
  CustomerBookingPageDto,
  CustomerNoteDto,
  CustomerNotePageDto,
  TenantCustomerDetailDto,
  TenantCustomerListQueryDto,
  TenantCustomerPageDto,
  TenantCustomerSummaryDto,
  UpdateCustomerRiskDto,
  UpdateTenantCustomerDto,
} from './dto/customer.dto';

/**
 * Sổ khách của GIAN HÀNG (gap S-01) — tenant-scoped, `tenantId` từ membership của phiên.
 *
 * KHÔNG phải bản sao của `/platform/customers`: đó là màn giám sát xuyên tenant của nền tảng,
 * còn đây là tài sản riêng của một gian hàng. Hai bề mặt không chia sẻ endpoint, không chia sẻ
 * quyền, và không nhìn thấy dữ liệu của nhau.
 *
 * Route theo NGỮ NGHĨA thay vì một PATCH khổng lồ: đổi mức rủi ro, lưu trữ và khôi phục là ba
 * quyết định khác nhau, cần ba quyền khác nhau và ba dòng audit khác nhau.
 */
@ApiTags('customers')
@Controller('customers')
@TenantScoped()
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions(PERMISSION.CUSTOMER_VIEW)
  @ApiOperation({
    summary: 'Sổ khách của gian hàng (tìm kiếm / lọc nhóm / sắp xếp / phân trang)',
    description:
      'Trường tiền trả `null` khi thiếu `finance.view`; lọc `has_debt` và sắp xếp theo ' +
      'tiền bị từ chối 403 thay vì âm thầm bỏ qua.',
  })
  @ApiOkResponse({ type: TenantCustomerPageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: TenantCustomerListQueryDto,
  ): Promise<TenantCustomerPageDto> {
    return this.customers.list(tenant.tenantId, query, canViewFinance(tenant));
  }

  @Get('summary')
  @RequirePermissions(PERMISSION.CUSTOMER_VIEW)
  @ApiOperation({ summary: 'Dải chỉ số đầu trang sổ khách' })
  @ApiOkResponse({ type: TenantCustomerSummaryDto })
  summary(@CurrentTenant() tenant: TenantContext): Promise<TenantCustomerSummaryDto> {
    return this.customers.summary(tenant.tenantId, canViewFinance(tenant));
  }

  @Post()
  @RequirePermissions(PERMISSION.CUSTOMER_MANAGE)
  @ApiOperation({
    summary: 'Thêm khách vào sổ',
    description:
      'SĐT bắt buộc và là định danh — trùng với khách khác trả 409 CUSTOMER_PHONE_DUPLICATE.',
  })
  @ApiCreatedResponse({ type: TenantCustomerDetailDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTenantCustomerDto,
  ): Promise<TenantCustomerDetailDto> {
    return this.customers.create(
      tenant.tenantId,
      user.id,
      dto,
      canViewFinance(tenant),
      canViewBookings(tenant),
    );
  }

  @Get(':id')
  @RequirePermissions(PERMISSION.CUSTOMER_VIEW)
  @ApiOperation({ summary: 'Hồ sơ khách + số liệu tổng hợp + hoạt động gần đây' })
  @ApiOkResponse({ type: TenantCustomerDetailDto })
  detail(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<TenantCustomerDetailDto> {
    return this.customers.detail(tenant.tenantId, id, detailScope(tenant));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSION.CUSTOMER_MANAGE)
  @ApiOperation({
    summary: 'Sửa hồ sơ khách',
    description:
      'Không đụng tới snapshot tên/SĐT trên đơn thuê và yêu cầu cũ — đó là sự thật của giao dịch.',
  })
  @ApiOkResponse({ type: TenantCustomerDetailDto })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantCustomerDto,
  ): Promise<TenantCustomerDetailDto> {
    return this.customers.update(tenant.tenantId, user.id, id, dto, detailScope(tenant));
  }

  @Post(':id/archive')
  @RequirePermissions(PERMISSION.CUSTOMER_MANAGE)
  @ApiOperation({ summary: 'Lưu trữ hồ sơ khách (soft — lịch sử đơn giữ nguyên)' })
  @ApiOkResponse({ type: TenantCustomerDetailDto })
  archive(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<TenantCustomerDetailDto> {
    return this.customers.setArchived(tenant.tenantId, user.id, id, true, detailScope(tenant));
  }

  @Post(':id/restore')
  @RequirePermissions(PERMISSION.CUSTOMER_MANAGE)
  @ApiOperation({ summary: 'Khôi phục hồ sơ khách đã lưu trữ' })
  @ApiOkResponse({ type: TenantCustomerDetailDto })
  restore(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<TenantCustomerDetailDto> {
    return this.customers.setArchived(tenant.tenantId, user.id, id, false, detailScope(tenant));
  }

  @Post(':id/risk')
  @RequirePermissions(PERMISSION.CUSTOMER_MANAGE_RISK)
  @ApiOperation({
    summary: 'Đổi mức rủi ro của khách (bắt buộc lý do khi khác `normal`)',
    description:
      '`blocked` chặn yêu cầu/đơn MỚI ở gian hàng này; đơn và yêu cầu đang có giữ nguyên. ' +
      'Mọi lần đổi đều ghi audit kèm giá trị cũ, giá trị mới và lý do.',
  })
  @ApiOkResponse({ type: TenantCustomerDetailDto })
  updateRisk(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerRiskDto,
  ): Promise<TenantCustomerDetailDto> {
    return this.customers.updateRisk(tenant.tenantId, user.id, id, dto, detailScope(tenant));
  }

  /**
   * Lịch sử thuê đòi CẢ HAI quyền.
   *
   * `customers.view` một mình không được phép mở dữ liệu đơn thuê: một vai trò chỉ được cấp
   * quyền tra cứu khách sẽ vô tình đọc được toàn bộ đơn của gian hàng qua đường này.
   */
  @Get(':id/bookings')
  @RequirePermissions(PERMISSION.CUSTOMER_VIEW, PERMISSION.BOOKING_VIEW)
  @ApiOperation({ summary: 'Lịch sử thuê của khách (phân trang)' })
  @ApiOkResponse({ type: CustomerBookingPageDto })
  bookings(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Query() query: CustomerBookingListQueryDto,
  ): Promise<CustomerBookingPageDto> {
    return this.customers.bookings(tenant.tenantId, id, query, canViewFinance(tenant));
  }

  @Get(':id/notes')
  @RequirePermissions(PERMISSION.CUSTOMER_VIEW)
  @ApiOperation({ summary: 'Ghi chú nội bộ về khách (phân trang)' })
  @ApiOkResponse({ type: CustomerNotePageDto })
  notes(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Query() query: CustomerBookingListQueryDto,
  ): Promise<CustomerNotePageDto> {
    return this.customers.listNotes(tenant.tenantId, id, query);
  }

  @Post(':id/notes')
  @RequirePermissions(PERMISSION.CUSTOMER_MANAGE)
  @ApiOperation({ summary: 'Thêm ghi chú nội bộ (bản ghi bất biến, có tác giả + thời điểm)' })
  @ApiCreatedResponse({ type: CustomerNoteDto })
  addNote(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateCustomerNoteDto,
  ): Promise<CustomerNoteDto> {
    return this.customers.addNote(tenant.tenantId, user.id, id, dto);
  }

  @Delete(':id/notes/:noteId')
  @RequirePermissions(PERMISSION.CUSTOMER_MANAGE)
  @ApiOperation({ summary: 'Gỡ ghi chú nội bộ (soft-delete)' })
  async removeNote(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
  ): Promise<{ ok: true }> {
    await this.customers.removeNote(tenant.tenantId, user.id, id, noteId);
    return { ok: true };
  }
}

/** Tiền là quyền riêng — đọc từ membership của phiên, không bao giờ từ query/body. */
function canViewFinance(tenant: TenantContext): boolean {
  return tenant.permissions.includes(PERMISSION.FINANCE_VIEW);
}

function canViewBookings(tenant: TenantContext): boolean {
  return tenant.permissions.includes(PERMISSION.BOOKING_VIEW);
}

function detailScope(tenant: TenantContext) {
  return { canViewFinance: canViewFinance(tenant), canViewBookings: canViewBookings(tenant) };
}
