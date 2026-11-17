import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION, SUPPORT_PARTY, type TripVerdict } from '@xeprime/types';
import { CurrentUser, PlatformOnly, Realms, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  SupportCaseDetailDto,
  TripVerdictDto,
  TripVerdictPreviewDto,
} from '../support/dto/support.dto';
import { SupportService } from '../support/support.service';
import { TripVerdictService } from './trip-verdict.service';

/**
 * Kết luận CHUYẾN của một case xác minh bàn giao — ADR 0094. Cùng tiền tố, cùng quyền với hàng đợi
 * hỗ trợ của nền tảng (`PlatformSupportController`); tách controller chỉ vì lượt này cần
 * `BookingsModule`, còn module hỗ trợ thì không.
 */
@ApiTags('platform-support')
@Controller('platform/support/cases')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_SUPPORT_MANAGE)
@Realms(ACCOUNT_REALM.PLATFORM)
export class PlatformTripVerdictController {
  constructor(
    private readonly verdicts: TripVerdictService,
    private readonly support: SupportService,
  ) {}

  @Get(':id/trip-verdict-preview')
  @ApiOperation({
    summary: 'Xem trước tiền giữ chỗ của từng kết luận chuyến đang dùng được (ADR 0095)',
    description:
      'Cùng phép tính với lượt kết luận thật (`decideOutcome` + `allocationForHold`). Đọc, không ghi. ' +
      '`items` rỗng khi case không còn kết luận nào.',
  })
  @ApiOkResponse({ type: TripVerdictPreviewDto })
  preview(@Param('id') id: string): Promise<TripVerdictPreviewDto> {
    return this.verdicts.preview(id);
  }

  @Post(':id/trip-verdict')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Kết luận chuyến của case chưa xác nhận giao/trả xe hoặc tranh chấp trước nhận xe: xe đã giao · khách không đến · chủ xe không giao được · huỷ không tính lỗi · xe đã trả',
    description:
      'Một transaction: kết luận case, rồi đi đúng đường của gian hàng/khách (biên bản bàn giao nguồn `platform`, ' +
      'hoặc chuyển đơn sang `no_show` / `cancelled` với trách nhiệm chủ xe) - tiền giữ chỗ tự chốt theo luật thường. ' +
      'Lỗi: 409 `SUPPORT_TRIP_VERDICT_NOT_ALLOWED` khi kết luận không còn hợp lệ với trạng thái đơn (`details.verdicts`), ' +
      '409 `SUPPORT_CASE_CLOSED` khi case đã đóng.',
  })
  @ApiOkResponse({ type: SupportCaseDetailDto })
  async verdict(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TripVerdictDto,
  ): Promise<SupportCaseDetailDto> {
    await this.verdicts.apply(id, user.id, {
      verdict: dto.verdict as TripVerdict,
      note: dto.note,
    });
    return this.support.detail(id, {
      userId: user.id,
      scope: SUPPORT_PARTY.PLATFORM,
      tenantId: null,
    });
  }
}
