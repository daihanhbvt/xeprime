import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ACCOUNT_REALM } from '@xeprime/types';
import { CurrentUser, Realms } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { PlanConsultationDto, PlanConsultationResultDto } from '../app-config/dto/app-config.dto';
import { SupportService } from './support.service';

/**
 * Yêu cầu TƯ VẤN GÓI — tài khoản đối tác (web session hoặc app Bearer), có hay chưa có gian hàng.
 * Không `@TenantScoped`: người vừa tải app có thể chưa mở gian hàng nào. Gian hàng (nếu có) do
 * server suy từ membership.
 */
@ApiTags('support')
@Controller('support')
@Realms(ACCOUNT_REALM.PARTNER)
export class PlanConsultationController {
  constructor(private readonly support: SupportService) {}

  @Post('plan-consultation')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Gửi yêu cầu tư vấn gói (case `plan_consultation` + email hướng dẫn gói). Tắt `isPlanPromotionEnabled` ⇒ 403 PLAN_CONSULTATION_DISABLED',
  })
  @ApiOkResponse({ type: PlanConsultationResultDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PlanConsultationDto,
  ): Promise<PlanConsultationResultDto> {
    return this.support.openPlanConsultation(user.id, dto);
  }
}
