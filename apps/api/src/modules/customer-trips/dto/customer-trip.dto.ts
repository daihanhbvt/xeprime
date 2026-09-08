import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CUSTOMER_TRIP_FILTER_DEFAULT,
  CUSTOMER_TRIP_FILTER_VALUES,
  CUSTOMER_TRIP_STAGE_VALUES,
  TRIP_ROLE_VALUES,
  DEPOSIT_STATUS_VALUES,
  REFUND_METHOD_VALUES,
  SURCHARGE_CATEGORY_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CustomerHoldDto } from '../../holds/dto/hold.dto';
import { CustomerFeeBreakdownDto, PriceBreakdownRowDto } from '../../pricing/dto/pricing.dto';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export { DEFAULT_LIMIT as CUSTOMER_TRIP_DEFAULT_LIMIT, MAX_LIMIT as CUSTOMER_TRIP_MAX_LIMIT };

export class CustomerTripListQueryDto {
  @ApiPropertyOptional({
    enum: CUSTOMER_TRIP_FILTER_VALUES,
    default: CUSTOMER_TRIP_FILTER_DEFAULT,
  })
  @IsOptional()
  @IsIn(CUSTOMER_TRIP_FILTER_VALUES)
  filter?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: DEFAULT_LIMIT, minimum: 1, maximum: MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;
}

/**
 * Số chuyến theo từng tab — server đếm để tab không nói một số còn danh sách trả số khác.
 *
 * Đúng hai khoá vì màn khách có đúng hai tab, và hai tab đó phủ kín mọi chặng: `current +
 * history` chính là tổng số chuyến của khách — không cần một khoá `all` thứ ba nói lại.
 */
export class CustomerTripCountsDto {
  @ApiProperty({ description: 'Chuyến chưa khép: chờ duyệt · chờ giữ chỗ · sắp tới · đang thuê' })
  current!: number;

  @ApiProperty({ description: 'Chuyến đã khép: hoàn thành · huỷ · từ chối · không nhận xe' })
  history!: number;
}

/** Xe của chuyến — chỉ phần khách được thấy. Không biển số trước khi chủ xe nhận chuyến. */
export class CustomerTripVehicleDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) seatCount!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) transmission!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) fuelType!: string | null;
  /**
   * Biển số CHỈ lộ sau khi chủ xe đã nhận chuyến — trước đó nó là tài sản đang rao, không phải
   * thông tin của người mới hỏi thuê.
   */
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
}

export class CustomerTripShopDto {
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ description: 'Điểm trung bình (0 nếu chưa có đánh giá)' }) ratingAvg!: number;
  @ApiProperty() ratingCount!: number;
  /** SĐT gian hàng — chỉ trả khi chuyến đã được nhận (khách cần gọi được chủ xe). */
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
}

/** Một khoản phát sinh, bản của KHÁCH: không có người ghi, không có ghi chú nội bộ. */
export class CustomerSurchargeDto {
  @ApiProperty({ enum: SURCHARGE_CATEGORY_VALUES }) category!: string;
  @ApiProperty({ description: 'Tiền dạng string — ADR 0007' }) amount!: string;
  @ApiProperty({ description: 'Lý do chủ xe ghi — khách được thấy để đối chiếu' }) reason!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) recordedAt!: string;
}

/**
 * Toàn bộ tiền của một chuyến, tính MỘT LẦN ở server.
 *
 * Mọi số ở đây là chuỗi thập phân (ADR 0007) và đã tính xong — client chỉ hiển thị. Lý do đóng
 * đinh: cùng một chuyến hiện ở thẻ danh sách, thẻ chi tiết và hoá đơn; ba nơi tự cộng trừ là ba
 * cơ hội lệch nhau.
 */
export class CustomerTripFinanceDto {
  @ApiProperty({ example: 'VND' }) currency!: string;

