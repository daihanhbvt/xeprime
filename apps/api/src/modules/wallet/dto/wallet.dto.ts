import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  SERVICE_TYPE_VALUES,
  TAX_PERIOD_KEY_PATTERN,
  WALLET_ENTRY_KIND_VALUES,
  WALLET_STATEMENT_UNIT_VALUES,
  WALLET_STATUS_VALUES,
  WITHDRAWAL_STATUS_VALUES,
  type ServiceType,
  type WalletEntryKind,
  type WalletStatementUnit,
  type WalletStatus,
  type WithdrawalStatus,
} from '@xeprime/types';
import { IsInt, IsNumberString, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OwnerPayoutDto } from '../../../common/dto/owner-payout.dto';

/**
 * Số dư nhìn từ màn hình — ba con số, không phải một.
 *
 * `available` là thứ rút được ngay; `pending` đang bị khoá bởi một yêu cầu rút chưa chi xong;
 * `total` là NGHĨA VỤ của XePrime với chủ ví. Hiện một con số duy nhất sẽ làm người dùng hoặc
 * tưởng mình rút được nhiều hơn thực tế, hoặc tưởng tiền đã biến mất.
 */
export class WalletSummaryDto {
  @ApiProperty({ description: 'Rút được ngay (VND string)' }) available!: string;
  @ApiProperty({ description: 'Đang chờ chuyển — đã khoá, chưa rời ngân hàng' }) pending!: string;
  @ApiProperty({ description: 'Tổng XePrime phải trả = available + pending' }) total!: string;
  @ApiProperty({ enum: WALLET_STATUS_VALUES }) status!: WalletStatus;
  @ApiProperty({ description: 'Số tiền rút tối thiểu mỗi lần' }) minWithdrawAmount!: string;
  @ApiProperty({ description: 'Cam kết tối đa (ngày làm việc) kể từ khi duyệt' })
  maxBusinessDays!: number;
}

/** Một dòng sổ cái. `amount` DƯƠNG là vào ví, ÂM là ra. */
export class WalletEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: WALLET_ENTRY_KIND_VALUES }) kind!: WalletEntryKind;
  @ApiProperty({ description: 'Dương = vào ví, âm = ra khỏi ví' }) amount!: string;
  @ApiProperty({ description: 'Số dư khả dụng sau bút toán' }) balanceAfter!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() createdAt!: string;
}

export class WalletEntryPageDto {
  @ApiProperty({ type: [WalletEntryDto] }) items!: WalletEntryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() hasNext!: boolean;
}

export class WalletEntryQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/**
 * Yêu cầu rút tiền.
 *
 * `bankAccountId` bắt buộc: đích chuyển phải là một tài khoản ĐÃ LƯU của chính chủ ví, không
 * phải ba ô gõ tự do trong lúc rút. Gõ số tài khoản ngay tại bước chi tiền là chỗ dễ sai nhất,
 * và sai thì tiền đi mất chứ không báo lỗi.
 */
export class CreateWithdrawalDto {
  @ApiProperty({ description: 'Số tiền rút (VND string)', example: '200000' })
  @IsNumberString()
  amount!: string;

  @ApiProperty({ description: 'Tài khoản nhận — phải thuộc chính chủ ví' })
  @IsString()
  bankAccountId!: string;
}

/** Yêu cầu rút nhìn từ phía chủ ví. Số tài khoản ĐÃ CHE. */
export class WithdrawalRequestDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Mã XPW… — dùng khi hỏi hỗ trợ' }) code!: string;
  @ApiProperty() amount!: string;
  @ApiProperty({ enum: WITHDRAWAL_STATUS_VALUES }) status!: WithdrawalStatus;
  @ApiProperty() bankCode!: string;
  @ApiProperty({ description: 'Số tài khoản đã che — PII' }) accountNumberMasked!: string;
  @ApiProperty() accountName!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Hạn cam kết chuyển' })
  dueBy!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) paidAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) rejectReason!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Lệnh ĐÃ CHI rồi bị đảo (chuyển hụt / sai tài khoản) — tiền đã về lại số dư',
  })
  reversedAt!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Vì sao chuyển không thành công',
  })
  reverseReason!: string | null;
  @ApiProperty() createdAt!: string;
}

