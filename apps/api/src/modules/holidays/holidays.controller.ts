import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { HolidayListDto, HolidayRangeQueryDto } from './dto/holiday.dto';
import { HolidaysService } from './holidays.service';

/**
 * Lịch nghỉ lễ Việt Nam — CHỈ ĐỌC, dùng để tô lớp thông tin lên lịch điều phối đội xe.
 *
 * `@Public()` cùng lý do với `provinces.controller.ts`: danh mục ngày lễ là thông tin công khai
 * (đăng trên công báo), không có gì để bảo vệ. Và về mặt kỹ thuật thì cũng không dựng
 * `@TenantScoped` được — bảng nguồn KHÔNG có `tenant_id`, vì ngày lễ là dữ kiện của quốc gia
 * chứ không phải dữ liệu của gian hàng nào.
 *
 * Không có endpoint GHI, và đó là chủ đích: đường ghi duy nhất là job đồng bộ ở `apps/worker`.
 * Cần chạy lại ngay thì dùng `pnpm --filter @xeprime/worker holidays:sync`.
 *
 * Ngày lễ ở đây KHÔNG khoá xe, KHÔNG đổi giá, KHÔNG chặn đặt xe — quyết định nghỉ hay chạy dịp
 * lễ là của gian hàng (ADR 0014).
 */
@ApiTags('holidays')
@Controller('holidays')
export class HolidaysController {
  constructor(private readonly holidays: HolidaysService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Ngày lễ giao với một khoảng ngày',
    description:
      'Lọc theo OVERLAP: một kỳ nghỉ nhiều ngày vắt qua biên khoảng vẫn được trả về. ' +
      '`endDate` là ngày CUỐI CÙNG (inclusive). Chưa cấu hình đồng bộ thì `items` rỗng, không phải lỗi.',
  })
  @ApiOkResponse({ type: HolidayListDto })
  async list(@Query() query: HolidayRangeQueryDto): Promise<HolidayListDto> {
    return { items: await this.holidays.listInRange(query.from, query.to) };
  }
}
