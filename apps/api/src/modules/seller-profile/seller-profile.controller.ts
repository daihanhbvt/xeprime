import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { SaveSellerProfileDto, SellerProfileDto } from './dto/seller-profile.dto';
import { SellerProfileService } from './seller-profile.service';

/**
 * "Hồ sơ người bán" của gian hàng — ADR 0028 release gate 1 (R3).
 *
 * KHÔNG gắn `@RequiresFeature`: đây thuộc bộ CƠ BẢN (ADR 0027 điều 1). Chủ xe cơ bản cũng phải
 * khai được danh tính và tài khoản nhận tiền — nếu không thì chính họ là người không nhận được
 * tiền. Quyền `seller_profile.manage` giới hạn ở chủ gian hàng: đổi tài khoản nhận tiền là quyết
 * định tiền của chính chủ, không phải việc của nhân viên.
 */
@ApiTags('seller-profile')
@Controller('seller-profile')
@TenantScoped()
export class SellerProfileController {
  constructor(private readonly profiles: SellerProfileService) {}

  @Get()
  @RequirePermissions(PERMISSION.SELLER_PROFILE_VIEW)
  @ApiOperation({ summary: 'Hồ sơ người bán của gian hàng (tự tạo bản nháp nếu chưa có)' })
  @ApiOkResponse({ type: SellerProfileDto })
  get(@CurrentTenant() tenant: TenantContext): Promise<SellerProfileDto> {
    return this.profiles.getOrCreate(tenant.tenantId);
  }

  @Put()
  @RequirePermissions(PERMISSION.SELLER_PROFILE_MANAGE)
  @ApiOperation({
    summary: 'Lưu hồ sơ. Đổi TÀI KHOẢN NHẬN TIỀN trên hồ sơ đã xác minh sẽ phải xác minh lại',
  })
  @ApiOkResponse({ type: SellerProfileDto })
  save(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveSellerProfileDto,
  ): Promise<SellerProfileDto> {
    return this.profiles.save(tenant.tenantId, user.id, dto);
  }

  @Post('submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.SELLER_PROFILE_MANAGE)
  @ApiOperation({ summary: 'Gửi xác minh — vào hàng đợi duyệt của nền tảng' })
  @ApiOkResponse({ type: SellerProfileDto })
  submit(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SellerProfileDto> {
    return this.profiles.submit(tenant.tenantId, user.id);
  }
}
