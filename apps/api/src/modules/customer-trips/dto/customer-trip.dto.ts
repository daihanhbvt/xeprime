import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingDriverSummaryDto } from '../../drivers/dto/driver.dto';
import {
  CUSTOMER_CANCEL_PREVIEW_KIND_VALUES,
  CUSTOMER_TRIP_FILTER_DEFAULT,
  CUSTOMER_TRIP_FILTER_VALUES,
  TRIP_ROLE_VALUES,
  CUSTOMER_TRIP_STAGE_LIVE_VALUES,
  DEPOSIT_COLLECTION_MODE_VALUES,
  DEPOSIT_STATUS_VALUES,
  REFUND_METHOD_VALUES,
  STOREFRONT_KIND_VALUES,
  SURCHARGE_CATEGORY_VALUES,
  type DepositCollectionMode,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CustomerHoldDto } from '../../holds/dto/hold.dto';
import { InsuranceCertificateDto, InsuranceCoverageDto } from '../../insurance/dto/insurance.dto';
import {
  LongTermPackageOptionDto,
  PriceBreakdownRowDto,
  PublicCustomerFeeBreakdownDto,
} from '../../pricing/dto/pricing.dto';
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

  /**
   * VAI của người xem trong chuyến — `renter` (tôi đi thuê) hoặc `host` (tôi cho thuê).
   *
   * Trước 15/09/2026 endpoint này trả MỘT danh sách trộn cả hai: `scopeWhere` OR
   * `customerUserId = tôi` với `tenantId = gian hàng của tôi`. Một chủ xe mở `/trips` thấy chuyến
   * mình đi thuê nằm lẫn với yêu cầu khách gửi tới xe của mình — hai việc khác hẳn nhau, và số
   * đếm trên tab cộng gộp cả hai.
   *
   * Bỏ trống ⇒ giữ nguyên hành vi cũ (cả hai vai), để client cũ không gãy.
   *
   * ⚠️ Lọc, ĐẾM và PHÂN TRANG đều ở server: lọc một trang kết quả ở client sẽ cho ra những trang
   * dài ngắn khác nhau và một con số tổng không khớp với thứ người dùng đếm được trên màn hình.
   */
  @ApiPropertyOptional({
    enum: TRIP_ROLE_VALUES,
    description: 'renter = tôi đi thuê · host = tôi cho thuê. Bỏ trống = cả hai.',
  })
  @IsOptional()
  @IsIn(TRIP_ROLE_VALUES)
  role?: string;

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
  /**
   * `personal` (chủ xe cá nhân, tuyến hoa hồng) hay `shop` (gian hàng tuyến gói) — cùng phép suy
   * `resolveStorefrontKind` với trang `/shops/:slug` công khai (ADR 0028/0038/0040). Khách không
   * được mời "Xem gian hàng" một người không có mặt tiền doanh nghiệp nào để xem.
   */
  @ApiProperty({ enum: STOREFRONT_KIND_VALUES }) shopKind!: string;
}

/** Một khoản phát sinh, bản của KHÁCH: không có người ghi, không có ghi chú nội bộ. */
export class CustomerSurchargeDto {
  @ApiProperty({ enum: SURCHARGE_CATEGORY_VALUES }) category!: string;
  @ApiProperty({ description: 'Tiền dạng string — ADR 0007' }) amount!: string;
  @ApiProperty({ description: 'Lý do chủ xe ghi — khách được thấy để đối chiếu' }) reason!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) recordedAt!: string;
}

/**
 * Bảng kê ĐÃ ĐÓNG BĂNG lúc tạo đơn (ADR 0024) — đúng những dòng khách đọc ở màn chờ giữ chỗ
 * (`estimate` của chính chuyến đó, chụp từ khoản giữ chỗ — ADR 0039), để màn chuyến đã xác nhận kể
 * lại cùng một bảng tiền thay vì một bảng thứ hai trông gần giống.
 */
export class CustomerTripFinanceBreakdownDto {
  @ApiProperty({ type: [PriceBreakdownRowDto], description: 'Các dòng của giá THUÊ' })
  rows!: PriceBreakdownRowDto[];

  @ApiProperty({ description: 'Cọc thế chấp hoàn trả — KHÔNG nằm trong tổng' })
  depositAmount!: string;

