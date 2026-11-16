import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM_VALUES, PUBLIC_CACHE_SECONDS } from '@xeprime/types';
import { Public, Realms } from '../../common/decorators';
import { PublicCache } from '../../common/http-cache';
import { VehicleDataOptionDto, VehicleDataOptionQueryDto } from './dto/vehicle-data.dto';
import { VehicleDataService } from './vehicle-data.service';

/**
 * Ô "Phiên bản" của form xe (ADR 0090) — xe chuẩn đã duyệt, đang gợi ý của một dòng xe. Công khai
 * như phần còn lại của `/catalog` (thông số xe không thuộc riêng ai); giá tham khảo KHÔNG đi đường
 * này — nó nằm ở gợi ý cần đăng nhập.
 */
@ApiTags('catalog')
@Controller('catalog')
@Realms(...ACCOUNT_REALM_VALUES)
export class PublicVehicleDataController {
  constructor(private readonly vehicleData: VehicleDataService) {}

  @Public()
  @Get('variants')
  @PublicCache(PUBLIC_CACHE_SECONDS.catalog)
  @ApiOperation({ summary: 'Phiên bản (xe chuẩn) đã duyệt của một dòng xe, lọc theo năm sản xuất' })
  @ApiOkResponse({ type: [VehicleDataOptionDto] })
  listVariants(@Query() query: VehicleDataOptionQueryDto): Promise<VehicleDataOptionDto[]> {
    return this.vehicleData.listOptions(query);
  }
}