  @ApiProperty({ description: 'Tiền thuê gốc' }) baseAmount!: string;
  @ApiProperty({ description: 'Khuyến mãi (số dương, hiển thị dấu trừ)' }) discountAmount!: string;
  @ApiProperty({ description: 'Phí giao nhận MỚI NHẤT chủ xe chốt — mặc định 0' })
  deliveryFee!: string;
  @ApiProperty({ description: 'Tiền thuê sau khuyến mãi + giao nhận (chưa gồm phát sinh)' })
  rentalTotal!: string;

  @ApiProperty({ type: [CustomerSurchargeDto] }) surcharges!: CustomerSurchargeDto[];
  @ApiProperty() surchargeTotal!: string;

  @ApiProperty({ description: 'Tổng dịch vụ cuối cùng = rentalTotal + surchargeTotal' })
  finalTotal!: string;
  @ApiProperty({ description: 'Đã thanh toán TIỀN THUÊ (không gồm cọc)' }) rentalPaid!: string;

  @ApiProperty({ description: 'Cọc theo đơn (cấu hình)' }) depositRequired!: string;
  @ApiProperty({ description: 'Cọc chủ xe ĐÃ ghi nhận thu' }) depositReceived!: string;
  @ApiProperty({ description: 'Phần phát sinh khấu trừ vào cọc = min(phát sinh, cọc đã thu)' })
  depositDeducted!: string;
  @ApiProperty({ description: 'Phát sinh vượt quá cọc — khách trả thêm trực tiếp' })
  additionalDue!: string;
  @ApiProperty({ description: 'Số dự kiến hoàn lại (khi chưa có bản ghi hoàn)' })
  expectedRefund!: string;

  @ApiProperty({ enum: DEPOSIT_STATUS_VALUES }) depositStatus!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) refundAmount!: string | null;
  @ApiPropertyOptional({ enum: REFUND_METHOD_VALUES, nullable: true }) refundMethod!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) refundedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) refundReference!: string | null;

  /**
   * Không dựng lại được bảng giá của chuyến (đơn cũ trước khi có snapshot giá).
   * UI nói thẳng là dữ liệu cũ thay vì hiển thị một bảng có vẻ đầy đủ nhưng thiếu dòng.
   */
  @ApiProperty({ description: 'Thiếu snapshot giá — chỉ còn tổng, không có chi tiết' })
  legacyPricing!: boolean;
}

/** Khách thuê, nhìn từ phía CHỦ XE. SĐT gác theo `canContact` — xem `CustomerTripListItemDto`. */
export class CustomerTripRenterDto {
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'null khi chưa được liên hệ' })
  phone!: string | null;
}

export class CustomerTripListItemDto {
  /** Định danh chuyến = id YÊU CẦU thuê — tồn tại từ lúc gửi, trước cả khi có đơn. */
  @ApiProperty() id!: string;

  /**
   * Phía của NGƯỜI ĐANG XEM (@xeprime/types → TripRole).
   *
   * `host` chỉ xuất hiện với chủ gian hàng, và chỉ trên chuyến của chính gian hàng đó — phạm vi
   * nằm trong WHERE của truy vấn, không phải một câu lọc sau khi đọc.
   */
  @ApiProperty({ enum: TRIP_ROLE_VALUES })
  role!: string;

  /**
   * Khách thuê của chuyến. CHỈ có mặt khi `role = host`; ở phía người đi thuê nó là `null` vì
   * chính họ là khách và màn hình đã nói điều đó bằng tên gian hàng.
   */
  @ApiPropertyOptional({ type: CustomerTripRenterDto, nullable: true })
  renter!: CustomerTripRenterDto | null;

  /**
   * Hạn chủ xe phải trả lời (ISO-8601 UTC) — đồng hồ đếm ngược trên thẻ chờ duyệt.
   * `null` khi chuyến đã qua bước duyệt.
   */
  @ApiPropertyOptional({ type: String, nullable: true })
  respondBy!: string | null;

