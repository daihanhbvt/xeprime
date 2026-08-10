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
import { CatalogService } from './catalog.service';
import {
  CatalogAdminQueryDto,
  CatalogItemAdminDto,
  CatalogItemDto,
  CreateCatalogItemDto,
  ReorderCatalogDto,
  UpdateCatalogItemDto,
} from './dto/catalog.dto';

/**
 * Quản trị danh mục lọc — nơi DUY NHẤT tạo được hãng xe / kiểu dáng / nhiên liệu / tiện ích.
 *
 * Sửa ở đây đổi luôn ô chọn trong form tạo xe của mọi gian hàng và bộ lọc ngoài chợ, nên mọi
 * thao tác đều ghi `audit_logs` (CLAUDE.md mục 6.3).
 */
@ApiTags('platform-catalog')
@Controller('platform/catalog')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_CATALOG_MANAGE)
export class PlatformCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOperation({ summary: 'Danh mục đầy đủ, kèm mục đã tắt và số xe đang dùng' })
  @ApiOkResponse({ type: [CatalogItemAdminDto] })
  list(@Query() query: CatalogAdminQueryDto): Promise<CatalogItemAdminDto[]> {
    return this.catalog.listForAdmin(query);
  }

  @Post()
  @ApiOperation({ summary: 'Thêm mục danh mục' })
  @ApiOkResponse({ type: CatalogItemDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCatalogItemDto,
  ): Promise<CatalogItemDto> {
    return this.catalog.create(user.id, dto);
  }

  // Route tĩnh phải đứng trước `:id`, nếu không 'reorder' bị bắt làm id.
  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sắp lại thứ tự hiển thị của một chiều danh mục' })
  @ApiOkResponse({ type: [CatalogItemAdminDto] })
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReorderCatalogDto,
  ): Promise<CatalogItemAdminDto[]> {
    return this.catalog.reorder(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Sửa nhãn / mô tả / ảnh / thứ tự / bật-tắt (không đổi mã)' })
  @ApiOkResponse({ type: CatalogItemDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCatalogItemDto,
  ): Promise<CatalogItemDto> {
    return this.catalog.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá mục chưa có xe nào dùng (đã có xe thì tắt, không xoá)' })
  @ApiNoContentResponse()
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.catalog.remove(user.id, id);
  }
}
