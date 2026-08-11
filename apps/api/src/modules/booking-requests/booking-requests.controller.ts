import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { DeliveryQuotePreviewDto, SaveDeliveryQuoteDto } from '../pricing/dto/pricing.dto';
import {
  BookingRequestDto,
  BookingRequestListQueryDto,
  BookingRequestPageDto,
  RejectBookingRequestDto,
} from './dto/booking-request.dto';
import { BookingRequestsService } from './booking-requests.service';

/**
 * Inbox yêu cầu đặt xe của gian hàng — tenant-scoped. Duyệt tạo Booking (giữ chỗ lịch,
 * chặn trùng bằng constraint DB — ADR 0006). `tenantId`/`userId` từ scope, không nhận client.
 */
@ApiTags('booking-requests')
@Controller('booking-requests')
@TenantScoped()
export class BookingRequestsController {
  constructor(private readonly requests: BookingRequestsService) {}

  @Get()
  @RequirePermissions(PERMISSION.BOOKING_REQUEST_VIEW)
  @ApiOperation({ summary: 'Danh sách yêu cầu đặt xe (phân trang, filter trạng thái)' })
  @ApiOkResponse({ type: BookingRequestPageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: BookingRequestListQueryDto,
  ): Promise<BookingRequestPageDto> {
    return this.requests.list(tenant.tenantId, query) as Promise<BookingRequestPageDto>;
  }

  @Get(':id')
  @RequirePermissions(PERMISSION.BOOKING_REQUEST_VIEW)
  @ApiOperation({ summary: 'Chi tiết một yêu cầu' })
  @ApiOkResponse({ type: BookingRequestDto })
  getOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<BookingRequestDto> {
    return this.requests.getOne(tenant.tenantId, id);
  }

  @Post(':id/approve')
  @RequirePermissions(PERMISSION.BOOKING_REQUEST_APPROVE)
  @ApiOperation({ summary: 'Duyệt yêu cầu → tạo đơn thuê (giữ chỗ lịch)' })
  @ApiOkResponse({ type: BookingRequestDto })
  approve(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<BookingRequestDto> {
    return this.requests.approve(tenant.tenantId, user.id, id);
  }

  @Post(':id/reject')
  @RequirePermissions(PERMISSION.BOOKING_REQUEST_APPROVE)
  @ApiOperation({ summary: 'Từ chối yêu cầu' })
  @ApiOkResponse({ type: BookingRequestDto })
  reject(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectBookingRequestDto,
  ): Promise<BookingRequestDto> {
    return this.requests.reject(tenant.tenantId, user.id, id, dto.reason);
  }

  /** Preview báo giá — tính bằng PricingService, KHÔNG lưu; drawer cập nhật khi shop gõ. */
  @Post(':id/delivery-quote/preview')
  @RequirePermissions(PERMISSION.BOOKING_REQUEST_APPROVE)
  @ApiOperation({ summary: 'Preview báo giá giao nhận theo khoảng cách (không lưu)' })
  @ApiOkResponse({ type: DeliveryQuotePreviewDto })
  previewDeliveryQuote(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: SaveDeliveryQuoteDto,
  ): Promise<DeliveryQuotePreviewDto> {
    return this.requests.deliveryQuotePreview(tenant.tenantId, id, dto);
  }

  /**
   * Chốt báo giá giao nhận cho yêu cầu. Trong bán kính: phí tự tính theo bậc (input phí bị bỏ
   * qua). Ngoài bán kính: phí nhập tay bắt buộc. Yêu cầu có giao tận nơi phải có báo giá này
   * trước khi duyệt được (DELIVERY_QUOTE_REQUIRED).
   */
  @Post(':id/delivery-quote')
  @RequirePermissions(PERMISSION.BOOKING_REQUEST_APPROVE)
  @ApiOperation({ summary: 'Lưu báo giá giao nhận cho yêu cầu (audit)' })
  @ApiOkResponse({ type: BookingRequestDto })
  saveDeliveryQuote(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveDeliveryQuoteDto,
  ): Promise<BookingRequestDto> {
    return this.requests.saveDeliveryQuote(tenant.tenantId, user.id, id, dto);
  }
}
