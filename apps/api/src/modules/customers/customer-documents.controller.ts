import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { CustomerDocumentsService } from './customer-documents.service';
import {
  CustomerDocumentDownloadDto,
  CustomerDocumentDto,
  CustomerDocumentPresignDto,
  PresignCustomerDocumentDto,
  VerifyCustomerDocumentDto,
} from './dto/customer.dto';

/**
 * Giấy tờ tuỳ thân của khách — CCCD / GPLX gian hàng chụp lúc giao xe.
 *
 * Ba mức quyền, tách vì mức thiệt hại khác hẳn nhau:
 *  - `customers.view` — thấy ĐÃ CÓ giấy tờ gì, hạn tới bao giờ (nhân viên cần biết để đối chiếu);
 *  - `customers.documents.manage` — tải lên / gỡ;
 *  - `customers.documents.view_files` — MỞ được file, và mỗi lần mở là một dòng audit.
 *
 * Không endpoint nào ở đây trả `objectKey` hay một URL sống lâu: xem file luôn phải đi qua
 * `GET .../download` để backend còn kiểm quyền và ghi vết.
 */
@ApiTags('customers')
@Controller('customers/:id/documents')
@TenantScoped()
export class CustomerDocumentsController {
  constructor(private readonly documents: CustomerDocumentsService) {}

  @Get()
  @RequirePermissions(PERMISSION.CUSTOMER_VIEW)
  @ApiOperation({ summary: 'Giấy tờ của khách (metadata — không có đường dẫn file)' })
  @ApiOkResponse({ type: [CustomerDocumentDto] })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<CustomerDocumentDto[]> {
    return this.documents.list(tenant.tenantId, id);
  }

  @Post('presign')
  @RequirePermissions(PERMISSION.CUSTOMER_DOCUMENT_MANAGE)
  @ApiOperation({ summary: 'Bước 1 — xin URL PUT lên bucket riêng tư (tạo bản ghi `pending`)' })
  @ApiCreatedResponse({ type: CustomerDocumentPresignDto })
  presign(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PresignCustomerDocumentDto,
  ): Promise<CustomerDocumentPresignDto> {
    return this.documents.presign(tenant.tenantId, id, user.id, dto);
  }

  @Post(':documentId/complete')
  @RequirePermissions(PERMISSION.CUSTOMER_DOCUMENT_MANAGE)
  @ApiOperation({
    summary: 'Bước 2 — xác minh tệp đã tải lên (HEAD + chữ ký byte đầu) rồi chuyển `ready`',
  })
  @ApiCreatedResponse({ type: CustomerDocumentDto })
  complete(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ): Promise<CustomerDocumentDto> {
    return this.documents.complete(tenant.tenantId, id, user.id, documentId);
  }

  @Get(':documentId/download')
  @RequirePermissions(PERMISSION.CUSTOMER_DOCUMENT_FILE_VIEW)
  @ApiOperation({ summary: 'Signed GET ngắn hạn để mở giấy tờ — ghi audit từng lần' })
  @ApiOkResponse({ type: CustomerDocumentDownloadDto })
  download(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ): Promise<CustomerDocumentDownloadDto> {
    return this.documents.download(tenant.tenantId, id, user.id, documentId);
  }

  @Post(':documentId/verify')
  @RequirePermissions(PERMISSION.CUSTOMER_DOCUMENT_MANAGE)
  @ApiOperation({
    summary: 'Ghi nhận đã đối chiếu giấy tờ (thủ công — VNeID/bản gốc), có audit',
  })
  async verify(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Body() dto: VerifyCustomerDocumentDto,
  ): Promise<CustomerDocumentDto> {
    return this.documents.verify(tenant.tenantId, id, user.id, documentId, dto);
  }

  @Delete(':documentId')
  @RequirePermissions(PERMISSION.CUSTOMER_DOCUMENT_MANAGE)
  @ApiOperation({ summary: 'Gỡ giấy tờ (soft-delete + audit)' })
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ): Promise<{ ok: true }> {
    await this.documents.remove(tenant.tenantId, id, user.id, documentId);
    return { ok: true };
  }
}
