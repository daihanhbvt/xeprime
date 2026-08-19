import { Body, Controller, Post, ServiceUnavailableException } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { API_ERROR_CODE, PERMISSION } from '@xeprime/types';
import { CurrentTenant, RequirePermissions, TenantScoped } from '../../common/decorators';
import type { TenantContext } from '../../common/types/request-context';
import { PresignImageDto, UploadPresignDto } from './dto/storage.dto';
import { R2Service } from './r2.service';

/**
 * Presign upload ảnh lên R2 cho portal quản lý — client PUT thẳng lên R2, nhị phân không đi
 * qua API (cùng pattern chat, ADR 0009 §5) nhưng KHÔNG gate theo firebase: upload ảnh xe/shop
 * độc lập với chat realtime.
 *
 * Prefix key luôn dựng server-side từ `@CurrentTenant` — client không tự chọn được chỗ ghi
 * (CLAUDE.md mục 5). Mỗi route một permission đúng với tài nguyên mà ảnh phục vụ.
 */
@ApiTags('uploads')
@Controller('uploads')
@TenantScoped()
export class StorageController {
  constructor(private readonly r2: R2Service) {}

  @Post('vehicle-images/presign')
  @RequirePermissions(PERMISSION.VEHICLE_UPDATE)
  @ApiOperation({ summary: 'Presign upload ảnh xe (đại diện/gallery) lên R2' })
  @ApiCreatedResponse({ type: UploadPresignDto })
  presignVehicleImage(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: PresignImageDto,
  ): Promise<UploadPresignDto> {
    this.assertConfigured();
    return this.r2.presignUpload({
      prefix: `tenants/${tenant.tenantId}/vehicles`,
      fileName: dto.fileName,
      contentType: dto.contentType,
      contentLength: dto.fileSize,
    });
  }

  // Presign hợp đồng nguồn xe Wave 4 (bucket public) đã GỠ ở Wave 4.1 — hợp đồng là tài liệu
  // riêng tư, đi qua POST /vehicles/:id/source/contracts/presign nhắm vào R2_PRIVATE_BUCKET.

  @Post('shop-media/presign')
  @RequirePermissions(PERMISSION.TENANT_UPDATE)
  @ApiOperation({ summary: 'Presign upload logo/ảnh bìa gian hàng lên R2' })
  @ApiCreatedResponse({ type: UploadPresignDto })
  presignShopMedia(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: PresignImageDto,
  ): Promise<UploadPresignDto> {
    this.assertConfigured();
    return this.r2.presignUpload({
      prefix: `tenants/${tenant.tenantId}/shop`,
      fileName: dto.fileName,
      contentType: dto.contentType,
      contentLength: dto.fileSize,
    });
  }

  /**
   * Ảnh minh chứng (bill/hoá đơn) của phiếu thu-chi. Bucket CÔNG KHAI, cùng mức phơi bày với ảnh
   * xe — không phải kho riêng tư như hợp đồng nguồn xe: đây là ảnh hoá đơn xăng, rửa xe, biên lai
   * chuyển khoản, không mang giấy tờ tuỳ thân.
   */
  @Post('receipt-attachments/presign')
  @RequirePermissions(PERMISSION.RECEIPT_CREATE)
  @ApiOperation({ summary: 'Presign upload ảnh minh chứng phiếu thu/chi lên R2' })
  @ApiCreatedResponse({ type: UploadPresignDto })
  presignReceiptAttachment(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: PresignImageDto,
  ): Promise<UploadPresignDto> {
    this.assertConfigured();
    return this.r2.presignUpload({
      prefix: `tenants/${tenant.tenantId}/receipts`,
      fileName: dto.fileName,
      contentType: dto.contentType,
      contentLength: dto.fileSize,
    });
  }

  /** Thiếu env R2 → 503 mã ổn định để FE hiện hướng dẫn, thay vì 500 khó hiểu từ getOrThrow. */
  private assertConfigured(): void {
    if (!this.r2.enabled) {
      throw new ServiceUnavailableException({
        code: API_ERROR_CODE.UPLOADS_NOT_CONFIGURED,
        message: 'Upload ảnh chưa được cấu hình (thiếu R2_* trong môi trường)',
      });
    }
  }
}