// ── Bảng tổng hợp giao dịch theo KỲ (16/09/2026) ────────────────────────────

export const STATEMENT_DEFAULT_LIMIT = 20;
export const STATEMENT_MAX_LIMIT = 100;

/**
 * Một CHUYẾN trong bảng tổng hợp của gian hàng.
 *
 * Các con số tiền trả lời những câu khác nhau, và gộp chúng lại là sai bản chất (ADR 0032 điều 2–4
 * · ADR 0064 điều 1):
 *
 *  - `revenueAmount` (`B`) — DOANH THU của chuyến, tiền thuê gian hàng thu được.
 *  - `ownerCommissionAmount` (`H`) — hoa hồng lũy tiến XePrime giữ lại từ phần của chủ xe
 *    (ADR 0064 điều 3). CHỦ XE chịu, KHÔNG cộng vào tổng khách; 0 ở tuyến gói.
 *  - `taxAmount` (`T`) — thuế khấu trừ khỏi phần XePrime phải trả. CHỦ XE chịu, KHÔNG cộng vào
 *    tổng khách.
 *  - `balanceChange` — số ví THẬT SỰ nhúc nhích vì chuyến này (`hold_release` cộng vào, dòng đảo
 *    trừ ra). Bằng `D − T` ở đường đi bình thường (`D` đã là phần SAU `H` — ADR 0064 điều 5),
 *    nhưng đọc từ SỔ chứ không tính lại: một lần đảo bút toán phải hiện ra ở đây, không được che.
 *
 * Phần còn lại `payAtPickupAmount = B − D` khách trả TRỰC TIẾP chủ xe lúc nhận xe — XePrime
 * không thu hộ, nên nó không bao giờ đi qua ví. Trường này có mặt để bảng tự giải thích được vì
 * sao `balanceChange` nhỏ hơn `revenueAmount`; thiếu nó thì chủ xe đọc bảng và tưởng bị giữ tiền.
 *
 * KHÔNG có cột "phí sàn": phí sàn `S` do KHÁCH trả thêm (`FEE_BEARER.CUSTOMER`) và không trừ
 * vào doanh thu gian hàng, nên đặt nó vào bảng thu nhập của chủ xe là bịa ra một khoản khấu trừ
 * không tồn tại. Hoa hồng `H` thì NGƯỢC lại — chủ xe chịu thật, nên nó có cột riêng.
 */
