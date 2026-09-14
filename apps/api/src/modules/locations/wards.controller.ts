import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PUBLIC_CACHE_SECONDS } from '@xeprime/types';
import { Public } from '../../common/decorators';
import { PublicCache } from '../../common/http-cache';
import { WardListDto, WardListQueryDto, WardLookupQueryDto } from './dto/ward.dto';
import { WardsService } from './wards.service';

/**
 * Danh mục XÃ/PHƯỜNG/ĐẶC KHU cho ô nhập địa chỉ — cấp thứ hai và cuối cùng của mô hình hành
 * chính hai cấp (từ 01/07/2025). KHÔNG có endpoint quận/huyện và sẽ không có.
 *
 * `@Public` cùng lý do với `/provinces`: form đăng ký gian hàng chạy trước khi người dùng có
 * tenant, và danh mục hành chính là thông tin công khai.
 *
 * Luôn nằm DƯỚI một mã tỉnh (`/provinces/:provinceCode/wards`) chứ không phải `/wards?province=`:
 * 3.321 đơn vị trên cả nước, và một endpoint có thể trả tất cả là một endpoint sẽ có ngày trả
 * tất cả. Đường dẫn tự nói rằng phạm vi luôn là một tỉnh.
 */
@ApiTags('locations')
@Controller()
export class WardsController {
  constructor(private readonly wards: WardsService) {}

  @Get('provinces/:provinceCode/wards')
  @Public()
  @PublicCache(PUBLIC_CACHE_SECONDS.provinces)
  @ApiOperation({ summary: 'Xã/phường/đặc khu của một tỉnh (có tìm kiếm bỏ dấu)' })
  @ApiParam({ name: 'provinceCode', example: '01', description: 'Mã tỉnh 2 chữ số' })
  @ApiOkResponse({ type: WardListDto })
  async list(
    @Param('provinceCode') provinceCode: string,
    @Query() query: WardListQueryDto,
  ): Promise<WardListDto> {
    return this.wards.listByProvince(provinceCode.trim(), query.q, query.limit);
  }

  /**
   * Tra NHÃN cho các mã đã lưu. Màn chi tiết đơn cũ chỉ có mã trong tay và cần tên để hiện —
   * tải cả 168 đơn vị của tỉnh chỉ để lấy một cái tên là lãng phí rõ ràng.
   */
  @Get('wards/lookup')
  @Public()
  @PublicCache(PUBLIC_CACHE_SECONDS.provinces)
  @ApiOperation({ summary: 'Tra tên xã/phường theo danh sách mã (tối đa 50)' })
  @ApiOkResponse({ type: WardListDto })
  async lookup(@Query() query: WardLookupQueryDto): Promise<WardListDto> {
    const items = await this.wards.findByCodes(query.codes.split(','));
    return { items, total: items.length };
  }
}
