import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ACCOUNT_REALM, type CustomerCancellationReason } from '@xeprime/types';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Realms } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { handoverPhotoSlotParam, handoverTypeParam } from '../bookings/handovers/handover-params';
import { SourceContractDownloadDto } from '../vehicles/dto/vehicle-source.dto';
import { CustomerTripsService } from './customer-trips.service';
import { CustomerTripHandoverEvidenceDto } from './dto/customer-trip-evidence.dto';
import {
  CustomerTripCancelPreviewDto,
  CancelCustomerTripDto,
  CustomerTripDetailDto,
  CustomerTripListQueryDto,
  CustomerTripPageDto,
  CustomerUnpaidHoldsDto,
  ProvideRefundAccountDto,
} from './dto/customer-trip.dto';

/**
 * Chuyến của KHÁCH (Wave 11) — chỉ cần đăng nhập, không tenant-scoped.
 *
 * Không có tham số nào nhận danh tính khách: `customerUserId` luôn lấy từ session (ADR 0002).
 * Vì thế không có cách nào gọi endpoint này để xem chuyến của người khác — kể cả khi biết id.
 *
 * Đường GHI duy nhất là **huỷ chuyến của chính mình** (20/08). Phát sinh, hoàn cọc, đổi lịch…
 * vẫn thuộc luồng của chủ xe — mở thêm đường ghi cho khách ở đây là dựng một máy trạng thái
 * thứ hai chạy song song với cái đã có.
 */