  /**
   * Phụ phí phía khách đã chốt — bản CÔNG KHAI (`toPublicFeeBreakdown`, ADR 0064): không mang hoa
   * hồng, thuế hay số thực nhận của chủ xe. `null` khi đơn ra đời lúc sàn chưa có chính sách phí.
   */
  @ApiPropertyOptional({ type: PublicCustomerFeeBreakdownDto, nullable: true })
  fees!: PublicCustomerFeeBreakdownDto | null;

  /** Cấu tạo giá gói dài hạn đã chốt (ADR 0011). `null` với dịch vụ khác. */
  @ApiPropertyOptional({ type: LongTermPackageOptionDto, nullable: true })
  longTerm!: LongTermPackageOptionDto | null;
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

  /**
   * Kế hoạch thanh toán đã đóng băng của chuyến marketplace. `holdPaidAmount` là `null` với
   * đơn không đi qua khoản giữ chỗ XePrime; client không tự trừ các số tiền.
   */
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Tổng khách trả gồm phụ phí phía khách',
  })
  customerTotalAmount!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Khoản giữ chỗ khách đã thực trả cho XePrime',
  })
  holdPaidAmount!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'B − D — còn trả trực tiếp chủ xe khi nhận xe',
  })
  payAtPickupAmount!: string | null;

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

  /**
   * Bảng kê đóng băng của đơn — CHỈ khi nó còn khớp từng đồng với số trên đơn. `null` khi đơn cũ
   * không có snapshot (`legacyPricing`), hoặc khi tiền thuê đã đổi sau lúc tạo (chủ xe chốt lại phí
   * giao nhận): trưng bảng cũ lúc đó là kể một con số đã không còn đúng — giao diện quay về các
   * trường tổng ở trên.
   */
  @ApiPropertyOptional({ type: CustomerTripFinanceBreakdownDto, nullable: true })
  breakdown!: CustomerTripFinanceBreakdownDto | null;
}

/** Khách thuê, nhìn từ phía CHỦ XE. SĐT gác theo `canContact` — xem `CustomerTripListItemDto`. */
export class CustomerTripRenterDto {
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'null khi chưa được liên hệ' })
  phone!: string | null;
  /**
   * SĐT ĐÃ XÁC MINH của tài khoản khách — chỉ khi khách để lại một SĐT liên hệ KHÁC nó cho chuyến
   * này (ADR 0063). Gác cùng `canContact` với `phone`.
   */
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'SĐT tài khoản khách — null khi chưa được liên hệ hoặc trùng SĐT liên hệ',
  })
  accountPhone!: string | null;
}

/**
 * Liên hệ NGƯỜI ĐI THUÊ đã để lại cho chuyến (ADR 0063) — chính họ đọc lại ở màn chuyến. Có thể
 * khác họ tên/SĐT của tài khoản.
 */
export class CustomerTripContactDto {
  @ApiProperty() name!: string;
  @ApiProperty() phone!: string;
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

  @ApiPropertyOptional({
    type: BookingDriverSummaryDto,
    nullable: true,
    description: 'Tài xế đang gán + trạng thái lượt gán — chỉ phía chủ xe, chỉ khi đã có đơn',
  })
  driver!: BookingDriverSummaryDto | null;

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
    enum: CUSTOMER_TRIP_STAGE_LIVE_VALUES,
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
  @ApiPropertyOptional({ type: PublicCustomerFeeBreakdownDto, nullable: true })
  fees!: PublicCustomerFeeBreakdownDto | null;