export class WalletStatementTripDto {
  @ApiProperty() bookingId!: string;
  @ApiProperty({ description: 'Mã chuyến hiển thị — `XP…`' }) code!: string;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES, description: 'Hình thức thuê' })
  serviceType!: ServiceType;
  @ApiProperty({ description: 'Ngày đi — giờ nhận xe theo lịch đơn' }) pickupAt!: string;
  @ApiProperty({ description: 'Ngày về — giờ trả THỰC TẾ nếu có, không thì theo lịch' })
  returnAt!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Đơn giá một đơn vị thuê (ngày hoặc tháng). Theo ngày: CHỈ khi mọi ngày cùng một giá (đặc tả ' +
      '05 §7.1) — giá khác nhau theo ngày, hoặc snapshot không đủ dữ liệu ⇒ `null`; KHÔNG suy ' +
      'ngược `R / N` từ tổng.',
  })
  unitAmount!: string | null;
  @ApiPropertyOptional({
    enum: WALLET_STATEMENT_UNIT_VALUES,
    nullable: true,
    description: 'Đơn vị của `unitAmount`. `null` đi cùng `unitAmount = null`.',
  })
  unitKind!: WalletStatementUnit | null;

  @ApiProperty({
    description:
      'Doanh thu cho thuê xe `R = B − G` (VND string) — tiền thuê sau khuyến mãi của xe, KHÔNG gồm ' +
      'phí giao xe (`deliveryAmount`).',
  })
  revenueAmount!: string;
  @ApiProperty({
    description:
      'Phí dịch vụ – chủ xe `H` XePrime giữ lại — chủ xe chịu (ADR 0064 điều 3). Đọc từ bảng phí đã ' +
      'đóng băng (`ownerPayout`) khi có, không thì từ cột `bookings.owner_commission_amount` (ghi ' +
      'từ cùng snapshot); 0 ở tuyến gói và đơn trước luồng tiền v2.',
  })
  ownerCommissionAmount!: string;
  @ApiProperty({ description: 'Thuế khấu trừ `T` — chủ xe chịu' }) taxAmount!: string;
  @ApiProperty({
    description:
      '`R − D − H` — phần TIỀN THUÊ khách trả trực tiếp chủ xe lúc nhận xe, không qua ví. KHÔNG ' +
      'gồm phí giao xe (khoản đó ở `deliveryAmount`).',
  })
  payAtPickupAmount!: string;
  @ApiProperty({
    description:
      'Phí giao xe `G` — khách trả TẬN TAY chủ xe, chủ xe hưởng trọn, không chịu phí dịch vụ/thuế. ' +
      'Đọc từ `bookings.delivery_fee` (sửa được sau khi đơn ra đời). `0` khi không giao tận nơi.',
  })
  deliveryAmount!: string;
  @ApiProperty({
    description:
      'Thu nhập chủ xe của chuyến `R − H − T` (ADR 0068 điều 5). `ownerIncomeAmount − ' +
      'payAtPickupAmount = D − T` = phần cộng ví.',
  })
  ownerIncomeAmount!: string;
  @ApiProperty({ description: 'Ví nhúc nhích bao nhiêu vì chuyến này. Đọc từ sổ, âm được.' })
  balanceChange!: string;
  /**
   * Bảng cộng ví chủ xe của chuyến (ADR 0068 điều 5) — CÙNG hình dạng, CÙNG hàm dựng
   * (`ownerPayoutOf`) với hộp duyệt yêu cầu và chi tiết đơn, nên ba màn kể một câu chuyện. Các
   * trường phẳng ở trên đọc từ chính bảng này khi có; chúng ở lại cho app native.
   */
  @ApiPropertyOptional({
    type: OwnerPayoutDto,
    nullable: true,
    description:
      'Bảng cộng ví chủ xe dựng từ bảng phí ĐÃ ĐÓNG BĂNG của đơn (`ownerPayoutOf`). `null` với đơn ' +
      'gian hàng lập tay / đơn cũ không đi qua chính sách phí. Phí giao xe KHÔNG nằm trong bảng ' +
      '(xem `deliveryAmount`).',
  })
  ownerPayout!: OwnerPayoutDto | null;
}

/** Ba con số "gian hàng làm ăn thế nào" trong kỳ. */
export class WalletStatementStatsDto {
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      'Điểm trung bình các đánh giá NHẬN ĐƯỢC trong kỳ. `null` = kỳ này chưa ai đánh giá.',
  })
  ratingAvg!: number | null;
  @ApiProperty({ description: 'Số đánh giá nhận được trong kỳ' }) ratingCount!: number;
  @ApiProperty({ description: 'Số chuyến hoàn thành trong kỳ' }) completedTripCount!: number;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      'Tỉ lệ phản hồi yêu cầu thuê nhận trong kỳ. `null` = chưa đủ mẫu để nói — KHÔNG phải 0. ' +
      'Cùng phép phân loại với chỉ số công khai (ADR 0045 điều 2), chỉ khác cửa sổ.',
  })
  responseRatePercent!: number | null;

  @ApiProperty({
    description:
      'Số YÊU CẦU gian hàng phải quyết trong kỳ — mẫu số của hai tỉ lệ trên. Luôn hiện để ' +
      '"chưa đủ dữ liệu" là một câu kiểm chứng được.',
  })
  responseSampleCount!: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      'Tỉ lệ NHẬN VÀ GIỮ chuyến trong kỳ (ADR 0045 điều 2). Gian hàng đọc chính con số mà ' +
      'khách đang nhìn thấy trên trang công khai của họ.',
  })
  acceptKeepRatePercent!: number | null;
}

