import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  PromoCodeDto,
  PromoCodeListQueryDto,
  PromoCodePageDto,
  PromoRedemptionListQueryDto,
  PromoRedemptionPageDto,
  TogglePromoCodeDto,
  UpsertPromoCodeDto,
} from './dto/promo-code.dto';
import { PromoCodesService } from './promo-codes.service';

/**
 * QUẢN TRỊ mã khuyến mãi nền tảng — ADR 0046 điều 1.
 *
 * `@PlatformOnly()` + `platform.promo_codes.manage`. **Không có endpoint tương ứng ở tuyến
 * tenant**, và đó là chốt chặn thật: gian hàng/chủ xe không tạo, không sửa, không xem được mã
 * nền tảng — ẩn menu chỉ là trang trí (ADR 0027 điều 4).
 *
 * Mã do XePrime TÀI TRỢ, nên nó là một dòng CHI của nền tảng. Quyền ở đây tách khỏi
 * `platform.fee_policies.manage` (dòng THU) vì hai việc ngược chiều nhau về ngân sách.
 */
@ApiTags('platform-promo-codes')
@Controller('platform/promo-codes')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_PROMO_CODE_MANAGE)
export class PlatformPromoCodesController {
  constructor(private readonly promos: PromoCodesService) {}

  @Get()
  @ApiOperation({
    summary: 'Danh sách mã khuyến mãi — lọc/tìm/sắp/phân trang ở SERVER, kèm thẻ thống kê',
  })
  @ApiOkResponse({ type: PromoCodePageDto })
  list(@Query() query: PromoCodeListQueryDto): Promise<PromoCodePageDto> {
    return this.promos.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một mã' })
  @ApiOkResponse({ type: PromoCodeDto })
  getOne(@Param('id') id: string): Promise<PromoCodeDto> {
    return this.promos.getOne(id);
  }

  @Get(':id/redemptions')
  @ApiOperation({ summary: 'Lượt sử dụng của một mã (tên khách đã che)' })
  @ApiOkResponse({ type: PromoRedemptionPageDto })
  redemptions(
    @Param('id') id: string,
    @Query() query: PromoRedemptionListQueryDto,
  ): Promise<PromoRedemptionPageDto> {
    return this.promos.listRedemptions(id, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tạo mã khuyến mãi' })
  @ApiOkResponse({ type: PromoCodeDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertPromoCodeDto,
  ): Promise<PromoCodeDto> {
    return this.promos.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Sửa mã — mã đã phát sinh lượt thì mức giảm/điều kiện/phạm vi bị khoá (PROMO_CODE_LOCKED)',
  })
  @ApiOkResponse({ type: PromoCodeDto })
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertPromoCodeDto,
  ): Promise<PromoCodeDto> {
    return this.promos.update(id, user.id, dto);
  }

  @Post(':id/toggle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bật/tắt — thao tác duy nhất còn dùng được khi mã đã có lượt dùng' })
  @ApiOkResponse({ type: PromoCodeDto })
  toggle(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TogglePromoCodeDto,
  ): Promise<PromoCodeDto> {
    return this.promos.toggle(id, user.id, dto);
  }

  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Nhân bản — mã mới TẮT sẵn để soát lại số trước khi chạy' })
  @ApiOkResponse({ type: PromoCodeDto })
  duplicate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PromoCodeDto> {
    return this.promos.duplicate(id, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xoá MỀM — mã đã dùng vẫn giải thích được giá của đơn cũ (RESTRICT ở DB)',
  })
  @ApiNoContentResponse()
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.promos.remove(id, user.id);
  }
}
