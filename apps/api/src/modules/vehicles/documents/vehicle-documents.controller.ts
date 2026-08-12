import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  TenantScoped,
} from '../../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../../common/types/request-context';
import { SourceContractDownloadDto, SourceContractPresignDto } from '../dto/vehicle-source.dto';
import {
  ApplyOcrFieldsDto,
  AttachDocumentVersionDto,
  PresignVehicleDocumentDto,
  SaveVehicleDocumentDto,
  VehicleDocumentDetailDto,
  VehicleDocumentListDto,
  VehicleDocumentOcrJobDto,
  VehicleDocumentVersionListDto,
} from './dto/vehicle-document.dto';
import { VehicleDocumentsService } from './vehicle-documents.service';

/**
 * Giấy tờ xe (Wave 5 + 5.1) — tài liệu pháp lý RIÊNG TƯ, BỐN mức quyền tách bạch
 * (docs/design/12 §10):
 *  - `vehicles.documents.view`         — TRẠNG THÁI (DTO summary, không PII/tên file/OCR)
 *  - `vehicles.documents.view_details` — metadata nhạy cảm (tên/địa chỉ chủ xe, số giấy tờ…)
 *  - `vehicles.documents.view_files`   — mở/tải FILE + lịch sử phiên bản
 *  - `vehicles.documents.manage`       — thêm/sửa/tải file/OCR
 * Không mức nào bao hàm mức khác ở tầng guard. Guard backend là lớp bảo vệ thật;
 * ẩn nút ở FE không bảo vệ gì.
 */
@ApiTags('vehicle-documents')
@Controller('vehicles/:id/documents')
@TenantScoped()
export class VehicleDocumentsController {
  constructor(private readonly documents: VehicleDocumentsService) {}

