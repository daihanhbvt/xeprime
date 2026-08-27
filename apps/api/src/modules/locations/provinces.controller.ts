import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PUBLIC_CACHE_SECONDS } from '@xeprime/types';
import { Public } from '../../common/decorators';
import { PublicCache } from '../../common/http-cache';
import { ProvinceListDto } from './dto/province.dto';
import { ProvincesService } from './provinces.service';

/**
 * Danh mục tỉnh cho các FORM NHẬP LIỆU (đăng ký gian hàng, tạo/sửa chi nhánh).
 *
 * `@Public` có chủ đích: form đăng ký gian hàng chạy trước khi người dùng có tenant, và danh mục
 * hành chính là thông tin công khai (đăng trên công báo) — không có gì để bảo vệ. Đây KHÔNG phải
 * endpoint của marketplace: khách tìm xe dùng `/public/destinations` (chỉ tỉnh đang có xe).
 *
 * Trả về tỉnh `isEnabled` — nghĩa là "được phép chọn MỚI", khác với "khách nhìn thấy"
 * (`isPublicVisible`). Frontend KHÔNG được tự dựng danh sách 34 tỉnh.
 */
@ApiTags('locations')
@Controller('provinces')
export class ProvincesController {
  constructor(private readonly provinces: ProvincesService) {}

  @Get()
  @Public()
  @PublicCache(PUBLIC_CACHE_SECONDS.provinces)
  @ApiOperation({ summary: 'Danh mục tỉnh/thành đang mở cho đăng ký & tạo chi nhánh' })
  @ApiOkResponse({ type: ProvinceListDto })
  async list(): Promise<ProvinceListDto> {
    return { items: await this.provinces.listEnabled() };
  }
}
