import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CUSTOMER_TRIP_FILTER,
  CUSTOMER_TRIP_FILTER_VALUES,
  CUSTOMER_TRIP_STAGE_VALUES,
  DEPOSIT_STATUS_VALUES,
  REFUND_METHOD_VALUES,
  SURCHARGE_CATEGORY_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export { DEFAULT_LIMIT as CUSTOMER_TRIP_DEFAULT_LIMIT, MAX_LIMIT as CUSTOMER_TRIP_MAX_LIMIT };

export class CustomerTripListQueryDto {
  @ApiPropertyOptional({ enum: CUSTOMER_TRIP_FILTER_VALUES, default: CUSTOMER_TRIP_FILTER.ALL })
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

/** Số chuyến theo từng tab — server đếm để tab không nói một số còn danh sách trả số khác. */
export class CustomerTripCountsDto {
  @ApiProperty() all!: number;
  @ApiProperty() pending!: number;
  @ApiProperty() upcoming!: number;
  @ApiProperty() active!: number;
  @ApiProperty() completed!: number;
  @ApiProperty() cancelled!: number;
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

export class CustomerTripListItemDto {
  /** Định danh chuyến = id YÊU CẦU thuê — tồn tại từ lúc gửi, trước cả khi có đơn. */
  @ApiProperty() id!: string;
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

  @ApiProperty({ description: 'ISO-8601 UTC' }) pickupAt!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) returnAt!: string;
  /** Dịch vụ của chuyến (@xeprime/types ServiceType) — tự lái / có tài xế / dài hạn. */
  @ApiProperty() serviceType!: string;
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

  @ApiPropertyOptional({ type: CustomerTripReviewDto, nullable: true })
  review!: CustomerTripReviewDto | null;
}
