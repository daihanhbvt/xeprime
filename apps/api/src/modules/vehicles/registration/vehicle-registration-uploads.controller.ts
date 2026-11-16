import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ACCOUNT_REALM, PERMISSION } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  Realms,
  RequirePermissions,
  TenantScoped,
} from '../../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../../common/types/request-context';
import {
  PresignVehicleRegistrationDto,
  VehicleRegistrationPresignDto,
  VehicleRegistrationReadResultDto,
} from './dto/vehicle-registration.dto';
import { VehicleRegistrationUploadsService } from './vehicle-registration-uploads.service';

/**
 * Ảnh cà vẹt cho một ô tô SẮP tạo (ADR 0089) — tải lên + đọc trước, lượt `POST /vehicles` gắn nó
 * vào xe. Cùng quyền với tạo xe. Không mở trong phiên hỗ trợ (không `@SupportAction`): nhân sự
 * nền tảng không tải giấy tờ thay chủ xe.
 */
@ApiTags('vehicles')
@Controller('vehicle-registration-uploads')
@TenantScoped()
@Realms(ACCOUNT_REALM.PARTNER)
export class VehicleRegistrationUploadsController {
  constructor(private readonly uploads: VehicleRegistrationUploadsService) {}

  @Post('presign')
  @RequirePermissions(PERMISSION.VEHICLE_CREATE)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Bắt đầu tải ảnh cà vẹt cho ô tô sắp tạo - trả URL PUT riêng tư' })
  @ApiOkResponse({ type: VehicleRegistrationPresignDto })
  presign(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PresignVehicleRegistrationDto,
  ): Promise<VehicleRegistrationPresignDto> {
    return this.uploads.presign(tenant.tenantId, user.id, dto);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.VEHICLE_CREATE)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Kiểm ảnh cà vẹt đã tải rồi đọc các trường (đồng bộ, vài giây)',
    description:
      'Trường không đọc chắc chắn trả `null` - chủ xe nhập tay. Máy đọc tắt/quá tải thì ' +
      '`readerAvailable = false`, ảnh vẫn dùng được. Gọi lại sau khi đã đọc là idempotent.',
  })
  @ApiOkResponse({ type: VehicleRegistrationReadResultDto })
  read(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<VehicleRegistrationReadResultDto> {
    return this.uploads.read(tenant.tenantId, user.id, id);
  }
}
