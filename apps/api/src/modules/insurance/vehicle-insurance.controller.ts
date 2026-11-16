import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, API_ERROR_CODE, PERMISSION, SUPPORT_CAPABILITY } from '@xeprime/types';
import {
  BRANCH_SCOPED_RESOURCE,
  BranchScoped,
  CurrentTenant,
  Realms,
  RequirePermissions,
  SupportAction,
  TenantScoped,
} from '../../common/decorators';
import type { TenantContext } from '../../common/types/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { VehicleInsuranceStatusDto } from './dto/insurance.dto';
import { InsuranceEligibilityService } from './insurance-eligibility.service';

/**
 * Tình trạng bảo hiểm vật chất xe của MỘT xe — phía chủ xe (ADR 0088 điều 2).
 *
 * Màn sửa xe hiện "Xe đủ điều kiện bảo hiểm MIC" hoặc danh sách việc còn thiếu (giá trị xe, ảnh,
 * cà vẹt, thông tin xe). `applies = false` khi nền tảng không bán bảo hiểm theo bậc ⇒ ẩn hẳn khối.
 */
@ApiTags('vehicles')
@Controller('vehicles')
@TenantScoped()
@Realms(ACCOUNT_REALM.PARTNER)
export class VehicleInsuranceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: InsuranceEligibilityService,
  ) {}

  @BranchScoped(BRANCH_SCOPED_RESOURCE.VEHICLE)
  @Get(':id/insurance-eligibility')
  @RequirePermissions(PERMISSION.VEHICLE_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.VEHICLE_VIEW)
  @ApiOperation({ summary: 'Xe đã đủ điều kiện bán kèm bảo hiểm vật chất xe chưa (ADR 0088)' })
  @ApiOkResponse({ type: VehicleInsuranceStatusDto })
  async status(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<VehicleInsuranceStatusDto> {
    // Phạm vi gian hàng nằm TRONG truy vấn: xe của gian hàng khác ⇒ 404.
    const owned = await this.prisma.vehicle.findFirst({
      where: { id, tenantId: tenant.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!owned) {
      throw new NotFoundException({ code: API_ERROR_CODE.NOT_FOUND, message: 'Không tìm thấy xe' });
    }
    return this.eligibility.statusFor(id);
  }
}
