import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { APPROVAL_DECISION, PERMISSION, VEHICLE_REVIEW_CHECK_VALUES } from '@xeprime/types';
import { CurrentUser, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  SaveApprovalInternalNoteDto,
  SetVehicleApprovalCheckDto,
  VehicleApprovalApproveDto,
  VehicleApprovalChecksDto,
  VehicleApprovalDetailDto,
  VehicleApprovalInternalNoteDto,
  VehicleApprovalListQueryDto,
  VehicleApprovalPageDto,
  VehicleApprovalReasonDto,
} from './dto/vehicle-approval.dto';
import { PlatformVehicleApprovalService } from './platform-vehicle-approval.service';

/**
 * Màn "Duyệt xe" của nền tảng — CHỈ phiếu duyệt xe (ô tô, xe máy; gian hàng hay cá nhân).
 *
 * Route riêng thay vì thêm `?targetType=vehicle` vào `/platform/approvals`: loại phiếu ở đây là
 * điều kiện của ENDPOINT, không phải một tham số client quên gửi được. Id của phiếu gian hàng gửi
 * vào đây là 404.
 *
 * Cùng scope + quyền với hàng đợi chung (`@PlatformOnly` + `platform.approval.review`); quyết
 * định đi qua cùng một đường (`PlatformApprovalService.decide`).
 */
@ApiTags('platform-admin')
@Controller('platform/vehicle-approvals')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_APPROVAL_REVIEW)
export class PlatformVehicleApprovalsController {
  constructor(private readonly vehicleApprovals: PlatformVehicleApprovalService) {}

  @Get()
  @ApiOperation({
    summary: 'Hàng đợi duyệt xe (lọc loại xe/nguồn đăng/trạng thái/tìm/ngày gửi, kèm số theo tab)',
  })
  @ApiOkResponse({ type: VehicleApprovalPageDto })
  list(@Query() query: VehicleApprovalListQueryDto): Promise<VehicleApprovalPageDto> {
    return this.vehicleApprovals.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Chi tiết phiếu duyệt xe (ảnh chụp lúc gửi, danh mục kiểm tra, lịch sử)',
  })
  @ApiOkResponse({ type: VehicleApprovalDetailDto })
  detail(@Param('id') id: string): Promise<VehicleApprovalDetailDto> {
    return this.vehicleApprovals.detail(id);
  }

  @Put(':id/checks/:checkKey')
  @ApiOperation({ summary: 'Đánh dấu / bỏ đánh dấu một mục kiểm tra thủ công (phiếu đang chờ)' })
  @ApiParam({ name: 'checkKey', enum: VEHICLE_REVIEW_CHECK_VALUES })
  @ApiOkResponse({ type: VehicleApprovalChecksDto })
  setCheck(
    @Param('id') id: string,
    @Param('checkKey') checkKey: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetVehicleApprovalCheckDto,
  ): Promise<VehicleApprovalChecksDto> {
    return this.vehicleApprovals.setCheck(id, checkKey, dto.passed, user.id);
  }

  @Put(':id/internal-note')
  @ApiOperation({ summary: 'Lưu ghi chú nội bộ (không gửi chủ xe; khoá lạc quan theo updatedAt)' })
  @ApiOkResponse({ type: VehicleApprovalInternalNoteDto })
  saveInternalNote(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveApprovalInternalNoteDto,
  ): Promise<VehicleApprovalInternalNoteDto> {
    return this.vehicleApprovals.saveInternalNote(id, dto, user.id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Phê duyệt xe lên chợ (đủ danh mục kiểm tra thủ công)' })
  @ApiOkResponse({ type: VehicleApprovalDetailDto })
  approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VehicleApprovalApproveDto,
  ): Promise<VehicleApprovalDetailDto> {
    return this.vehicleApprovals.decide(APPROVAL_DECISION.APPROVE, id, user.id, undefined, {
      expectedCapturedAt: dto.expectedCapturedAt,
    });
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Từ chối xe (lý do gửi chủ xe là bắt buộc)' })
  @ApiOkResponse({ type: VehicleApprovalDetailDto })
  reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VehicleApprovalReasonDto,
  ): Promise<VehicleApprovalDetailDto> {
    return this.vehicleApprovals.decide(APPROVAL_DECISION.REJECT, id, user.id, dto.reason);
  }

  @Post(':id/request-revision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Yêu cầu chủ xe bổ sung (lý do là bắt buộc)' })
  @ApiOkResponse({ type: VehicleApprovalDetailDto })
  requestRevision(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VehicleApprovalReasonDto,
  ): Promise<VehicleApprovalDetailDto> {
    return this.vehicleApprovals.decide(
      APPROVAL_DECISION.REQUEST_REVISION,
      id,
      user.id,
      dto.reason,
    );
  }
}