  /**
   * Hai bên đã được phép liên hệ trực tiếp chưa.
   *
   * `false` khi chuyến TUYẾN HOA HỒNG còn đang chờ duyệt: nền tảng không dẫn hai bên ra ngoài
   * trước khi có một chuyến thật (ADR 0028 điều 9). Gian hàng thuê bao được liên hệ ngay — họ
   * đã trả cước và được phép chốt trực tiếp.
   */
  @ApiProperty({ description: 'Được lộ SĐT và mở hội thoại chưa' })
  canContact!: boolean;

  /**
   * `totalAmount` là số TẠM TÍNH, chưa được đóng băng vào đơn (ADR 0024).
   *
   * Đúng với chuyến chưa được duyệt: nó được tính lại theo chính sách ĐANG hiệu lực mỗi lần
   * đọc, nên gian hàng đổi giá là nó đổi theo. Giao diện PHẢI nói rõ — một con số tạm tính
   * trưng ra như giá chốt là lời hứa mà hệ thống không giữ.
   */
  @ApiProperty({ description: 'Tổng tiền còn tạm tính, chưa chốt vào đơn' })
  totalIsEstimate!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Mã đơn (sau khi được nhận)' })
  code!: string | null;
  @ApiProperty({
    enum: CUSTOMER_TRIP_STAGE_VALUES,
    description: '@xeprime/types CustomerTripStage',
  })
  stage!: string;

  @ApiProperty({ type: CustomerTripVehicleDto }) vehicle!: CustomerTripVehicleDto;
  @ApiProperty({ type: CustomerTripShopDto }) shop!: CustomerTripShopDto;

  /**
   * Lịch CHỐT của chuyến — `null` khi chuyến là yêu cầu THUÊ DÀI HẠN còn chờ duyệt: khách mới
   * nêu nguyện vọng, gian hàng chưa chốt giờ nhận. Màn hình hiển thị gói + nguyện vọng thay vì
   * bịa một ngày (ADR 0011).
   */
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  pickupAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  returnAt!: string | null;
  /** Dịch vụ của chuyến (@xeprime/types ServiceType) — tự lái / có tài xế / dài hạn. */
  @ApiProperty() serviceType!: string;
  /** Gói thuê dài hạn (tháng lịch) — null với dịch vụ khác. */
  @ApiPropertyOptional({ type: Number, nullable: true }) longTermPackageMonths!: number | null;
  /** Nguyện vọng nhận xe của yêu cầu dài hạn (@xeprime/types PickupPreference). */
  @ApiPropertyOptional({ type: String, nullable: true }) pickupPreference!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'YYYY-MM-DD' })
  requestedPickupDate!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'YYYY-MM-DD' })
  pickupWindowStartDate!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'YYYY-MM-DD' })
  pickupWindowEndDate!: string | null;
  /** Hành trình chuyến CÓ TÀI XẾ — null với dịch vụ khác. Đơn thắng yêu cầu nếu shop có sửa. */
  @ApiPropertyOptional({ type: String, nullable: true }) routeType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) pickupAddress!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) destination!: string | null;
  @ApiProperty() deliveryRequested!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) deliveryAddress!: string | null;

  /**
   * **Tổng dịch vụ MỚI NHẤT khách phải trả** = tiền thuê (đã gồm khuyến mãi + phí giao nhận
   * hiện hành) + phát sinh còn hiệu lực. Bằng đúng `finance.finalTotal` ở chi tiết, nên danh
   * sách và chi tiết không bao giờ hiện hai con số.
   *
   * KHÔNG gồm tiền cọc. Phần phát sinh được khấu trừ vào cọc cũng chỉ nằm ở đây một lần — nó là
   * cách khách đã trả cho khoản phát sinh đó, không phải một khoản thu thêm.
   *
   * `null` khi chuyến còn chờ duyệt: chưa có đơn nên chưa có giá chốt, và bịa một con số "dự
   * kiến" là hứa hẹn thay chủ xe.
   */
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Tổng dịch vụ mới nhất (tiền thuê + phát sinh), string — ADR 0007',
  })
  totalAmount!: string | null;

  @ApiProperty() canReview!: boolean;
  @ApiProperty() hasReview!: boolean;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

