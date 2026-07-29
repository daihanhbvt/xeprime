import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentTenant, CurrentUser, RequirePermissions, TenantScoped } from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { BookingDetailDto } from '../bookings/dto/booking.dto';
import { PaymentDto, RecordPaymentDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';

/**
 * Ghi nhận thanh toán đơn — tenant-scoped. Bookkeeping thủ công (XePrime không trung gian thu
 * tiền). `PaymentsService` là writer duy nhất của `booking.paid_amount`.
 */
@ApiTags('payments')
@Controller()
@TenantScoped()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('bookings/:id/payments')
  @RequirePermissions(PERMISSION.PAYMENT_RECORD)
  @ApiOperation({ summary: 'Ghi nhận một lần thu tiền cho đơn (cập nhật đã trả/còn nợ)' })
  @ApiCreatedResponse({ type: BookingDetailDto })
  record(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') bookingId: string,
    @Body() dto: RecordPaymentDto,
  ): Promise<BookingDetailDto> {
    return this.payments.recordForBooking(tenant.tenantId, user.id, bookingId, dto);
  }

  @Get('bookings/:id/payments')
  @RequirePermissions(PERMISSION.BOOKING_VIEW)
  @ApiOperation({ summary: 'Lịch sử thu tiền của một đơn' })
  @ApiOkResponse({ type: [PaymentDto] })
  history(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') bookingId: string,
  ): Promise<PaymentDto[]> {
    return this.payments.listForBooking(tenant.tenantId, bookingId);
  }

  @Post('payments/:id/void')
  @RequirePermissions(PERMISSION.PAYMENT_VOID)
  @ApiOperation({ summary: 'Huỷ/hoàn một lần thu (trừ lại đã trả)' })
  @ApiOkResponse({ type: PaymentDto })
  void(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') paymentId: string,
  ): Promise<PaymentDto> {
    return this.payments.voidPayment(tenant.tenantId, user.id, paymentId);
  }
}
