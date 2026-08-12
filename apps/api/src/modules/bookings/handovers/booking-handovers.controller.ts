import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  API_ERROR_CODE,
  HANDOVER_PHOTO_SLOT_VALUES,
  HANDOVER_TYPE_VALUES,
  PERMISSION,
  type HandoverPhotoSlot,
  type HandoverType,
} from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  TenantScoped,
} from '../../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../../common/types/request-context';
import {
  SourceContractDownloadDto,
  SourceContractPresignDto,
} from '../../vehicles/dto/vehicle-source.dto';
import {
  AttachHandoverPhotoDto,
  CancelHandoverDto,
  ConfirmHandoverDto,
  HandoverContextDto,
  HandoverDto,
  PresignHandoverPhotoDto,
  ResolveHandoverOdometerDto,
  SaveHandoverDto,
} from './dto/handover.dto';
import { HandoversService, type HandoverViewScope } from './handovers.service';

/**
 * Bàn giao xe của MỘT đơn thuê (Wave 7) — nối vào chính route đơn thuê đã có
 * (`/bookings/:id/...`), không dựng khái niệm đơn thứ hai.
 *
 * Bốn mức quyền tách bạch, guard backend là lớp bảo vệ thật (docs/design/12 §10):
 *  - `handovers.view`       — đọc biên bản (KHÔNG mở được ảnh riêng tư)
 *  - `handovers.manage`     — lập/sửa nháp, tải & gỡ ảnh, hủy nháp
 *  - `handovers.confirm`    — XÁC NHẬN: đổi trạng thái đơn + ghi KM có thẩm quyền + đụng lịch
 *  - `handovers.view_files` — mở ảnh hiện trạng riêng tư
 * Người xem được ĐƠN (`bookings.view`) không đương nhiên có mức nào trong bốn mức trên.
 * Bổ sung/sửa KM trên biên bản đã xác nhận đi qua quyền KM (`vehicles.odometer.correct`,
 * giảm số cần thêm `vehicles.odometer.decrease`).
 */
@ApiTags('booking-handovers')
@Controller('bookings/:id/handovers')
@TenantScoped()
export class BookingHandoversController {
  constructor(private readonly handovers: HandoversService) {}

  @Get()
  @RequirePermissions(PERMISSION.HANDOVER_VIEW)
  @ApiOperation({ summary: 'Ngữ cảnh bàn giao của đơn: biên bản giao + trả + số liệu suy ra' })
  @ApiOkResponse({ type: HandoverContextDto })
  context(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') bookingId: string,
  ): Promise<HandoverContextDto> {
    return this.handovers.context(tenant.tenantId, bookingId, scopeOf(tenant));
  }

  @Put(':type')
  @RequirePermissions(PERMISSION.HANDOVER_MANAGE)
  @ApiOperation({ summary: 'Tạo hoặc lưu bản nháp bàn giao (không có hệ quả nghiệp vụ)' })
  @ApiOkResponse({ type: HandoverDto })
  saveDraft(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') bookingId: string,
    @Param('type') type: string,
    @Body() dto: SaveHandoverDto,
  ): Promise<HandoverDto> {
    return this.handovers.saveDraft(
      tenant.tenantId,
      bookingId,
      handoverType(type),
      user.id,
      dto,
      scopeOf(tenant),
    );
  }

