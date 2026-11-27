import {
  BookingDriverHistoryItemDto,
  DriverWageQuoteDto,
  UpdateDriverWageDto,
} from '../drivers/dto/driver.dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, API_ERROR_CODE, PERMISSION, SUPPORT_CAPABILITY } from '@xeprime/types';
import {
  BRANCH_SCOPED_RESOURCE,
  BranchScoped,
  CurrentTenant,
  CurrentUser,
  Realms,
  RequirePermissions,
  SupportAction,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import {
  AssignBookingDriverDto,
  BookingCollateralInputDto,
  BookingCollateralListDto,
  BookingDetailDto,
  BookingHandoverPrepDto,
  BookingListQueryDto,
  BookingPageDto,
  BookingSourceLabelsDto,
  CreateBookingDto,
  SetHandoverPrepCheckDto,
  TransitionBookingDto,
  UpdateBookingDeliveryFeeDto,
  UpdateBookingDto,
  UpdateBookingSourceDto,
} from './dto/booking.dto';
import { BookingCollateralsService } from './booking-collaterals.service';
import { BookingsService } from './bookings.service';

/**
 * Quản lý đơn thuê của gian hàng — tất cả tenant-scoped.
 *
 * `tenantId`/`userId` LUÔN lấy từ scope (`@CurrentTenant`/`@CurrentUser`), không nhận từ client
 * (CLAUDE.md mục 5). Chống trùng lịch nằm ở constraint DB (ADR 0006), không ở tầng app.
 */
@ApiTags('bookings')
@Controller('bookings')
@TenantScoped()
@Realms(ACCOUNT_REALM.PARTNER)
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly collaterals: BookingCollateralsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSION.BOOKING_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.BOOKING_VIEW)
  @ApiOperation({ summary: 'Danh sách đơn thuê (phân trang, filter, sort)' })
  @ApiOkResponse({ type: BookingPageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: BookingListQueryDto,
  ): Promise<BookingPageDto> {
    return this.bookings.list(
      tenant.tenantId,
      query,
      tenant.allowedBranchIds,
    ) as Promise<BookingPageDto>;
  }

  /*
   * ⚠️ Đứng TRƯỚC `@Get(':id')` — Nest khớp route theo thứ tự khai báo.
   */
  @Get('source-labels')
  @RequirePermissions(PERMISSION.BOOKING_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.BOOKING_VIEW)
  @ApiOperation({
    summary: 'Nhãn nguồn đơn gian hàng đã từng nhập (gợi ý cho hộp lập đơn và bộ lọc - ADR 0110)',
  })
  @ApiOkResponse({ type: BookingSourceLabelsDto })
  sourceLabels(@CurrentTenant() tenant: TenantContext): Promise<BookingSourceLabelsDto> {
    return this.bookings.sourceLabels(tenant.tenantId);
  }

  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Get(':id')
  @RequirePermissions(PERMISSION.BOOKING_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.BOOKING_VIEW)
  @ApiOperation({ summary: 'Chi tiết một đơn thuê' })
  @ApiOkResponse({ type: BookingDetailDto })
  getOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<BookingDetailDto> {
    return this.bookings.getOne(tenant.tenantId, id);
  }

  /*
   * LẬP ĐƠN TAY mở cho MỌI chủ xe, cả hai tuyến (ADR 0110, ghi đè quyết định 26/10/2026 từng khoá
   * nó cho tuyến gói). Đơn lập tay nằm NGOÀI SÀN: không phí sàn, không hoa hồng, không thuế, không
   * bảo hiểm, và mang NGUỒN chủ xe chọn (`source` — không bao giờ `xeprime`). Chủ xe dùng XePrime
   * làm lịch gốc cho mọi kênh; giao dịch ngoài sàn được chấp nhận là thứ không chặn được bằng code.
   */
  @Post()
  @RequirePermissions(PERMISSION.BOOKING_CREATE)
  @ApiOperation({ summary: 'Tạo đơn thuê (giữ chỗ lịch, chặn trùng bằng constraint DB)' })
  @ApiCreatedResponse({ type: BookingDetailDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingDto,
  ): Promise<BookingDetailDto> {
    return this.bookings.create(tenant.tenantId, user.id, dto);
  }

  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Patch(':id/source')
  @RequirePermissions(PERMISSION.BOOKING_UPDATE)
  @ApiOperation({
    summary:
      'Đổi nguồn của một đơn tự lập (có audit). Đơn qua sàn: 409 `BOOKING_SOURCE_LOCKED` - ADR 0110',
  })
  @ApiOkResponse({ type: BookingDetailDto })
  updateSource(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBookingSourceDto,
  ): Promise<BookingDetailDto> {
    return this.bookings.updateSource(tenant.tenantId, id, user.id, dto);
  }

  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Patch(':id')
  @RequirePermissions(PERMISSION.BOOKING_UPDATE)
  @ApiOperation({ summary: 'Sửa đơn (đổi khung giờ sẽ reschedule lịch)' })
  @ApiOkResponse({ type: BookingDetailDto })
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateBookingDto,
  ): Promise<BookingDetailDto> {
    return this.bookings.update(tenant.tenantId, id, dto);
  }

  /**
   * Chốt phí giao nhận sau khi chủ xe và khách đã thống nhất ngoài ứng dụng (Wave 9).
   *
   * Endpoint riêng thay vì dùng `PATCH :id`: việc này cần vết audit riêng (ai đổi, từ bao nhiêu
   * sang bao nhiêu) và tổng tiền phải do server tính lại. Không có bước khách xác nhận.
   */
  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Patch(':id/delivery-fee')
  @RequirePermissions(PERMISSION.BOOKING_UPDATE)
  @ApiOperation({ summary: 'Cập nhật phí giao nhận của đơn (server tính lại tổng, có audit)' })
  @ApiOkResponse({ type: BookingDetailDto })
  updateDeliveryFee(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBookingDeliveryFeeDto,
  ): Promise<BookingDetailDto> {
    return this.bookings.updateDeliveryFee(tenant.tenantId, id, user.id, dto);
  }

  /** Sổ tài sản thế chấp của đơn (ADR 0109) — cũ nhất trước. */
  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Get(':id/collaterals')
  @RequirePermissions(PERMISSION.BOOKING_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.BOOKING_VIEW)
  @ApiOperation({ summary: 'Tài sản thế chấp khách để lại cho đơn' })
  @ApiOkResponse({ type: BookingCollateralListDto })
  listCollaterals(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<BookingCollateralListDto> {
    return this.collaterals.list(tenant.tenantId, id);
  }

  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Post(':id/collaterals')
  @RequirePermissions(PERMISSION.BOOKING_UPDATE)
  @ApiOperation({
    summary:
      'Ghi thêm một món tài sản thế chấp (đơn chưa khép, tối đa 10 món - 409 `BOOKING_COLLATERAL_LOCKED`)',
  })
  @ApiCreatedResponse({ type: BookingCollateralListDto })
  addCollateral(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: BookingCollateralInputDto,
  ): Promise<BookingCollateralListDto> {
    return this.collaterals.add(tenant.tenantId, id, user.id, dto);
  }

  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Patch(':id/collaterals/:collateralId')
  @RequirePermissions(PERMISSION.BOOKING_UPDATE)
  @ApiOperation({
    summary:
      'Sửa loại / mô tả một món tài sản (đơn chưa khép, món chưa trả - 409 `BOOKING_COLLATERAL_LOCKED`)',
  })
  @ApiOkResponse({ type: BookingCollateralListDto })
  updateCollateral(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('collateralId') collateralId: string,
    @Body() dto: BookingCollateralInputDto,
  ): Promise<BookingCollateralListDto> {
    return this.collaterals.update(tenant.tenantId, id, collateralId, user.id, dto);
  }

  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Delete(':id/collaterals/:collateralId')
  @RequirePermissions(PERMISSION.BOOKING_UPDATE)
  @ApiOperation({ summary: 'Gỡ một món ghi nhầm (đơn chưa khép, món chưa trả)' })
  @ApiOkResponse({ type: BookingCollateralListDto })
  removeCollateral(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('collateralId') collateralId: string,
  ): Promise<BookingCollateralListDto> {
    return this.collaterals.remove(tenant.tenantId, id, collateralId, user.id);
  }

  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Post(':id/collaterals/:collateralId/return')
  @RequirePermissions(PERMISSION.BOOKING_UPDATE)
  @ApiOperation({ summary: 'Đánh dấu đã trả tài sản cho khách (mọi trạng thái đơn, idempotent)' })
  @ApiCreatedResponse({ type: BookingCollateralListDto })
  returnCollateral(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('collateralId') collateralId: string,
  ): Promise<BookingCollateralListDto> {
    return this.collaterals.setReturned(tenant.tenantId, id, collateralId, user.id, true);
  }

  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Post(':id/collaterals/:collateralId/unreturn')
  @RequirePermissions(PERMISSION.BOOKING_UPDATE)
  @ApiOperation({ summary: 'Hoàn tác "đã trả" của một món tài sản (bấm nhầm)' })
  @ApiCreatedResponse({ type: BookingCollateralListDto })
  unreturnCollateral(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('collateralId') collateralId: string,
  ): Promise<BookingCollateralListDto> {
    return this.collaterals.setReturned(tenant.tenantId, id, collateralId, user.id, false);
  }

  /**
   * Đánh dấu / bỏ đánh dấu TAY một việc "Chuẩn bị bàn giao" (03/11/2026) — khi việc diễn ra ngoài
   * hệ thống. Việc tiền không đánh dấu tay được (phải là phiếu thu thật). Cùng quyền với soạn biên
   * bản bàn giao; phiên hỗ trợ không dùng được (không khai `@SupportAction`).
   */
  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Put(':id/handover-prep')
  @RequirePermissions(PERMISSION.HANDOVER_MANAGE)
  @ApiOperation({ summary: 'Đánh dấu / bỏ đánh dấu tay một việc chuẩn bị bàn giao' })
  @ApiOkResponse({ type: BookingHandoverPrepDto })
  setHandoverPrepCheck(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetHandoverPrepCheckDto,
  ): Promise<BookingHandoverPrepDto> {
    return this.bookings.setHandoverPrepCheck(tenant.tenantId, id, user.id, dto);
  }

  /** Gán/bỏ gán tài xế (17/08) — endpoint riêng vì cần vết audit riêng (ai gán, gán ai). */
  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Patch(':id/driver')
  @RequirePermissions(PERMISSION.BOOKING_UPDATE)
  @ApiOperation({
    summary: 'Gán/bỏ gán tài xế (liên kết hoặc nội bộ) cho đơn (có audit)',
    description:
      '`driverId`: gán tài xế liên kết (lượt chờ tài xế nhận, ADR 0063); `null` = bỏ gán (gỡ cả tài xế ngoài hệ thống còn trên đơn cũ). ' +
      '`internalDriverId`: gán tài xế NỘI BỘ từ danh bạ (ADR 0108) - đã nhận ngay, chống trùng lịch 409 `DRIVER_BUSY`. ' +
      '`externalDriver` đã bỏ (ADR 0074 điều 4) ⇒ 422 `EXTERNAL_DRIVER_NOT_SUPPORTED`. ' +
      'Chỉ đơn `with_driver` chưa giao xe: 422 `DRIVER_ASSIGN_SERVICE_NOT_SUPPORTED`, 409 `DRIVER_ASSIGNMENT_LOCKED`.',
  })
  @ApiOkResponse({ type: BookingDetailDto })
  assignDriver(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignBookingDriverDto,
  ): Promise<BookingDetailDto> {
    // Tài xế ngoài hệ thống đã bỏ (ADR 0074 điều 4) — app cũ còn gửi khoá này thì nói đúng lý do.
    if (dto.externalDriver !== undefined) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODE.EXTERNAL_DRIVER_NOT_SUPPORTED,
        message: 'XePrime không còn nhận tài xế ngoài hệ thống - gán tài xế liên kết',
      });
    }
    if (dto.internalDriverId !== undefined) {
      return this.bookings.assignInternalDriver(tenant.tenantId, id, user.id, dto.internalDriverId);
    }
    return this.bookings.assignDriver(
      tenant.tenantId,
      id,
      user.id,
      dto.driverId ?? null,
      dto.wageAmount ?? null,
    );
  }

  /** Số liệu tiền công cho hộp gán tài xế của đơn (ADR 0075) — server tính, client chỉ đọc. */
  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Get(':id/driver-wage-quote')
  @RequirePermissions(PERMISSION.BOOKING_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.BOOKING_VIEW)
  @ApiOperation({
    summary: 'Tiền công gợi ý khi gán tài xế cho đơn: số ngày, mức mặc định × số ngày, khoảng hợp lệ',
  })
  @ApiOkResponse({ type: DriverWageQuoteDto })
  driverWageQuote(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<DriverWageQuoteDto> {
    return this.bookings.driverWageQuote(tenant.tenantId, id);
  }

  /**
   * Sửa tiền công của MỘT lượt gán (ADR 0075). XePrime chỉ ghi nhận số hai bên thoả thuận — không
   * chạm tiền giữ chỗ, quyết toán hay ví. Không cần tài xế đồng ý; mỗi lần đổi một dòng lịch sử.
   */
  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Patch(':id/driver-assignments/:assignmentId/wage')
  @RequirePermissions(PERMISSION.BOOKING_UPDATE)
  @ApiOperation({
    summary: 'Sửa tiền công tài xế của một lượt gán (có lịch sử + audit)',
    description:
      'Khoảng hợp lệ: chuyến chạy/đã xong `[min × N; max × N]`, chuyến đã nhận nhưng không chạy `[0; max × N]` (chính sách hiện hành). ' +
      '422 `DRIVER_WAGE_OUT_OF_RANGE` (details min/max) · 409 `DRIVER_WAGE_LOCKED` (quá kết thúc + 72h) · 422 `DRIVER_WAGE_NOT_APPLICABLE` (lượt chưa từng được nhận). Trả lịch sử tài xế của đơn.',
  })
  @ApiOkResponse({ type: [BookingDriverHistoryItemDto] })
  updateDriverWage(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: UpdateDriverWageDto,
  ): Promise<BookingDriverHistoryItemDto[]> {
    return this.bookings.updateDriverWage(tenant.tenantId, id, assignmentId, user.id, dto);
  }

  /** Lịch sử gán tài xế của đơn (ADR 0063) — mỗi lượt một dòng, cũ nhất trước. */
  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Get(':id/driver-history')
  @RequirePermissions(PERMISSION.BOOKING_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.BOOKING_VIEW)
  @ApiOperation({ summary: 'Lịch sử gán tài xế của một đơn thuê' })
  @ApiOkResponse({ type: [BookingDriverHistoryItemDto] })
  driverHistory(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<BookingDriverHistoryItemDto[]> {
    return this.bookings.driverHistory(tenant.tenantId, id);
  }

  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Post(':id/transition')
  @RequirePermissions(PERMISSION.BOOKING_UPDATE)
  @ApiOperation({
    summary:
      'Chuyển trạng thái đơn (validate canTransitionBooking; huỷ/no_show bắt buộc có lý do, ghi vào audit)',
  })
  @ApiOkResponse({ type: BookingDetailDto })
  transition(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TransitionBookingDto,
  ): Promise<BookingDetailDto> {
    return this.bookings.transition(tenant.tenantId, id, user.id, dto);
  }
}
