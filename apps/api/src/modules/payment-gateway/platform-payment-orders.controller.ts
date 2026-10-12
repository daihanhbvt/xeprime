import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, Realms, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  ApplyPaymentOrderDto,
  PlatformPaymentOrderDetailDto,
  PlatformPaymentOrderListQueryDto,
  PlatformPaymentOrderPageDto,
  PlatformPaymentOrderRequeryDto,
  ResolvePaymentOrderDto,
} from './dto/platform-payment-order.dto';
import { PlatformPaymentOrdersService } from './platform-payment-orders.service';

/**
 * Hàng đợi cổng thanh toán của người trực — màn Tài chính nền tảng (ADR 0058).
 *
 * Cùng quyền với hàng đợi tiền vào ngân hàng (`platform.billing.manage`): cả hai là TIỀN VÀO nền
 * tảng, và người khớp tay một chuyển khoản cũng là người xử lý một khoản cổng không áp được.
 * Không tenant-scoped: một lượt cần người xử lý có thể thuộc bất kỳ gian hàng nào.
 */
@ApiTags('platform-money')
@Controller('platform/payment-orders')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_BILLING_MANAGE)
@Realms(ACCOUNT_REALM.PLATFORM)
export class PlatformPaymentOrdersController {
  constructor(private readonly orders: PlatformPaymentOrdersService) {}

  @Get()
  @ApiOperation({
    summary: 'Lượt thanh toán qua cổng — mặc định chỉ những lượt CẦN NGƯỜI XỬ LÝ, cũ nhất trước',
  })
  @ApiOkResponse({ type: PlatformPaymentOrderPageDto })
  list(@Query() query: PlatformPaymentOrderListQueryDto): Promise<PlatformPaymentOrderPageDto> {
    return this.orders.list(query) as Promise<PlatformPaymentOrderPageDto>;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một lượt: kết quả cổng (đã bỏ chữ ký) + tình trạng hiện tại của đích' })
  @ApiOkResponse({ type: PlatformPaymentOrderDetailDto })
  getOne(@Param('id') id: string): Promise<PlatformPaymentOrderDetailDto> {
    return this.orders.getOne(id);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đóng một lượt ở hàng đợi sau khi đã xử lý bên ngoài (vd hoàn tay) — kèm ghi chú và audit',
  })
  @ApiOkResponse({ type: PlatformPaymentOrderDetailDto })
  resolve(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ResolvePaymentOrderDto,
  ): Promise<PlatformPaymentOrderDetailDto> {
    return this.orders.resolve(id, user.id, dto);
  }

  @Post(':id/apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Ghi nhận TAY một lượt cổng đã thu mà máy không tự áp (vd kết quả tới sau khi đã đóng) — cùng đường tiền, có audit',
  })
  @ApiOkResponse({ type: PlatformPaymentOrderDetailDto })
  apply(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ApplyPaymentOrderDto,
  ): Promise<PlatformPaymentOrderDetailDto> {
    return this.orders.apply(id, user.id, dto.note);
  }

  @Post(':id/requery')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Hỏi lại cổng ngay và thử áp tiền nếu cổng đã thu — trả kèm kết quả của lượt hỏi',
  })
  @ApiOkResponse({ type: PlatformPaymentOrderRequeryDto })
  requery(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PlatformPaymentOrderRequeryDto> {
    return this.orders.requery(id, user.id);
  }
}