  @Post(':type/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.HANDOVER_CONFIRM)
  @ApiOperation({
    summary: 'Xác nhận bàn giao — ghi KM + chuyển trạng thái đơn + lịch + audit, một transaction',
  })
  @ApiOkResponse({ type: HandoverContextDto })
  confirm(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') bookingId: string,
    @Param('type') type: string,
    @Body() dto: ConfirmHandoverDto,
  ): Promise<HandoverContextDto> {
    return this.handovers.confirm(
      tenant.tenantId,
      bookingId,
      handoverType(type),
      user.id,
      dto,
      scopeOf(tenant),
    );
  }

  @Post(':type/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.HANDOVER_MANAGE)
  @ApiOperation({ summary: 'Hủy bản nháp (biên bản đã xác nhận không hủy được)' })
  @ApiOkResponse({ type: HandoverContextDto })
  cancel(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') bookingId: string,
    @Param('type') type: string,
    @Body() dto: CancelHandoverDto,
  ): Promise<HandoverContextDto> {
    return this.handovers.cancel(
      tenant.tenantId,
      bookingId,
      handoverType(type),
      user.id,
      dto,
      scopeOf(tenant),
    );
  }

  /**
   * Bổ sung/sửa KM trên biên bản ĐÃ XÁC NHẬN (task "Thiếu KM trả"). Quyền GIẢM đọc từ scope
   * của request rồi truyền xuống — service không tự suy quyền.
   */
  @Post(':type/odometer')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.VEHICLE_ODOMETER_CORRECT)
  @ApiOperation({ summary: 'Bổ sung/sửa KM của biên bản đã xác nhận (bắt buộc lý do + audit)' })
  @ApiOkResponse({ type: HandoverContextDto })
  resolveOdometer(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') bookingId: string,
    @Param('type') type: string,
    @Body() dto: ResolveHandoverOdometerDto,
  ): Promise<HandoverContextDto> {
    return this.handovers.resolveOdometer(
      tenant.tenantId,
      bookingId,
      handoverType(type),
      user.id,
      dto,
      { canDecrease: tenant.permissions.includes(PERMISSION.VEHICLE_ODOMETER_DECREASE) },
      scopeOf(tenant),
    );
  }

  @Post(':type/photos/presign')
  @RequirePermissions(PERMISSION.HANDOVER_MANAGE)
  @ApiOperation({ summary: 'Presign upload ảnh hiện trạng vào kho riêng tư (Wave 4.1)' })
  @ApiCreatedResponse({ type: SourceContractPresignDto })
  presignPhoto(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') bookingId: string,
    @Param('type') type: string,
    @Body() dto: PresignHandoverPhotoDto,
  ): Promise<SourceContractPresignDto> {
    return this.handovers.presignPhoto(
      tenant.tenantId,
      bookingId,
      handoverType(type),
      user.id,
      dto,
    );
  }

  @Post(':type/photos')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.HANDOVER_MANAGE)
  @ApiOperation({ summary: 'Xác minh object rồi gắn ảnh vào đúng góc chụp' })
  @ApiOkResponse({ type: HandoverDto })
  attachPhoto(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') bookingId: string,
    @Param('type') type: string,
    @Body() dto: AttachHandoverPhotoDto,
  ): Promise<HandoverDto> {
    return this.handovers.attachPhoto(
      tenant.tenantId,
      bookingId,
      handoverType(type),
      user.id,
      dto.fileId,
      dto.slot as HandoverPhotoSlot,
      scopeOf(tenant),
    );
  }

  @Delete(':type/photos/:slot')
  @RequirePermissions(PERMISSION.HANDOVER_MANAGE)
  @ApiOperation({ summary: 'Gỡ ảnh khỏi một góc chụp của bản nháp' })
  @ApiOkResponse({ type: HandoverDto })
  removePhoto(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') bookingId: string,
    @Param('type') type: string,
    @Param('slot') slot: string,
  ): Promise<HandoverDto> {
    return this.handovers.removePhoto(
      tenant.tenantId,
      bookingId,
      handoverType(type),
      user.id,
      photoSlot(slot),
      scopeOf(tenant),
    );
  }

  /** Mở ảnh là quyền RIÊNG — người lập biên bản không đương nhiên đọc lại được kho bằng chứng. */
  @Get(':type/photos/:fileId/download')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSION.HANDOVER_FILE_VIEW)
  @ApiOperation({ summary: 'Phát signed URL ngắn hạn xem một ảnh hiện trạng' })
  @ApiOkResponse({ type: SourceContractDownloadDto })
  downloadPhoto(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') bookingId: string,
    @Param('type') type: string,
    @Param('fileId') fileId: string,
  ): Promise<SourceContractDownloadDto> {
    return this.handovers.downloadPhoto(tenant.tenantId, bookingId, handoverType(type), fileId);
  }
}

/** Người gọi thấy được gì — đọc từ scope của request, KHÔNG bao giờ từ body. */
export function scopeOf(tenant: TenantContext): HandoverViewScope {
  return { canViewFiles: tenant.permissions.includes(PERMISSION.HANDOVER_FILE_VIEW) };
}

/** Tham số đường dẫn cũng là đầu vào của client — validate như mọi đầu vào khác. */
function handoverType(value: string): HandoverType {
  if (!(HANDOVER_TYPE_VALUES as string[]).includes(value)) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'Chiều bàn giao không hợp lệ',
      details: { allowed: HANDOVER_TYPE_VALUES },
    });
  }
  return value as HandoverType;
}

function photoSlot(value: string): HandoverPhotoSlot {
  if (!(HANDOVER_PHOTO_SLOT_VALUES as string[]).includes(value)) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'Góc chụp không hợp lệ',
      details: { allowed: HANDOVER_PHOTO_SLOT_VALUES },
    });
  }
  return value as HandoverPhotoSlot;
}
