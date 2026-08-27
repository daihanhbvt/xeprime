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
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { API_ERROR_CODE, PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { PresignImageDto, UploadPresignDto } from '../storage/dto/storage.dto';
import { R2Service } from '../storage/r2.service';
import { BannersService } from './banners.service';
import {
  AdminBannerDto,
  CreateBannerDto,
  ReorderBannersDto,
  UpdateBannerDto,
} from './dto/banner.dto';

/**
 * Quản trị banner trang chủ — nơi DUY NHẤT tạo/sửa/xoá banner.
 *
 * Banner hiện với mọi khách truy cập nên toàn bộ mutation cần `platform.banners.manage` và ghi
 * `audit_logs` (trong service). Upload ảnh đi đúng pattern R2 sẵn có: presign ở đây (prefix
 * `banners/` dựng server-side) → client PUT thẳng lên R2 → lưu publicUrl.
 */
@ApiTags('platform-banners')
@Controller('platform/banners')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_BANNER_MANAGE)
export class PlatformBannersController {
  constructor(
    private readonly banners: BannersService,
    private readonly r2: R2Service,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Toàn bộ banner (kèm cờ đang-hiển-thị theo lịch)' })
  @ApiOkResponse({ type: [AdminBannerDto] })
  list(): Promise<AdminBannerDto[]> {
    return this.banners.listForAdmin();
  }

  @Post()
  @ApiOperation({ summary: 'Tạo banner' })
  @ApiCreatedResponse({ type: AdminBannerDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBannerDto,
  ): Promise<AdminBannerDto> {
    return this.banners.create(user.id, dto);
  }

  // Route tĩnh phải đứng trước `:id`.
  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sắp lại thứ tự hiển thị (gửi trọn danh sách id)' })
  @ApiOkResponse({ type: [AdminBannerDto] })
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReorderBannersDto,
  ): Promise<AdminBannerDto[]> {
    return this.banners.reorder(user.id, dto);
  }

  @Post('presign')
  @ApiOperation({ summary: 'Presign upload ảnh banner lên R2 (prefix banners/ dựng server-side)' })
  @ApiCreatedResponse({ type: UploadPresignDto })
  presign(@Body() dto: PresignImageDto): Promise<UploadPresignDto> {
    if (!this.r2.enabled) {
      throw new ServiceUnavailableException({
        code: API_ERROR_CODE.UPLOADS_NOT_CONFIGURED,
        message: 'Chưa cấu hình R2 — không upload được ảnh banner',
      });
    }
    return this.r2.presignUpload({
      prefix: 'banners',
      fileName: dto.fileName,
      contentType: dto.contentType,
      contentLength: dto.fileSize,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Sửa banner (ảnh/lịch/thứ tự/bật-tắt)' })
  @ApiOkResponse({ type: AdminBannerDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBannerDto,
  ): Promise<AdminBannerDto> {
    return this.banners.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá banner (ảnh vẫn còn trên R2 — tạo lại được từ URL cũ)' })
  @ApiNoContentResponse()
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.banners.remove(user.id, id);
  }
}
