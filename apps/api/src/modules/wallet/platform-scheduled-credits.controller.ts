import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, Realms, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { FreezeScheduledCreditDto, ScheduledCreditDto } from './dto/scheduled-credit.dto';
import { listPendingScheduledCredits, ScheduledCreditService } from './scheduled-credit.service';

/**
 * KHOẢN CHỜ CỘNG VÍ của admin (biên bản họp 19/11/2026, việc #4): khách huỷ / không đến ⇒ tiền hoàn
 * của khách và phần của chủ xe chờ vài giờ trước khi vào ví. Trong lúc chờ, admin xử lý tranh chấp:
 *
 *   freeze    tạm giữ — vòng quét bỏ qua, bắt buộc ghi lý do
 *   unfreeze  bỏ tạm giữ — chờ tiếp tới hạn cũ
 *   release   cộng NGAY vào ví (kể cả khoản đang tạm giữ)
 *
 * Mọi thao tác ghi audit. Đổi SỐ TIỀN hay NGƯỜI NHẬN không có ở đây — đó là việc của lượt kết luận
 * chuyến (ADR 0095), không phải của hàng đợi chờ.
 */
@ApiTags('platform-money')
@Controller('platform/money/scheduled-credits')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_MONEY_MANAGE)
@Realms(ACCOUNT_REALM.PLATFORM)
export class PlatformScheduledCreditsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: ScheduledCreditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Khoản đang chờ / tạm giữ cộng ví - sắp tới hạn trước' })
  @ApiOkResponse({ type: [ScheduledCreditDto] })
  list(): Promise<ScheduledCreditDto[]> {
    return listPendingScheduledCredits(this.prisma);
  }

  @Post(':id/freeze')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Tạm giữ một khoản (tranh chấp) - vòng quét bỏ qua' })
  @ApiNoContentResponse()
  freeze(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: FreezeScheduledCreditDto,
  ): Promise<void> {
    return this.credits.freeze(id, user.id, dto.note.trim());
  }

  @Post(':id/unfreeze')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Bỏ tạm giữ - khoản chờ tiếp tới hạn cũ' })
  @ApiNoContentResponse()
  unfreeze(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.credits.unfreeze(id, user.id);
  }

  @Post(':id/release')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cộng ngay vào ví' })
  @ApiNoContentResponse()
  release(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.credits.releaseNow(id, user.id);
  }
}