/**
 * Bảng kê giá TẠM TÍNH của một chuyến chưa được duyệt.
 *
 * Cùng ba mảnh với báo giá công khai và với snapshot trên đơn — `rows` (giá thuê),
 * `fees` (phụ phí phía khách, ADR 0029) và tổng — nên giao diện dùng lại đúng một component
 * bảng giá cho cả ba nguồn, không nơi nào tự vẽ lại hàng tiền.
 */
export class CustomerTripEstimateDto {
  @ApiProperty({ type: [PriceBreakdownRowDto], description: 'Các dòng của giá THUÊ' })
  rows!: PriceBreakdownRowDto[];

  @ApiProperty({ description: 'Tổng giá thuê, TRƯỚC phụ phí — doanh thu của gian hàng' })
  rentalTotal!: string;

  @ApiProperty({ description: 'Cọc thế chấp hoàn trả — KHÔNG nằm trong tổng' })
  depositAmount!: string;

  /**
   * Phụ phí phía khách. `null` khi sàn chưa có chính sách phí hiệu lực — lúc đó tổng khách
   * trả bằng đúng giá thuê, và giao diện KHÔNG được bịa ra một dòng phí 0đ.
   */
  @ApiPropertyOptional({ type: CustomerFeeBreakdownDto, nullable: true })
  fees!: CustomerFeeBreakdownDto | null;
}

export class CustomerTripPageDto {
  @ApiProperty({ type: [CustomerTripListItemDto] }) data!: CustomerTripListItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
  @ApiProperty({ type: CustomerTripCountsDto }) counts!: CustomerTripCountsDto;
}

/** Đánh giá của chính khách cho chuyến này. */
export class CustomerTripReviewDto {
  @ApiProperty() id!: string;
  @ApiProperty() rating!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) comment!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class CustomerTripDetailDto extends CustomerTripListItemDto {
  /** Ghi chú KHÁCH tự nhập lúc gửi yêu cầu. Ghi chú nội bộ của shop KHÔNG bao giờ ra đây. */
  @ApiPropertyOptional({ type: String, nullable: true }) customerNote!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) rejectReason!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true }) actualPickupAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) actualReturnAt!: string | null;

  /** `null` khi chuyến chưa được nhận — chưa có đơn thì chưa có tiền. */
  @ApiPropertyOptional({ type: CustomerTripFinanceDto, nullable: true })
  finance!: CustomerTripFinanceDto | null;

  /**
   * Bảng kê giá TẠM TÍNH — chỉ có mặt khi chuyến CHƯA có đơn (`finance === null`).
   *
   * Hai khối loại trừ nhau theo đúng thứ tự đó: có đơn thì `finance` là số đã đóng băng
   * (ADR 0024); chưa có đơn thì đây là con số khách vừa xem trước khi bấm gửi, tính lại theo
   * chính sách đang hiệu lực. Không bao giờ cả hai cùng có, nên không màn nào phải chọn giữa
   * hai con số.
   */
  @ApiPropertyOptional({ type: CustomerTripEstimateDto, nullable: true })
  estimate!: CustomerTripEstimateDto | null;
  /**
   * Khoản GIỮ CHỖ của chuyến (R3, tuyến hoa hồng) — `null` với chuyến không cần giữ chỗ.
   *
   * Nằm trong chi tiết chuyến chứ không phải một endpoint riêng: khách mở đúng một màn để biết
   * "phải chuyển bao nhiêu, nội dung gì, trước khi nào".
   */
  @ApiPropertyOptional({ type: CustomerHoldDto, nullable: true })
  hold!: CustomerHoldDto | null;

  @ApiPropertyOptional({ type: CustomerTripReviewDto, nullable: true })
  review!: CustomerTripReviewDto | null;
}