  @Get()
  @RequirePermissions(PERMISSION.VEHICLE_DOCUMENT_VIEW)
  @ApiOperation({ summary: 'Danh sách TRẠNG THÁI giấy tờ của một xe (summary — không PII)' })
  @ApiOkResponse({ type: VehicleDocumentListDto })
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') vehicleId: string,
  ): Promise<VehicleDocumentListDto> {
    return { data: await this.documents.list(tenant.tenantId, vehicleId) };
  }

  /** Metadata nhạy cảm — quyền riêng, KHÔNG suy ra từ `view` và không kèm quyền mở file. */
  @Get(':documentId')
  @RequirePermissions(PERMISSION.VEHICLE_DOCUMENT_DETAIL_VIEW)
  @ApiOperation({ summary: 'Chi tiết metadata một giấy tờ (không kèm lịch sử file/OCR)' })
  @ApiOkResponse({ type: VehicleDocumentDetailDto })
  getOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') vehicleId: string,
    @Param('documentId') documentId: string,
  ): Promise<VehicleDocumentDetailDto> {
    return this.documents.getOne(tenant.tenantId, vehicleId, documentId);
  }

  /** Lịch sử phiên bản (tên file là metadata file riêng tư) — sau quyền mở FILE. */
  @Get(':documentId/versions')
  @RequirePermissions(PERMISSION.VEHICLE_DOCUMENT_FILE_VIEW)
  @ApiOperation({ summary: 'Lịch sử phiên bản file của một giấy tờ' })
  @ApiOkResponse({ type: VehicleDocumentVersionListDto })
  async listVersions(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') vehicleId: string,
    @Param('documentId') documentId: string,
  ): Promise<VehicleDocumentVersionListDto> {
    return { data: await this.documents.listVersions(tenant.tenantId, vehicleId, documentId) };
  }

  @Post()
  @RequirePermissions(PERMISSION.VEHICLE_DOCUMENT_MANAGE)
  @ApiOperation({ summary: 'Tạo hồ sơ giấy tờ (metadata — file gắn sau)' })
  @ApiCreatedResponse({ type: VehicleDocumentDetailDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Body() dto: SaveVehicleDocumentDto,
  ): Promise<VehicleDocumentDetailDto> {
    return this.documents.create(tenant.tenantId, vehicleId, user.id, dto);
  }

  @Patch(':documentId')
  @RequirePermissions(PERMISSION.VEHICLE_DOCUMENT_MANAGE)
  @ApiOperation({ summary: 'Cập nhật metadata giấy tờ (optimistic concurrency)' })
  @ApiOkResponse({ type: VehicleDocumentDetailDto })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Param('documentId') documentId: string,
    @Body() dto: SaveVehicleDocumentDto,
  ): Promise<VehicleDocumentDetailDto> {
    return this.documents.update(tenant.tenantId, vehicleId, user.id, documentId, dto);
  }

  @Post(':documentId/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.VEHICLE_DOCUMENT_MANAGE)
  @ApiOperation({ summary: 'Lưu trữ giấy tờ (không xoá lịch sử/file)' })
  archive(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Param('documentId') documentId: string,
  ): Promise<{ id: string }> {
    return this.documents.archive(tenant.tenantId, vehicleId, user.id, documentId);
  }

  @Post(':documentId/versions/presign')
  @RequirePermissions(PERMISSION.VEHICLE_DOCUMENT_MANAGE)
  @ApiOperation({ summary: 'Presign upload file giấy tờ vào kho riêng tư (Wave 4.1)' })
  @ApiCreatedResponse({ type: SourceContractPresignDto })
  presign(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Param('documentId') documentId: string,
    @Body() dto: PresignVehicleDocumentDto,
  ): Promise<SourceContractPresignDto> {
    return this.documents.presignVersion(tenant.tenantId, vehicleId, user.id, documentId, dto);
  }

  @Post(':documentId/versions')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.VEHICLE_DOCUMENT_MANAGE)
  @ApiOperation({ summary: 'Xác minh object rồi gắn thành phiên bản mới (bản cũ vào lịch sử)' })
  @ApiOkResponse({ type: VehicleDocumentDetailDto })
  attach(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Param('documentId') documentId: string,
    @Body() dto: AttachDocumentVersionDto,
  ): Promise<VehicleDocumentDetailDto> {
    return this.documents.attachVersion(tenant.tenantId, vehicleId, user.id, documentId, dto);
  }

  /** Mở FILE là quyền riêng — staff xem trạng thái không tự động mở được tài liệu nhạy cảm. */
  @Get(':documentId/versions/:versionId/download')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSION.VEHICLE_DOCUMENT_FILE_VIEW)
  @ApiOperation({ summary: 'Phát signed URL ngắn hạn xem/tải một phiên bản giấy tờ' })
  @ApiOkResponse({ type: SourceContractDownloadDto })
  download(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') vehicleId: string,
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
  ): Promise<SourceContractDownloadDto> {
    return this.documents.downloadVersion(tenant.tenantId, vehicleId, documentId, versionId);
  }

  /** Dữ liệu OCR (giá trị nhận dạng/bằng chứng) CHỈ trả qua hai endpoint manage dưới đây. */
  @Post(':documentId/ocr')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.VEHICLE_DOCUMENT_MANAGE)
  @ApiOperation({ summary: 'Yêu cầu trích xuất OCR (chưa cấu hình provider → 503 kiểm soát)' })
  @ApiOkResponse({ type: VehicleDocumentOcrJobDto })
  requestOcr(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Param('documentId') documentId: string,
  ): Promise<VehicleDocumentOcrJobDto> {
    return this.documents.requestOcr(tenant.tenantId, vehicleId, user.id, documentId);
  }

  /**
   * Áp kết quả đối soát — client chọn TÊN trường, giá trị lấy từ job. Kèm quyền
   * `vehicles.update` vì có thể ghi biển số vào hồ sơ xe (đi qua luật duyệt lại ADR 0008).
   */
  @Post(':documentId/ocr/:jobId/apply')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.VEHICLE_DOCUMENT_MANAGE, PERMISSION.VEHICLE_UPDATE)
  @ApiOperation({ summary: 'Áp các trường OCR đã chọn (fields rỗng = bỏ qua/đã đối soát)' })
  @ApiOkResponse({ type: VehicleDocumentDetailDto })
  applyOcr(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Param('documentId') documentId: string,
    @Param('jobId') jobId: string,
    @Body() dto: ApplyOcrFieldsDto,
  ): Promise<VehicleDocumentDetailDto> {
    return this.documents.applyOcr(tenant.tenantId, vehicleId, user.id, documentId, jobId, dto);
  }
}
