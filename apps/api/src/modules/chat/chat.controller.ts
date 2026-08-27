import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { API_ERROR_CODE } from '@xeprime/types';
import { CurrentUser } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { FirebaseAppService } from '../firebase/firebase-app.service';
import { R2Service } from '../storage/r2.service';
import { FirebaseTokenDto, PresignAttachmentDto, PresignResultDto } from './dto/chat.dto';

/**
 * Hạ tầng chat cho client: mint custom token để đăng nhập Firebase (nghe realtime Firestore) và
 * presign upload đính kèm lên R2. Đều cần đăng nhập; `uid`/`prefix` lấy từ session, không từ client.
 */
@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(
    private readonly firebase: FirebaseAppService,
    private readonly r2: R2Service,
  ) {}

  @Post('firebase-token')
  @ApiOperation({ summary: 'Custom token để signInWithCustomToken (uid = user id)' })
  @ApiOkResponse({ type: FirebaseTokenDto })
  async firebaseToken(@CurrentUser() user: AuthenticatedUser): Promise<FirebaseTokenDto> {
    if (!this.firebase.enabled) return { enabled: false, token: null };
    const token = await this.firebase.createCustomToken(user.id);
    return { enabled: true, token };
  }

  @Post('attachments/presign')
  @ApiOperation({ summary: 'Xin presigned URL để upload đính kèm chat lên R2' })
  @ApiCreatedResponse({ type: PresignResultDto })
  async presign(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PresignAttachmentDto,
  ): Promise<PresignResultDto> {
    if (!this.firebase.enabled) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Đính kèm chưa khả dụng (chat realtime chưa bật)',
      });
    }
    return this.r2.presignUpload({
      prefix: `chat/${user.id}`,
      fileName: dto.fileName,
      contentType: dto.contentType,
    });
  }
}
