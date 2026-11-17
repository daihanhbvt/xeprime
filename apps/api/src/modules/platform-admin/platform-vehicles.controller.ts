import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, API_ERROR_CODE, PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, Realms, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  HideVehicleDto,
  PlatformVehicleDetailDto,
  PlatformVehicleListQueryDto,
  PlatformVehiclePageDto,
} from './dto/platform-vehicle.dto';
import {
  VehicleInsuranceReviewDto,
  VehicleRegistrationImageDto,
} from './dto/vehicle-insurance-review.dto';
import { PlatformVehicleInsuranceReviewService } from './platform-vehicle-insurance-review.service';
import { PlatformVehiclesService } from './platform-vehicles.service';

/**
 * Xe toàn hệ thống (Phase 7 — build plan §11.1). Đọc mở cho mọi nhân sự nền tảng có
 * `platform.vehicles.view`; ẩn/bỏ ẩn đòi quyền kiểm duyệt riêng và luôn ghi audit.
 */
@ApiTags('platform-vehicles')
@Controller('platform/vehicles')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_VEHICLE_VIEW)
@Realms(ACCOUNT_REALM.PLATFORM)
export class PlatformVehiclesController {
  constructor(
    private readonly vehicles: PlatformVehiclesService,
    private readonly insuranceReview: PlatformVehicleInsuranceReviewService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách xe toàn hệ thống (phân trang, lọc, tìm kiếm)' })
  @ApiOkResponse({ type: PlatformVehiclePageDto })
  list(@Query() query: PlatformVehicleListQueryDto): Promise<PlatformVehiclePageDto> {
    return this.vehicles.list(query) as Promise<PlatformVehiclePageDto>;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một xe (kèm gian hàng chủ quản, số đơn, số đánh giá)' })
  @ApiOkResponse({ type: PlatformVehicleDetailDto })
  getOne(@Param('id') id: string): Promise<PlatformVehicleDetailDto> {
    return this.vehicles.getOne(id);
  }

  @Get(':id/insurance-review')
  @ApiOperation({
    summary:
      'Bảo hiểm và giấy tờ của xe: giá trị khai, giá tham khảo + % lệch, điều kiện bảo hiểm còn thiếu, cà vẹt',
  })
  @ApiOkResponse({ type: VehicleInsuranceReviewDto })
  async getInsuranceReview(@Param('id') id: string): Promise<VehicleInsuranceReviewDto> {
    const review = await this.insuranceReview.review(id);
    if (!review) {
      throw new NotFoundException({ code: API_ERROR_CODE.NOT_FOUND, message: 'Không tìm thấy xe' });
    }
    return review;
  }

  @Get(':id/registration-image')
  @ApiOperation({ summary: 'Mở ảnh cà vẹt của xe - URL sống ngắn, ghi audit mỗi lần mở' })
  @ApiOkResponse({ type: VehicleRegistrationImageDto })
  registrationImage(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VehicleRegistrationImageDto> {
    return this.insuranceReview.registrationImage(id, user.id);
  }

  // `RequirePermissions` ở handler GHI ĐÈ cấp class (PermissionGuard dùng getAllAndOverride),
  // nên phải liệt kê lại cả quyền đọc — nếu không, một role chỉ có `moderate` sẽ ẩn được xe
  // mà không có quyền xem danh sách xe.
  @Post(':id/hide')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.PLATFORM_VEHICLE_VIEW, PERMISSION.PLATFORM_VEHICLE_MODERATE)
  @ApiOperation({ summary: 'Ẩn xe vi phạm khỏi Marketplace (đang hiển thị → đã ẩn)' })
  @ApiOkResponse({ type: PlatformVehicleDetailDto })
  hide(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: HideVehicleDto,
  ): Promise<PlatformVehicleDetailDto> {
    return this.vehicles.hide(id, user.id, dto);
  }

  @Post(':id/unhide')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.PLATFORM_VEHICLE_VIEW, PERMISSION.PLATFORM_VEHICLE_MODERATE)
  @ApiOperation({ summary: 'Bỏ ẩn xe (đã ẩn → hiển thị lại trên Marketplace)' })
  @ApiOkResponse({ type: PlatformVehicleDetailDto })
  unhide(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PlatformVehicleDetailDto> {
    return this.vehicles.unhide(id, user.id);
  }
}
