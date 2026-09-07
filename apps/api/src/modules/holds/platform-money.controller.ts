import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PERMISSION, type BookingHoldOutcome } from '@xeprime/types';
import { CurrentUser, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { BookingHoldsService } from './booking-holds.service';
import {
  DailyReconciliationDto,
  MarkRefundPaidDto,
  PlatformHoldListQueryDto,
  PlatformHoldPageDto,
  PlatformHoldRefundListQueryDto,
  PlatformHoldRefundPageDto,
  RejectRefundDto,
  SettleHoldDto,
} from './dto/hold.dto';
import { HoldSettlementService } from './hold-settlement.service';

/**
 * MONEY OPERATIONS của nền tảng — Gap Analysis §3.B, ADR 0028 release gate 6–7 (R3).
 *
 * `@PlatformOnly` + `platform.money.manage` (finance_admin). Bốn bề mặt: hàng đợi giữ chỗ,
 * chốt tay hold bị tạm giữ vì tranh chấp, hàng đợi chuyển trả, và đối chiếu ngày. Tài khoản
 * nhận hoàn ĐẦY ĐỦ chỉ hiện ở đây — mọi bề mặt khác đã che.
 *
 * Không có endpoint nào sửa/xoá một dòng tiền: `bank_transactions` là bằng chứng, `hold_refunds`
 * chỉ đi tới `paid`/`rejected`, kết cục hold chỉ được chốt khi còn trống.
 */
@ApiTags('platform-money')
@Controller('platform/money')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_MONEY_MANAGE)
export class PlatformMoneyController {
  constructor(
    private readonly holds: BookingHoldsService,
    private readonly settlement: HoldSettlementService,
  ) {}

  @Get('holds')
  @ApiOperation({ summary: 'Hàng đợi khoản giữ chỗ — lọc trạng thái, hoặc chỉ hold chưa chốt kết cục' })
  @ApiOkResponse({ type: PlatformHoldPageDto })
  listHolds(@Query() query: PlatformHoldListQueryDto): Promise<PlatformHoldPageDto> {
    return this.holds.listForPlatform(query) as Promise<PlatformHoldPageDto>;
  }

  @Post('holds/:id/settle')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Chốt tay kết cục một hold đang chờ (thường sau tranh chấp) — bắt buộc lý do, có audit',
  })
  @ApiNoContentResponse()
  async settle(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SettleHoldDto,
  ): Promise<void> {
    await this.settlement.adminSettle(id, user.id, {
      outcome: dto.outcome as BookingHoldOutcome,
      note: dto.note,
    });
  }

  @Get('refunds')
  @ApiOperation({ summary: 'Hàng đợi chuyển trả khoản giữ chỗ — mặc định chỉ CHỜ CHUYỂN' })
  @ApiOkResponse({ type: PlatformHoldRefundPageDto })
  listRefunds(@Query() query: PlatformHoldRefundListQueryDto): Promise<PlatformHoldRefundPageDto> {
    return this.holds.listRefundsForPlatform(query) as Promise<PlatformHoldRefundPageDto>;
  }

  @Post('refunds/:id/paid')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đã chuyển trả — ghi mã giao dịch ngân hàng, báo khách' })
  @ApiNoContentResponse()
  async refundPaid(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarkRefundPaidDto,
  ): Promise<void> {
    await this.settlement.markRefundPaid(id, user.id, dto);
  }

  @Post('refunds/:id/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Từ chối hoàn — bắt buộc lý do, có audit' })
  @ApiNoContentResponse()
  async refundReject(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RejectRefundDto,
  ): Promise<void> {
    await this.settlement.rejectRefund(id, user.id, dto.note);
  }

  @Get('reconciliation/daily')
  @ApiOperation({ summary: 'Đối chiếu một ngày (giờ VN): tiền vào ngân hàng ↔ sổ gói / giữ chỗ / hoàn' })
  @ApiQuery({ name: 'date', example: '2026-09-07', description: 'YYYY-MM-DD, giờ Việt Nam' })
  @ApiOkResponse({ type: DailyReconciliationDto })
  daily(@Query('date') date: string): Promise<DailyReconciliationDto> {
    return this.holds.dailyReconciliation(date);
  }
}