/**
 * Cộng dồn của KỲ — tính trên toàn bộ kỳ, không phải trên trang đang xem.
 *
 * `ownerIncome = revenueTotal − ownerCommissionTotal − taxTotal − subscriptionFeeTotal` (ADR 0064
 * điều 5 · ADR 0068 điều 5: `ownerNet = R − H − T` với `R` không gồm phí giao, rồi trừ phí gói): đây là thu nhập thật của gian
 * hàng, gồm CẢ phần khách trả tay lúc nhận xe. Nó cố ý KHÁC `balanceChangeTotal` (phần chảy qua
 * ví XePrime) — đánh đồng hai con số là điều khiến chủ xe tin rằng mình bị giữ mất tiền.
 */
export class WalletStatementTotalsDto {
  @ApiProperty({
    description:
      'Σ doanh thu cho thuê xe (tiền thuê `R`, không gồm phí giao) các chuyến hoàn thành trong kỳ',
  })
  revenueTotal!: string;
  @ApiProperty({
    description: 'Σ hoa hồng `H` XePrime giữ lại trong kỳ (số dương). 0 với tuyến gói.',
  })
  ownerCommissionTotal!: string;
  @ApiProperty({ description: 'Σ thuế đã khấu trừ hộ trong kỳ (số dương)' }) taxTotal!: string;
  @ApiProperty({
    description:
      'Σ phần TIỀN THUÊ khách trả trực tiếp khi nhận xe (`R − D − H`, không gồm phí giao)',
  })
  payAtPickupTotal!: string;
  @ApiProperty({ description: 'Σ phí giao xe `G` khách trả tận tay chủ xe trong kỳ' })
  deliveryTotal!: string;
  @ApiProperty({ description: 'Σ thay đổi số dư ví do các chuyến của kỳ' })
  balanceChangeTotal!: string;
  @ApiProperty({
    description:
      'Phí quản lý & vận hành gói nền tảng ĐÃ TRẢ trong kỳ (số dương). 0 với tuyến hoa hồng.',
  })
  subscriptionFeeTotal!: string;
  @ApiProperty({
    description:
      'Thu nhập chủ gian hàng = doanh thu cho thuê xe − phí dịch vụ chủ xe − thuế − phí gói',
  })
  ownerIncome!: string;
}

/**
 * Bảng tổng hợp giao dịch của gian hàng trong MỘT kỳ `YYYY-MM` (giờ Việt Nam).
 *
 * Trang các dòng chuyến ở SERVER (cùng khuôn `WalletEntryPageDto`): một gian hàng 40 xe chạy
 * vài trăm chuyến mỗi tháng, và `totals` phải là số của CẢ KỲ chứ không phải của trang đang xem
 * — một bảng có phân trang mà tổng chạy theo trang là một bảng nói dối.
 */
export class WalletStatementDto {
  @ApiProperty({ example: '2026-10' }) periodKey!: string;
  @ApiProperty({ type: WalletStatementStatsDto }) stats!: WalletStatementStatsDto;
  @ApiProperty({ type: WalletStatementTotalsDto }) totals!: WalletStatementTotalsDto;
  @ApiProperty({ type: [WalletStatementTripDto] }) items!: WalletStatementTripDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() hasNext!: boolean;
}

export class WalletStatementQueryDto {
  @ApiPropertyOptional({
    example: '2026-10',
    description: 'Kỳ `YYYY-MM` theo giờ Việt Nam. Bỏ trống = kỳ hiện tại.',
  })
  @IsOptional()
  @Matches(TAX_PERIOD_KEY_PATTERN, { message: 'Kỳ phải có dạng YYYY-MM' })
  period?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: STATEMENT_MAX_LIMIT,
    default: STATEMENT_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(STATEMENT_MAX_LIMIT)
  limit?: number;
}