  /**
   * `B − H − T` — số CHỦ XE thực nhận cả chuyến. CHỈ có khi người xem là chủ xe (vai `host`);
   * khách luôn nhận `null` — kinh tế của chủ xe không bao giờ ra phía khách (ADR 0064).
   */
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Chủ xe thực nhận — chỉ vai chủ xe, khách luôn null',
  })
  ownerNetAmount!: string | null;

  /**
   * Khác `null` ⇒ tổng chỉ là TẠM TÍNH ở mức sâu hơn (giá lộ trình / giá dịch vụ chưa niêm yết,
   * báo giá rơi về bậc gần nhất) — cùng nghĩa với `QuoteBreakdownDto.estimateNote`. Màn chuyến
   * phải nói đúng điều khách đã đọc ở màn Xem lại, không trưng con số đó như giá chốt.
   * `null` với snapshot đã đóng băng trên khoản giữ chỗ (ADR 0039): số đó đã là số thu.
   */
  @ApiPropertyOptional({ type: String, nullable: true })
  estimateNote!: string | null;

  /** Cấu tạo giá gói dài hạn (ưu đãi cam kết thời hạn — ADR 0011). `null` với dịch vụ khác. */
  @ApiPropertyOptional({ type: LongTermPackageOptionDto, nullable: true })
  longTerm!: LongTermPackageOptionDto | null;
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
  /**
   * Họ tên + SĐT liên hệ người thuê đã để lại lúc gửi yêu cầu (ADR 0063). CHỈ có ở phía người đi
   * thuê (`role = renter`) — phía chủ xe đọc `renter`, đã gác theo cổng liên hệ.
   */
  @ApiPropertyOptional({ type: CustomerTripContactDto, nullable: true })
  contact!: CustomerTripContactDto | null;
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

  /**
   * AI thu cọc của chuyến này — ĐÓNG BĂNG lúc tạo đơn (Phase 6, ADR 0025 ràng buộc 4).
   *
   * Khách cần con số này để biết mình sẽ được liên hệ về khoản cọc hay không. `direct` là ca
   * duy nhất màn hình phải nói thêm một câu: gian hàng tự thoả thuận, XePrime không thu hộ và
   * không đối soát khoản đó (ADR 0028 điều 9).
   *
   * `null` = chuyến chưa có đơn, hoặc đơn gian hàng tự lập ngoài luồng chợ.
   */
  @ApiPropertyOptional({ enum: DEPOSIT_COLLECTION_MODE_VALUES, nullable: true })
  depositCollectionMode!: DepositCollectionMode | null;

  @ApiPropertyOptional({ type: CustomerTripReviewDto, nullable: true })
  review!: CustomerTripReviewDto | null;

  /**
   * Giấy chứng nhận bảo hiểm ĐÃ CẤP của chuyến (ADR 0064) — rỗng cho tới khi bàn giao xe và
   * đối tác phát hành. `isTest` = GCN của adapter giả lập, không có hiệu lực bảo hiểm.
   */
  @ApiProperty({ type: [InsuranceCertificateDto] })
  insuranceCertificates!: InsuranceCertificateDto[];
  /**
   * Tình trạng bảo hiểm theo TỪNG sản phẩm khách đã trả (ADR 0064) — có mặt cả khi GCN chưa có
   * (`pending_issue`/`issuing`/`failed`) hay không bao giờ có (`refunded`/`voided`). Rỗng = chuyến
   * không mua bảo hiểm. `insuranceCertificates` giữ cho client cũ: đúng bằng các `certificate`
   * khác null của danh sách này.
   */
  @ApiProperty({ type: [InsuranceCoverageDto] })
  insuranceCoverage!: InsuranceCoverageDto[];
}

/**
 * Khách khai tài khoản nhận hoàn — ADR 0033 (Phase 3).
 *
 * Hai đường vào cùng một kết quả, và đó là chủ đích: người có tài khoản đã lưu chỉ chọn một
 * dòng (`bankAccountId`), người chưa có gõ ba ô rồi hệ thống lưu lại để lần sau không phải gõ
 * nữa. Bắt mọi khách gõ lại số tài khoản ở mỗi lần hoàn là cách chắc chắn nhất để có một chữ số
 * sai trong một lệnh chuyển tiền.
 */
export class ProvideRefundAccountDto {
  @ApiPropertyOptional({
    description: 'Chọn một tài khoản đã lưu. Bỏ trống thì phải khai đủ ba ô bên dưới.',
  })
  @IsOptional()
  @IsString()
  bankAccountId?: string;

  @ApiPropertyOptional({ description: 'Mã ngân hàng theo bảng VietQR', example: 'VCB' })
  @ValidateIf((o: ProvideRefundAccountDto) => !o.bankAccountId)
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  bankCode?: string;

  @ApiPropertyOptional({ description: 'Số tài khoản — chỉ chữ số' })
  @ValidateIf((o: ProvideRefundAccountDto) => !o.bankAccountId)
  @IsString()
  @Matches(/^[0-9\s]{4,40}$/, { message: 'Số tài khoản chỉ gồm chữ số' })
  accountNumber?: string;

