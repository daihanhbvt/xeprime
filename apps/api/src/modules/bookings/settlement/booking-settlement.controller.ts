import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  TenantScoped,
} from '../../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../../common/types/request-context';
import {
  BookingSettlementDto,
  CorrectDepositRefundDto,
  RecordDepositRefundDto,
  SaveSurchargeDto,
  VoidSurchargeDto,
} from './dto/settlement.dto';
import { SettlementService } from './settlement.service';

/**
 * Quyết toán cuối chuyến của một đơn (Wave 10): phát sinh + hoàn cọc thủ công.
 *
 * Phân mức quyền theo mức thiệt hại, dùng lại đúng bộ quyền tài chính đã có:
 *  - **đọc** đi cùng quyền xem đơn — tiền của đơn (tổng, cọc) vốn đã hiển thị ở đó;
 *  - **ghi phát sinh / đánh dấu hoàn cọc** cần `payments.record` (nhân viên quầy có);
 *  - **sửa bản ghi hoàn cọc đã có** cần `payments.void` — quyền chỉ quản lý trở lên mới có,
 *    vì đó là sửa một bằng chứng đã chốt.
 *
 * `tenantId`/`userId` luôn từ scope, không nhận từ client (CLAUDE.md mục 5).
 */
@ApiTags('booking-settlement')
@Controller('bookings/:id')
@TenantScoped()
export class BookingSettlementController {
  constructor(private readonly settlement: SettlementService) {}

  @Get('settlement')
  @RequirePermissions(PERMISSION.BOOKING_VIEW)
  @ApiOperation({ summary: 'Quyết toán đơn: phát sinh, cọc đã thu, đề xuất hoàn' })
  @ApiOkResponse({ type: BookingSettlementDto })
  get(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<BookingSettlementDto> {
    return this.settlement.get(tenant.tenantId, id);
  }

  @Post('surcharges')
  @RequirePermissions(PERMISSION.PAYMENT_RECORD)
  @ApiOperation({ summary: 'Thêm một khoản phát sinh (không sinh giao dịch)' })
  @ApiOkResponse({ type: BookingSettlementDto })
  addSurcharge(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveSurchargeDto,
  ): Promise<BookingSettlementDto> {
    return this.settlement.addSurcharge(tenant.tenantId, id, user.id, dto);
  }

  @Patch('surcharges/:surchargeId')
  @RequirePermissions(PERMISSION.PAYMENT_RECORD)
  @ApiOperation({ summary: 'Sửa một khoản phát sinh (audit before/after)' })
  @ApiOkResponse({ type: BookingSettlementDto })
  updateSurcharge(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('surchargeId') surchargeId: string,
    @Body() dto: SaveSurchargeDto,
  ): Promise<BookingSettlementDto> {
    return this.settlement.updateSurcharge(tenant.tenantId, id, surchargeId, user.id, dto);
  }

  /** Huỷ MỀM kèm lý do — bằng chứng "đã từng trừ rồi rút lại" phải còn. */
  @Delete('surcharges/:surchargeId')
  @RequirePermissions(PERMISSION.PAYMENT_RECORD)
  @ApiOperation({ summary: 'Gỡ một khoản phát sinh (huỷ mềm, có lý do + audit)' })
  @ApiOkResponse({ type: BookingSettlementDto })
  voidSurcharge(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('surchargeId') surchargeId: string,
    @Body() dto: VoidSurchargeDto,
  ): Promise<BookingSettlementDto> {
    return this.settlement.voidSurcharge(tenant.tenantId, id, surchargeId, user.id, dto);
  }

  /**
   * Ghi nhận CHỦ XE ĐÃ HOÀN TIỀN — tiền đi bằng chuyển khoản/tiền mặt NGOÀI hệ thống.
   * XePrime không có cổng thanh toán; endpoint này chỉ lưu lại trạng thái đó.
   */
  @Post('settlement/refund')
  @RequirePermissions(PERMISSION.PAYMENT_RECORD)
  @ApiOperation({ summary: 'Đánh dấu đã hoàn cọc (ghi nhận thủ công, không chuyển tiền)' })
  @ApiOkResponse({ type: BookingSettlementDto })
  recordRefund(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecordDepositRefundDto,
  ): Promise<BookingSettlementDto> {
    return this.settlement.recordRefund(tenant.tenantId, id, user.id, dto);
  }

  /** Sửa bản ghi đã hoàn — quyền cao hơn, lý do bắt buộc, audit giữ cả giá trị cũ. */
  @Patch('settlement/refund')
  @RequirePermissions(PERMISSION.PAYMENT_VOID)
  @ApiOperation({ summary: 'Điều chỉnh bản ghi hoàn cọc (quyền cao, bắt buộc lý do)' })
  @ApiOkResponse({ type: BookingSettlementDto })
  correctRefund(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CorrectDepositRefundDto,
  ): Promise<BookingSettlementDto> {
    return this.settlement.correctRefund(tenant.tenantId, id, user.id, dto);
  }
}
