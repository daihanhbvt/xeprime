import { Body, Controller, Post, ServiceUnavailableException } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { API_ERROR_CODE } from '@xeprime/types';
import { CurrentUser } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { PresignImageDto, UploadPresignDto } from './dto/storage.dto';
import { R2Service } from './r2.service';

/**
 * Presign ảnh đại diện của CHÍNH người đang đăng nhập.
 *
 * Tách khỏi `StorageController` vì đúng một lý do, và lý do đó là toàn bộ mục đích của nó:
 * controller kia gắn `@TenantScoped()` ở cấp lớp, nên mọi route trong đó đòi một gian hàng và
 * một quyền của gian hàng. Ảnh đại diện thì thuộc về một CON NGƯỜI — khách thuê xe không có
 * gian hàng nào, và họ vẫn phải đổi được ảnh của mình.
 *
 * Prefix key dựng từ `@CurrentUser`, không nhận từ client (CLAUDE.md mục 5): không ai ghi được
 * vào thư mục của người khác, kể cả khi họ sửa payload.
 */
@ApiTags('uploads')
@Controller('uploads')
export class AvatarUploadController {
  constructor(private readonly r2: R2Service) {}

  @Post('avatar/presign')
  @ApiOperation({ summary: 'Presign upload ảnh đại diện của chính mình lên R2' })
  @ApiCreatedResponse({ type: UploadPresignDto })
  presignAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PresignImageDto,
  ): Promise<UploadPresignDto> {
    if (!this.r2.enabled) {
      throw new ServiceUnavailableException({
        code: API_ERROR_CODE.UPLOADS_NOT_CONFIGURED,
        message: 'Upload ảnh chưa được cấu hình (thiếu R2_* trong môi trường)',
      });
    }

    return this.r2.presignUpload({
      prefix: `users/${user.id}/avatar`,
      fileName: dto.fileName,
      contentType: dto.contentType,
      contentLength: dto.fileSize,
    });
  }
}