  @ApiPropertyOptional({ description: 'Tên chủ tài khoản, đúng như đăng ký ở ngân hàng' })
  @ValidateIf((o: ProvideRefundAccountDto) => !o.bankAccountId)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  accountName?: string;
}

/** Một chuyến khách đang GIỮ mà chưa trả — một dòng của lời nhắc thanh toán. */
export class CustomerUnpaidHoldDto {
  @ApiProperty({ description: 'Id yêu cầu thuê — đích của trang thanh toán `/payment/:id`' })
  tripId!: string;
  @ApiProperty({ description: 'Mã giữ chỗ (XPH…)' }) code!: string;
  @ApiProperty() vehicleName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) vehicleImageUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  pickupAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  returnAt!: string | null;
  @ApiProperty({ description: 'Số CÒN phải chuyển — VND, chuỗi (ADR 0007)' })
  remainingAmount!: string;
  @ApiProperty({ description: 'Hạn thanh toán — ISO-8601 UTC' }) expiresAt!: string;
}

/**
 * Lời nhắc thanh toán của khách — những chuyến đang giữ mà chưa trả, và khách đã chạm trần chưa.
 * Chạm trần (`limitReached`) thì server từ chối mọi yêu cầu đặt xe mới bằng `HOLD_LIMIT_REACHED`.
 */
export class CustomerUnpaidHoldsDto {
  @ApiProperty({
    description: 'Số chỗ chưa trả tối đa được giữ cùng lúc (HOLD_MAX_OPEN_PER_CUSTOMER)',
  })
  limit!: number;
  @ApiProperty({ description: 'Đã giữ đủ trần — không đặt thêm xe được tới khi trả hoặc huỷ bớt' })
  limitReached!: boolean;
  @ApiProperty({ type: [CustomerUnpaidHoldDto], description: 'Gấp nhất trước' })
  items!: CustomerUnpaidHoldDto[];
}

/**
 * XEM TRƯỚC lượt khách tự huỷ — `GET /trips/:id/cancel-preview` (ADR 0064).
 *
 * Mọi con số do server tính bằng ĐÚNG luật kết cục (`decideOutcome`) và phép chia
 * (`resolveHoldAllocation`) mà lượt huỷ thật ghi xuống — hộp xác nhận huỷ hứa đúng số sẽ vào ví
 * điểm, không có phép tính thứ hai ở client. Mốc so với `now` của server lúc gọi: khách mở hộp rồi
 * để qua mốc huỷ miễn phí thì lượt bấm sẽ ra kết cục khác — client gọi lại khi mốc đã qua.
 *
 * Chỉ nói về tiền đi QUA XEPRIME (khoản giữ chỗ). Tiền khách trả TRỰC TIẾP chủ xe nằm ở `finance`.
 */
export class CustomerTripCancelPreviewDto {
  @ApiProperty({ description: 'Chặng hiện tại còn huỷ được không' }) allowed!: boolean;
  @ApiProperty({ enum: CUSTOMER_CANCEL_PREVIEW_KIND_VALUES }) kind!: string;
  @ApiProperty({ description: 'Đã chuyển qua XePrime cho khoản giữ chỗ (VND string)' })
  paidAmount!: string;
  @ApiProperty({ description: 'Sẽ hoàn vào ví điểm của khách (VND string)' })
  refundAmount!: string;
  @ApiProperty({ description: 'Phần hoàn là tiền bảo hiểm chưa phát hành (VND string)' })
  insuranceRefundAmount!: string;
  @ApiProperty({ description: 'Khách mất = đã chuyển − được hoàn (VND string)' })
  forfeitAmount!: string;
  @ApiProperty({ description: 'Phần đền chủ xe vì giữ lịch khi huỷ muộn (VND string)' })
  ownerCompensationAmount!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'ISO — mốc huỷ miễn phí ĐÃ LƯU; null khi chuyến chưa có khoản giữ chỗ',
  })
  freeCancelUntil!: string | null;
  @ApiProperty({ description: 'false = đặt gấp, chuyến không có thời gian huỷ miễn phí' })
  freeCancelAvailable!: boolean;
  @ApiProperty({ description: 'Có tranh chấp mở — tiền chờ XePrime chốt, không tự chia' })
  deferred!: boolean;
}
