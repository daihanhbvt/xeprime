import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION, SUPPORT_CAPABILITY } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  TenantScoped,
  SupportAction,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { ChatService } from '../chat/chat.service';
import { ConversationSummaryDto } from '../chat/dto/chat.dto';
import {
  ApproveBookingRequestDto,
  BookingRequestDto,
  CancelBookingRequestDto,
  BookingRequestListQueryDto,
  BookingRequestPageDto,
  RejectBookingRequestDto,
} from './dto/booking-request.dto';
import { BookingRequestsService } from './booking-requests.service';

/**
 * Inbox yêu cầu đặt xe của gian hàng — tenant-scoped. Duyệt tạo Booking (giữ chỗ lịch,
 * chặn trùng bằng constraint DB — ADR 0006). `tenantId`/`userId` từ scope, không nhận client.
 */
@ApiTags('booking-requests')
@Controller('booking-requests')
@TenantScoped()
export class BookingRequestsController {
  constructor(
    private readonly requests: BookingRequestsService,
    private readonly chat: ChatService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSION.BOOKING_REQUEST_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.BOOKING_REQUEST_VIEW)
  @ApiOperation({ summary: 'Danh sách yêu cầu đặt xe (phân trang, filter trạng thái)' })
  @ApiOkResponse({ type: BookingRequestPageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: BookingRequestListQueryDto,
  ): Promise<BookingRequestPageDto> {
    return this.requests.list(tenant.tenantId, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSION.BOOKING_REQUEST_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.BOOKING_REQUEST_VIEW)
  @ApiOperation({ summary: 'Chi tiết một yêu cầu' })
  @ApiOkResponse({ type: BookingRequestDto })
  getOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<BookingRequestDto> {
    return this.requests.getOne(tenant.tenantId, id);
  }

  /**
   * Duyệt được NGAY, kể cả yêu cầu có giao xe tận nơi (Wave 9): đơn sinh ra với phí giao nhận
   * `0đ — Miễn phí`. Chủ xe thống nhất phí với khách ngoài ứng dụng rồi cập nhật bằng
   * `PATCH /bookings/:id/delivery-fee`.
   */
  @Post(':id/approve')
  @RequirePermissions(PERMISSION.BOOKING_REQUEST_APPROVE)
  @ApiOperation({
    /*
     * ADR 0047: sửa summary trước đây "→ tạo đơn thuê" — chỉ đúng cho chuyến KHÔNG thu tiền
     * giữ chỗ. Nhánh phổ biến hơn (có hold) chỉ giữ lịch + chốt giá ở đây; đơn thuê thật ra
     * đời trong lượt đối soát khi khách thanh toán đủ (`settleFullPaymentWithinTx`).
     */
    summary: 'Duyệt yêu cầu → giữ lịch + chốt giá (đơn thuê chỉ ra đời khi khách thanh toán đủ)',
    description:
      'Có tiền giữ chỗ: request chuyển sang `awaiting_hold`, KHÔNG có Booking nào được tạo ở ' +
      'bước này. Không thu tiền giữ chỗ: Booking được tạo ngay trong cùng transaction. ' +
      'Thuê dài hạn: body bắt buộc scheduledPickupAt — gian hàng chốt giờ nhận, server tính ' +
      'giờ trả theo gói tháng lịch (ADR 0011). Trùng lịch → 409, yêu cầu vẫn chờ duyệt.',
  })
  @ApiOkResponse({ type: BookingRequestDto })
  approve(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApproveBookingRequestDto,
  ): Promise<BookingRequestDto> {
    return this.requests.approve(tenant.tenantId, user.id, id, dto);
  }

  @Post(':id/reject')
  @RequirePermissions(PERMISSION.BOOKING_REQUEST_APPROVE)
  @ApiOperation({ summary: 'Từ chối yêu cầu' })
  @ApiOkResponse({ type: BookingRequestDto })
  reject(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectBookingRequestDto,
  ): Promise<BookingRequestDto> {
    return this.requests.reject(tenant.tenantId, user.id, id, dto.reason);
  }

  /**
   * GIAN HÀNG RÚT LẠI một chuyến ĐÃ NHẬN (ADR 0045 điều 1).
   *
   * Endpoint RIÊNG, không phải một cờ trên `/reject`: hai việc khác nhau ở hậu quả (huỷ đóng
   * hold, nhả lịch, hoàn tiền và vào chỉ số uy tín; từ chối thì không), nên trộn chúng vào một
   * đường là mời người gọi tự chọn hậu quả bằng một tham số.
   *
   * Cùng quyền với duyệt/từ chối: ai nhận được chuyến thì cũng là người rút lại được nó. Nhân
   * viên được uỷ quyền bấm VẪN tính là phía gian hàng — uỷ quyền là chuyện nội bộ của người bán.
   */
  @Post(':id/cancel')
  @RequirePermissions(PERMISSION.BOOKING_REQUEST_APPROVE)
  @ApiOperation({
    summary: 'Huỷ một chuyến ĐÃ NHẬN (chưa có đơn thuê)',
    description:
      'Chỉ áp dụng cho awaiting_hold và hold_paid (LEGACY). Đóng hold, nhả lịch, hoàn phần đã ' +
      'chuyển và ghi một dòng booking_cancellations tính vào chỉ số uy tín. Yêu cầu chưa được ' +
      'nhận thì dùng /reject; đơn đã tạo thì dùng POST /bookings/:id/transition.',
  })
  @ApiOkResponse({ type: BookingRequestDto })
  cancel(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelBookingRequestDto,
  ): Promise<BookingRequestDto> {
    return this.requests.cancelByHost(tenant.tenantId, user.id, id, dto);
  }

  /**
   * Mở/lấy hội thoại với KHÁCH của yêu cầu này — nút "Nhắn tin" ở inbox gian hàng.
   *
   * Cố ý KHÔNG dùng `POST /conversations` (đường của KHÁCH): endpoint đó lấy người đang gọi làm
   * khách của hội thoại, nên nhân viên gian hàng bấm vào sẽ tự mở một thread với chính mình.
   * Ở đây `customerUserId`/`vehicleId` do ChatService đọc từ chính yêu cầu, `tenantId` từ scope
   * của phiên — client không gửi thứ nào trong ba.
   *
   * Chỉ cần quyền XEM yêu cầu: liên hệ khách là việc của người trực, không phải việc của người
   * có quyền duyệt.
   */
  @Post(':id/conversation')
  @RequirePermissions(PERMISSION.BOOKING_REQUEST_VIEW)
  @ApiOperation({
    summary: 'Mở/lấy hội thoại với khách của yêu cầu (phía gian hàng)',
    description:
      'Idempotent theo (khách, xe) — mở lại đúng thread cũ. Khách vãng lai chưa có tài khoản ' +
      'trả CHAT_CUSTOMER_UNAVAILABLE.',
  })
  @ApiCreatedResponse({ type: ConversationSummaryDto })
  conversation(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<ConversationSummaryDto> {
    return this.chat.getOrCreateConversationForBookingRequest(tenant.tenantId, id);
  }
}
