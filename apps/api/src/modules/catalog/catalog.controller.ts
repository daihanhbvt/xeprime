import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PUBLIC_CACHE_SECONDS } from '@xeprime/types';
import { Public } from '../../common/decorators';
import { PublicCache } from '../../common/http-cache';
import { CatalogService } from './catalog.service';
import { CatalogItemDto, CatalogQueryDto } from './dto/catalog.dto';

/**
 * Danh mục lọc — đọc công khai.
 *
 * Cùng một endpoint phục vụ cả ba màn: bộ lọc marketplace (khách vãng lai, không đăng nhập),
 * form tạo/sửa xe của gian hàng, và trang chi tiết xe (tra nhãn từ key). Đó chính là điểm
 * "đồng bộ": ba nơi không còn tự giữ danh sách riêng.
 *
 * Công khai vì marketplace không yêu cầu đăng nhập, và nội dung ở đây là danh mục hiển thị —
 * không có gì thuộc về một gian hàng cụ thể.
 */
@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get()
  @PublicCache(PUBLIC_CACHE_SECONDS.catalog)
  @ApiOperation({ summary: 'Danh mục lọc đang bật (hãng xe / kiểu dáng / nhiên liệu / tiện ích)' })
  @ApiOkResponse({ type: [CatalogItemDto] })
  list(@Query() query: CatalogQueryDto): Promise<CatalogItemDto[]> {
    return this.catalog.list(query);
  }
}
