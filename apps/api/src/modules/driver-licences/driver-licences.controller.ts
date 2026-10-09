import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ACCOUNT_REALM } from '@xeprime/types';
import { CurrentUser, Realms } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  DriverLicenceDto,
  DriverLicenceImageDto,
  DriverLicenceOverviewDto,
  DriverLicencePresignDto,
  PresignDriverLicenceDto,
} from './dto/driver-licence.dto';
import { DriverLicencesService } from './driver-licences.service';

/**
 * Bằng lái của CHÍNH tài khoản khách đang đăng nhập — ADR 0057.
 *
 * Không có tham số người dùng nào: chủ sở hữu luôn lấy từ session. Id lượt nộp của người khác
 * là 404 (điều kiện `user_id` nằm trong câu truy vấn), không lộ sự tồn tại.
 */
@ApiTags('driver-licences')
@Controller('account/driver-licence')
// Đặt xe là việc của realm khách (ADR 0053 điều 7) — bằng lái đi theo tài khoản khách.
@Realms(ACCOUNT_REALM.CUSTOMER)
export class DriverLicencesController {
  constructor(private readonly licences: DriverLicencesService) {}

  @Get()
  @ApiOperation({
    summary: 'Bằng lái của tôi — bằng đang dùng và lượt nộp gần nhất',
    description:
      'Lượt nộp đang `processing` thì hỏi lại sau 1–2 giây: đọc ảnh chạy nền và thường xong ' +
      'trong vài chục giây.',
  })
  @ApiOkResponse({ type: DriverLicenceOverviewDto })
  overview(@CurrentUser() user: AuthenticatedUser): Promise<DriverLicenceOverviewDto> {
    return this.licences.getOverview(user.id);
  }

  @Post('presign')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Bắt đầu nộp ảnh mặt trước bằng lái — trả URL PUT riêng tư',
    description:
      'Bắt buộc `consent: true`. Lượt nộp đang chờ duyệt (nếu có) bị thay bằng lượt mới. ' +
      'Đang có một ảnh được đọc dở thì 409 `DRIVER_LICENCE_STATE_CONFLICT`.',
  })
  @ApiOkResponse({ type: DriverLicencePresignDto })
  presign(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PresignDriverLicenceDto,
  ): Promise<DriverLicencePresignDto> {
    return this.licences.presign(user.id, dto);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Xác nhận đã tải ảnh — kiểm ảnh rồi bắt đầu đọc (chạy nền)',
    description:
      'Trả về lượt nộp ở trạng thái `processing`. Gọi lại sau khi đã xong là idempotent.',
  })
  @ApiOkResponse({ type: DriverLicenceDto })
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DriverLicenceDto> {
    return this.licences.complete(user.id, id);
  }

  @Post(':id/request-review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Nhờ XePrime xem lại một lượt bị máy từ chối',
    description:
      'Chỉ với lượt mới nhất, bị từ chối TỰ ĐỘNG vì lý do máy có thể đọc sai (`canRequestReview`).',
  })
  @ApiOkResponse({ type: DriverLicenceDto })
  requestReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DriverLicenceDto> {
    return this.licences.requestReview(user.id, id);
  }

  @Get(':id/image')
  @ApiOperation({ summary: 'Xem ảnh bằng lái đã nộp — URL sống ngắn' })
  @ApiOkResponse({ type: DriverLicenceImageDto })
  image(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DriverLicenceImageDto> {
    return this.licences.imageForOwner(user.id, id);
  }
}
