import { BookingDriverHistoryItemDto } from '../drivers/dto/driver.dto';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, API_ERROR_CODE, PERMISSION, SUPPORT_CAPABILITY } from '@xeprime/types';
import {
  BRANCH_SCOPED_RESOURCE,
  BranchScoped,
  CurrentTenant,
  CurrentUser,
  Realms,
  RequirePermissions,
  SubscriptionTrackOnly,
  SupportAction,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import {
  AssignBookingDriverDto,
  BookingDetailDto,
  BookingListQueryDto,
  BookingPageDto,
  CreateBookingDto,
  TransitionBookingDto,
  UpdateBookingDeliveryFeeDto,
  UpdateBookingDto,
} from './dto/booking.dto';
import { BookingsService } from './bookings.service';

/**
 * Quản lý đơn thuê của gian hàng — tất cả tenant-scoped.
 *
 * `tenantId`/`userId` LUÔN lấy từ scope (`@CurrentTenant`/`@CurrentUser`), không nhận từ client
 * (CLAUDE.md mục 5). Chống trùng lịch nằm ở constraint DB (ADR 0006), không ở tầng app.
 */
@ApiTags('bookings')
@Controller('bookings')
@TenantScoped()
@Realms(ACCOUNT_REALM.PARTNER)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @RequirePermissions(PERMISSION.BOOKING_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.BOOKING_VIEW)
  @ApiOperation({ summary: 'Danh sách đơn thuê (phân trang, filter, sort)' })
  @ApiOkResponse({ type: BookingPageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: BookingListQueryDto,
  ): Promise<BookingPageDto> {
    return this.bookings.list(
      tenant.tenantId,
      query,
      tenant.allowedBranchIds,
    ) as Promise<BookingPageDto>;
  }

  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Get(':id')
  @RequirePermissions(PERMISSION.BOOKING_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.BOOKING_VIEW)
  @ApiOperation({ summary: 'Chi tiết một đơn thuê' })
  @ApiOkResponse({ type: BookingDetailDto })
  getOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<BookingDetailDto> {
    return this.bookings.getOne(tenant.tenantId, id);
  }

  /*
   * LẬP ĐƠN TAY chỉ dành cho gian hàng tuyến gói (26/10/2026). Đơn lập tay không qua chợ nên không
   * mang phí sàn `S` lẫn hoa hồng `H`: mở nó cho tuyến hoa hồng là cho chủ xe kéo khách từ chợ ra
   * ngoài rồi ghi lại chuyến với `H = 0`, và nó còn tự ghi sổ khách — công cụ của gói (ADR 0027
   * điều 1). Chủ xe cá nhân giữ lịch cho chuyến ngoài chợ bằng KHOÁ LỊCH. Mọi route còn lại của
   * controller mở cho cả hai tuyến: đơn đã có (từ chợ) là việc vận hành của bậc cơ bản.
   */
  @Post()
  @SubscriptionTrackOnly()
  @RequirePermissions(PERMISSION.BOOKING_CREATE)
  @ApiOperation({ summary: 'Tạo đơn thuê (giữ chỗ lịch, chặn trùng bằng constraint DB)' })
  @ApiCreatedResponse({ type: BookingDetailDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingDto,
  ): Promise<BookingDetailDto> {
    return this.bookings.create(tenant.tenantId, user.id, dto);
  }

  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Patch(':id')
  @RequirePermissions(PERMISSION.BOOKING_UPDATE)
  @ApiOperation({ summary: 'Sửa đơn (đổi khung giờ sẽ reschedule lịch)' })
  @ApiOkResponse({ type: BookingDetailDto })
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateBookingDto,
  ): Promise<BookingDetailDto> {
    return this.bookings.update(tenant.tenantId, id, dto);
  }

  /**
   * Chốt phí giao nhận sau khi chủ xe và khách đã thống nhất ngoài ứng dụng (Wave 9).
   *
   * Endpoint riêng thay vì dùng `PATCH :id`: việc này cần vết audit riêng (ai đổi, từ bao nhiêu
   * sang bao nhiêu) và tổng tiền phải do server tính lại. Không có bước khách xác nhận.
   */
  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Patch(':id/delivery-fee')
  @RequirePermissions(PERMISSION.BOOKING_UPDATE)
  @ApiOperation({ summary: 'Cập nhật phí giao nhận của đơn (server tính lại tổng, có audit)' })
  @ApiOkResponse({ type: BookingDetailDto })
  updateDeliveryFee(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBookingDeliveryFeeDto,
  ): Promise<BookingDetailDto> {
    return this.bookings.updateDeliveryFee(tenant.tenantId, id, user.id, dto);
  }

  /** Gán/bỏ gán tài xế (17/08) — endpoint riêng vì cần vết audit riêng (ai gán, gán ai). */
  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Patch(':id/driver')
  @RequirePermissions(PERMISSION.BOOKING_UPDATE)
  @ApiOperation({
    summary: 'Gán/bỏ gán tài xế liên kết cho đơn (có audit)',
    description:
      '`driverId`: gán tài xế liên kết (lượt chờ tài xế nhận, ADR 0063); `null` = bỏ gán (gỡ cả tài xế ngoài hệ thống còn trên đơn cũ). ' +
      '`externalDriver` đã bỏ (ADR 0074 điều 4) ⇒ 422 `EXTERNAL_DRIVER_NOT_SUPPORTED`. ' +
      'Chỉ đơn `with_driver` chưa giao xe: 422 `DRIVER_ASSIGN_SERVICE_NOT_SUPPORTED`, 409 `DRIVER_ASSIGNMENT_LOCKED`.',
  })
  @ApiOkResponse({ type: BookingDetailDto })
  assignDriver(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignBookingDriverDto,
  ): Promise<BookingDetailDto> {
    // Tài xế ngoài hệ thống đã bỏ (ADR 0074 điều 4) — app cũ còn gửi khoá này thì nói đúng lý do.
    if (dto.externalDriver !== undefined) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODE.EXTERNAL_DRIVER_NOT_SUPPORTED,
        message: 'XePrime không còn nhận tài xế ngoài hệ thống — gán tài xế liên kết',
      });
    }
    return this.bookings.assignDriver(tenant.tenantId, id, user.id, dto.driverId ?? null);
  }

  /** Lịch sử gán tài xế của đơn (ADR 0063) — mỗi lượt một dòng, cũ nhất trước. */
  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Get(':id/driver-history')
  @RequirePermissions(PERMISSION.BOOKING_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.BOOKING_VIEW)
  @ApiOperation({ summary: 'Lịch sử gán tài xế của một đơn thuê' })
  @ApiOkResponse({ type: [BookingDriverHistoryItemDto] })
  driverHistory(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<BookingDriverHistoryItemDto[]> {
    return this.bookings.driverHistory(tenant.tenantId, id);
  }

  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Post(':id/transition')
  @RequirePermissions(PERMISSION.BOOKING_UPDATE)
  @ApiOperation({
    summary:
      'Chuyển trạng thái đơn (validate canTransitionBooking; huỷ/no_show bắt buộc có lý do, ghi vào audit)',
  })
  @ApiOkResponse({ type: BookingDetailDto })
  transition(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TransitionBookingDto,
  ): Promise<BookingDetailDto> {
    return this.bookings.transition(tenant.tenantId, id, user.id, dto);
  }
}
