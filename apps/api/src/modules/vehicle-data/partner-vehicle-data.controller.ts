import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ACCOUNT_REALM, PERMISSION, SUPPORT_CAPABILITY } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  Realms,
  RequirePermissions,
  SupportAction,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { CatalogModelService } from '../catalog/catalog-model.service';
import { CatalogModelDto } from '../catalog/dto/catalog.dto';
import {
  CreateOwnerModelDto,
  VehicleDataSuggestionDto,
  VehicleDataSuggestionQueryDto,
} from './dto/vehicle-data.dto';
import { VehicleDataSuggestionService } from './vehicle-data-suggestion.service';

/**
 * Dữ liệu xe phía chủ xe (ADR 0090): gợi ý khi đăng/sửa xe, và dòng xe gõ mới ngay trong ô chọn.
 * Gợi ý mở cho phiên hỗ trợ (chỉ đọc); tạo dòng xe mới thì không — nó tạo dữ liệu nền tảng.
 */
@ApiTags('vehicles')
@Controller('vehicle-catalog')
@TenantScoped()
@Realms(ACCOUNT_REALM.PARTNER)
export class PartnerVehicleDataController {
  constructor(
    private readonly suggestions: VehicleDataSuggestionService,
    private readonly models: CatalogModelService,
  ) {}

  @Get('suggestion')
  @RequirePermissions(PERMISSION.VEHICLE_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.VEHICLE_VIEW)
  @ApiOperation({
    summary: 'Gợi ý thông số, giá trị xe, giá thuê tham khảo theo dòng xe / phiên bản / năm',
  })
  @ApiOkResponse({ type: VehicleDataSuggestionDto })
  suggestion(@Query() query: VehicleDataSuggestionQueryDto): Promise<VehicleDataSuggestionDto> {
    return this.suggestions.suggest(query);
  }

  @Post('models')
  @RequirePermissions(PERMISSION.VEHICLE_CREATE)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Thêm dòng xe chưa có (chờ duyệt) - gắn được vào xe ngay, chưa hiện cho gian hàng khác',
  })
  @ApiCreatedResponse({ type: CatalogModelDto })
  createModel(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOwnerModelDto,
  ): Promise<CatalogModelDto> {
    return this.models.createOwnerModel(tenant.tenantId, user.id, dto);
  }
}
