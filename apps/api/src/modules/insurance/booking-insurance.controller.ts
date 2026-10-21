import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION, SUPPORT_CAPABILITY } from '@xeprime/types';
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
import { InsuranceCertificateDto, InsuranceCoverageDto } from './dto/insurance.dto';
import { InsuranceReadService } from './insurance-read.service';

/**
 * Giấy chứng nhận bảo hiểm của MỘT đơn — phía gian hàng / chủ xe, CHỈ ĐỌC (ADR 0064).
 *
 * Endpoint riêng thay vì một trường trên `BookingDetailDto`: chi tiết đơn được trả từ hàng chục
 * đường ghi (tạo, chuyển trạng thái, gán tài xế…) và không đường nào trong số đó cần đọc thêm
 * bảng hợp đồng bảo hiểm. Màn chi tiết đơn tự gọi cái này.
 *
 * `tenantId` lấy từ scope và nằm TRONG truy vấn: hỏi đơn của gian hàng khác ⇒ danh sách rỗng.
 */
@ApiTags('bookings')
@Controller('bookings')
@TenantScoped()
@Realms(ACCOUNT_REALM.PARTNER)
export class BookingInsuranceController {
  constructor(private readonly read: InsuranceReadService) {}

  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Get(':id/insurance-certificates')
  @RequirePermissions(PERMISSION.BOOKING_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.BOOKING_VIEW)
  @ApiOperation({ summary: 'Giấy chứng nhận bảo hiểm đã cấp của một đơn' })
  @ApiOkResponse({ type: [InsuranceCertificateDto] })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<InsuranceCertificateDto[]> {
    return this.read.certificatesForBooking(id, { tenantId: tenant.tenantId });
  }

  /**
   * Tình trạng bảo hiểm theo TỪNG sản phẩm khách đã trả — kể cả khi GCN chưa có (chờ/đang phát
   * hành, lỗi) hay đã hoàn/thu hồi. `insurance-certificates` giữ nguyên cho client cũ: nó là tập
   * con (`status = issued`) của danh sách này.
   */
  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Get(':id/insurance-coverage')
  @RequirePermissions(PERMISSION.BOOKING_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.BOOKING_VIEW)
  @ApiOperation({ summary: 'Tình trạng bảo hiểm của một đơn, theo từng sản phẩm' })
  @ApiOkResponse({ type: [InsuranceCoverageDto] })
  coverage(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<InsuranceCoverageDto[]> {
    return this.read.coverageForBooking(id, { tenantId: tenant.tenantId });
  }
}