@ApiTags('customer-trips')
@Controller('trips')
// Khách thấy chuyến ĐI THUÊ, chủ xe thấy chuyến CHO THUÊ — phạm vi lọc theo realm của phiên (ADR 0053).
@Realms(ACCOUNT_REALM.CUSTOMER, ACCOUNT_REALM.PARTNER)
export class CustomerTripsController {
  constructor(private readonly trips: CustomerTripsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách chuyến của tôi (lọc theo tab, phân trang ở DB)' })
  @ApiOkResponse({ type: CustomerTripPageDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CustomerTripListQueryDto,
  ): Promise<CustomerTripPageDto> {
    return this.trips.list(user.id, query);
  }

  /**
   * LỜI NHẮC THANH TOÁN — chuyến đang giữ mà chưa trả, gấp nhất trước (13/10/2026). Khai TRƯỚC
   * `:id` để đường tĩnh này không bị `:id` nuốt mất. Chỉ realm khách: tài khoản đối tác không đặt
   * xe (ADR 0053 điều 7) nên không bao giờ giữ chỗ nào.
   */
  @Get('unpaid-holds')
  @Realms(ACCOUNT_REALM.CUSTOMER)
  @ApiOperation({
    summary: 'Chuyến đang giữ chưa thanh toán của tôi + đã chạm trần giữ chỗ chưa',
  })
  @ApiOkResponse({ type: CustomerUnpaidHoldsDto })
  unpaidHolds(@CurrentUser() user: AuthenticatedUser): Promise<CustomerUnpaidHoldsDto> {
    return this.trips.unpaidHolds(user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Chi tiết một chuyến của tôi',
    description:
      'Nhận id YÊU CẦU thuê hoặc id ĐƠN thuê — thông báo trỏ vào cả hai loại. Không phải chuyến ' +
      'của mình thì trả 404 (không tiết lộ id có tồn tại hay không).',
  })
  @ApiOkResponse({ type: CustomerTripDetailDto })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<CustomerTripDetailDto> {
    return this.trips.detail(user.id, id);
  }

  /**
   * Bằng chứng bàn giao — bề mặt RIÊNG của khách, cố ý không dùng lại route tenant
   * `/bookings/:id/handovers`.
   *
   * Route kia gác bằng `@TenantScoped()` + bốn quyền của gian hàng, và trả `HandoverDto` đầy đủ
   * (ghi chú nội bộ, tên người xác nhận, `fileId`, `rowVersion`). Nới nó ra cho khách nghĩa là
   * hoặc thêm một nhánh "nếu là khách thì bỏ bớt trường" vào giữa lớp bảo vệ của gian hàng,
   * hoặc phát cho khách một scope tenant mà họ không có. Hai đường đều sai; đây là đường thứ ba.
   */
  @Get(':id/handover-evidence')
  @ApiOperation({
    summary: 'Biên bản giao/nhận xe đã xác nhận của chuyến này',
    description:
      'Chỉ biên bản ĐÃ XÁC NHẬN (nháp / chờ xác nhận / đã huỷ không bao giờ ra tới đây). Trả ' +
      'tối đa hai bản theo thứ tự giao xe → nhận lại; chuyến chưa được duyệt thì mảng rỗng. ' +
      'Ảnh mở qua endpoint download theo GÓC CHỤP — không có `fileId` nào trong payload này.',
  })
  @ApiOkResponse({ type: CustomerTripHandoverEvidenceDto, isArray: true })
  handoverEvidence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<CustomerTripHandoverEvidenceDto[]> {
    return this.trips.handoverEvidence(user.id, id);
  }

  /**
   * Ảnh hiện trạng nằm trong kho RIÊNG TƯ: không có URL công khai, mỗi lần xem là một URL ký
   * sống vài phút. `no-store` để cái vé đó không nằm lại trong cache của trình duyệt hay proxy.
   */
  @Get(':id/handover-evidence/:type/photos/:slot/download')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Phát signed URL ngắn hạn xem một ảnh hiện trạng của chuyến mình',
    description:
      'Khoá là (chuyến của tôi, chiều bàn giao, góc chụp) — không phải id file, nên không có ' +
      'định danh nào cầm đi thử ở chuyến khác được.',
  })
  @ApiOkResponse({ type: SourceContractDownloadDto })
  handoverEvidencePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('type') type: string,
    @Param('slot') slot: string,
  ): Promise<SourceContractDownloadDto> {
    return this.trips.handoverEvidencePhotoUrl(
      user.id,
      id,
      handoverTypeParam(type),
      handoverPhotoSlotParam(slot),
    );
  }

  /**
   * Hộp xác nhận huỷ gọi đây TRƯỚC khi khách bấm: số được hoàn / số mất do server tính bằng đúng
   * luật mà `POST :id/cancel` sẽ áp (ADR 0064). Chỉ realm khách — chỉ người đi thuê mới tự huỷ.
   */
  @Get(':id/cancel-preview')
  @Realms(ACCOUNT_REALM.CUSTOMER)
  @ApiOperation({
    summary: 'Xem trước số được hoàn nếu khách huỷ chuyến ngay bây giờ',
    description:
      'Chỉ nói về tiền đi qua XePrime (khoản giữ chỗ). Huỷ trong cửa sổ miễn phí: hoàn đủ vào ví ' +
      'điểm. Huỷ sau mốc: bảo hiểm hoàn đủ; phần giữ chỗ của chủ xe đền chủ xe, phí đặt xe và hoa ' +
      'hồng thuộc XePrime (ADR 0066). Mốc so với giờ server lúc gọi.',
  })
  @ApiOkResponse({ type: CustomerTripCancelPreviewDto })
  cancelPreview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<CustomerTripCancelPreviewDto> {
    return this.trips.cancelPreview(user.id, id);
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Khách tự huỷ chuyến của mình',
    description:
      'Huỷ được khi yêu cầu còn chờ gian hàng trả lời, hoặc khi đơn đã duyệt nhưng CHƯA giao ' +
      'xe. Đã giao xe rồi thì 409 `TRIP_CANCEL_NOT_ALLOWED` — việc cần làm lúc đó là liên hệ ' +
      'chủ xe. Trả về chính chuyến đó sau khi huỷ để giao diện không phải gọi thêm một lượt.',
  })
  @ApiOkResponse({ type: CustomerTripDetailDto })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    // Thân tuỳ chọn: app cũ gọi không thân ⇒ `customer_changed_plan` (giữ hành vi cũ).
    @Body() dto: CancelCustomerTripDto = {},
  ): Promise<CustomerTripDetailDto> {
    return this.trips.cancel(
      user.id,
      id,
      dto?.reasonCategory as CustomerCancellationReason | undefined,
    );
  }

  /**
   * "Chưa nhận được xe" — lớp 1 chống treo đơn (ADR 0066). Chỉ realm khách: chủ xe không tự khiếu
   * nại chính chuyến của mình.
   */
  @Post(':id/report-not-received')
  @Realms(ACCOUNT_REALM.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Khách báo chưa nhận được xe — mở tranh chấp khẩn, tạm giữ tiền của chuyến',
    description:
      'Mở được trong `[pickupAt, pickupAt + 120′]` khi đơn `reserved` hoặc `active`. Mở MỘT case ' +
      '`dispute` mức `urgent` gắn đơn (vào hàng đợi hỗ trợ của nền tảng, báo gian hàng); tranh chấp ' +
      'mở giữ quyết toán khoản giữ chỗ. Idempotent: đơn đã có tranh chấp mở thì không tạo thêm. ' +
      'Lỗi: 409 `TRIP_NOT_RECEIVED_NOT_ALLOWED` (sai trạng thái), `TRIP_NOT_RECEIVED_TOO_EARLY`, ' +
      '`TRIP_NOT_RECEIVED_WINDOW_CLOSED`; chuyến của người khác 404. Trả về chính chuyến đó.',
  })
  @ApiOkResponse({ type: CustomerTripDetailDto })
  reportNotReceived(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<CustomerTripDetailDto> {
    return this.trips.reportNotReceived(user.id, id);
  }

  @Post(':id/refund-account')
  @ApiOperation({
    summary: 'Khách khai tài khoản nhận hoàn khoản giữ chỗ',
    description:
      'Bắt buộc trước khi admin chuyển được: `markRefundPaid` từ chối một lệnh chuyển không ' +
      'có đích. Chọn một tài khoản đã lưu bằng `bankAccountId`, hoặc khai ba ô — khai mới thì ' +
      'tài khoản được LƯU LẠI để lần sau không phải gõ. Trả về chính chuyến đó sau khi khai.',
  })
  @ApiOkResponse({ type: CustomerTripDetailDto })
  provideRefundAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ProvideRefundAccountDto,
  ): Promise<CustomerTripDetailDto> {
    return this.trips.provideRefundAccount(user.id, id, dto);
  }
}
