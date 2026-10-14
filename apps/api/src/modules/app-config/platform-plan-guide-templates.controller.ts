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
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, Realms, RequirePermissions } from '../../common/decorators';
import { OkResultDto } from '../../common/dto/api-response.dto';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  CreatePlanGuideTemplateDto,
  DuplicatePlanGuideTemplateDto,
  PlanGuideTemplateDto,
  PlanGuideTemplateListQueryDto,
  PlanGuideTemplatePageDto,
  PlanGuideTemplatePreviewDto,
  PreviewPlanGuideTemplateDto,
  SendTestPlanGuideTemplateDto,
  SendTestResultDto,
  UpdatePlanGuideTemplateDto,
} from './dto/plan-guide-template.dto';
import { PlanGuideTemplatesService } from './plan-guide-templates.service';

/**
 * QUẢN TRỊ mẫu email "Hướng dẫn đăng ký và gia hạn gói" — `@PlatformOnly()` +
 * `platform.app_config.manage` (cùng quyền với công tắc `isPlanPromotionEnabled`). Mọi thao tác ghi audit.
 */
@ApiTags('platform-app-config')
@Controller('platform/plan-guide-email-templates')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_APP_CONFIG_MANAGE)
@Realms(ACCOUNT_REALM.PLATFORM)
export class PlatformPlanGuideTemplatesController {
  constructor(private readonly templates: PlanGuideTemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách mẫu email hướng dẫn gói (mẫu đang bật đứng đầu)' })
  @ApiOkResponse({ type: PlanGuideTemplatePageDto })
  list(@Query() query: PlanGuideTemplateListQueryDto) {
    return this.templates.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một mẫu (kèm thân HTML vi/en)' })
  @ApiOkResponse({ type: PlanGuideTemplateDto })
  get(@Param('id') id: string): Promise<PlanGuideTemplateDto> {
    return this.templates.get(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tạo mẫu mới (chưa bật)' })
  @ApiOkResponse({ type: PlanGuideTemplateDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePlanGuideTemplateDto,
  ): Promise<PlanGuideTemplateDto> {
    return this.templates.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Sửa mẫu — version +1; `expectedVersion` lệch ⇒ 409' })
  @ApiOkResponse({ type: PlanGuideTemplateDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePlanGuideTemplateDto,
  ): Promise<PlanGuideTemplateDto> {
    return this.templates.update(user.id, id, dto);
  }

  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Nhân bản một mẫu thành mẫu mới (chưa bật)' })
  @ApiOkResponse({ type: PlanGuideTemplateDto })
  duplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DuplicatePlanGuideTemplateDto,
  ): Promise<PlanGuideTemplateDto> {
    return this.templates.duplicate(user.id, id, dto);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bật mẫu này (mẫu đang bật trước đó tự tắt — đúng một mẫu bật)' })
  @ApiOkResponse({ type: PlanGuideTemplateDto })
  activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<PlanGuideTemplateDto> {
    return this.templates.activate(user.id, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xoá mềm mẫu — mẫu đang bật không xoá được' })
  @ApiOkResponse({ type: OkResultDto })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<OkResultDto> {
    await this.templates.remove(user.id, id);
    return { ok: true };
  }

  @Post(':id/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dựng tiêu đề + HTML bằng dữ liệu mẫu (có thể gửi bản nháp chưa lưu) — không ghi gì',
  })
  @ApiOkResponse({ type: PlanGuideTemplatePreviewDto })
  preview(
    @Param('id') id: string,
    @Body() dto: PreviewPlanGuideTemplateDto,
  ): Promise<PlanGuideTemplatePreviewDto> {
    return this.templates.preview(id, dto);
  }

  @Post(':id/send-test')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Xếp hàng thư thử tới CHÍNH email của admin đang đăng nhập' })
  @ApiOkResponse({ type: SendTestResultDto })
  sendTest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendTestPlanGuideTemplateDto,
  ): Promise<SendTestResultDto> {
    return this.templates.sendTest(user.id, id, dto);
  }
}
