import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ACCOUNT_REALM,
  ACCOUNT_REALM_VALUES,
  PERMISSION,
  PUBLIC_CACHE_SECONDS,
} from '@xeprime/types';
import {
  CurrentUser,
  PlatformOnly,
  Public,
  Realms,
  RequirePermissions,
} from '../../common/decorators';
import { PublicCache } from '../../common/http-cache';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  InsuranceProductDto,
  PublicInsuranceProductDto,
  PublicInsuranceProductsQueryDto,
  UpdateInsuranceProductDto,
} from './dto/insurance.dto';
import { InsuranceProductsService } from './insurance-products.service';

/**
 * Danh mục sản phẩm bảo hiểm — phía QUẢN TRỊ (ADR 0064).
 *
 * Chỉ sửa và bật/tắt; không tạo/xoá qua API: sản phẩm gắn với một hợp đồng đối tác, và một sản
 * phẩm mới là một quyết định thương mại đi kèm migration/seed, không phải một cú bấm.
 */
@ApiTags('platform-insurance')
@Controller('platform/insurance/products')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_INSURANCE_MANAGE)
@Realms(ACCOUNT_REALM.PLATFORM)
export class PlatformInsuranceProductsController {
  constructor(private readonly products: InsuranceProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh mục sản phẩm bảo hiểm (cả sản phẩm đang tắt)' })
  @ApiOkResponse({ type: [InsuranceProductDto] })
  list(): Promise<InsuranceProductDto[]> {
    return this.products.listForPlatform();
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Sửa một sản phẩm bảo hiểm — tên, quyền lợi, khấu trừ, mẫu URL GCN, bật/tắt',
    description:
      'Biểu phí NGÀY không sửa ở đây — nó có phiên bản ở chính sách phí. Hợp đồng đã bán giữ ' +
      'snapshot riêng, nên sửa danh mục không viết lại quyền lợi đã hứa. Có audit.',
  })
  @ApiOkResponse({ type: InsuranceProductDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateInsuranceProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InsuranceProductDto> {
    return this.products.update(id, dto, user.id);
  }
}

/**
 * Danh mục sản phẩm bảo hiểm — CÔNG KHAI, cho phần "Quyền lợi" cạnh ô chọn bảo hiểm.
 *
 * Chỉ mô tả sản phẩm cho đúng loại xe; phí ngày và việc CÓ chào bảo hiểm hay không đến từ báo giá
 * (`insuranceOffered`), không từ đây — danh mục bật không có nghĩa là môi trường đã cắm đối tác.
 */
@ApiTags('public-insurance')
@Controller('public/insurance-products')
@Realms(...ACCOUNT_REALM_VALUES)
export class PublicInsuranceProductsController {
  constructor(private readonly products: InsuranceProductsService) {}

  @Public()
  @Get()
  @PublicCache(PUBLIC_CACHE_SECONDS.banner)
  @ApiOperation({ summary: 'Sản phẩm bảo hiểm đang bật cho một loại xe' })
  @ApiOkResponse({ type: [PublicInsuranceProductDto] })
  list(@Query() query: PublicInsuranceProductsQueryDto): Promise<PublicInsuranceProductDto[]> {
    return this.products.listPublic(query.vehicleType);
  }
}
