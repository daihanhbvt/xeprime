import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  SUPPORT_CASE_CATEGORY_VALUES,
  SUPPORT_CASE_EVENT_KIND_VALUES,
  SUPPORT_CASE_PRIORITY_VALUES,
  SUPPORT_CASE_STATUS_VALUES,
  SUPPORT_PARTY_VALUES,
  TRIP_VERDICT_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

export const SUPPORT_DEFAULT_LIMIT = 20;
export const SUPPORT_MAX_LIMIT = 100;

export class OpenSupportCaseDto {
  @ApiProperty({ enum: SUPPORT_CASE_CATEGORY_VALUES })
  @IsIn(SUPPORT_CASE_CATEGORY_VALUES)
  category!: string;

  @ApiProperty({ example: 'Xe giao không đúng mô tả' })
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  subject!: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Đơn thuê liên quan - bắt buộc với `dispute` (tranh chấp phải gắn một chuyến)',
  })
  @IsOptional()
  @IsString()
  bookingId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Yêu cầu thuê liên quan' })
  @IsOptional()
  @IsString()
  bookingRequestId?: string | null;
}

export class PostSupportEventDto {
  @ApiProperty({ description: 'Nội dung tin nhắn' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @ApiPropertyOptional({
    description:
      'Ghi chú NỘI BỘ (chỉ nhân sự nền tảng thấy). Bị bỏ qua với người gửi không phải platform.',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  internal?: string;
}

export class ResolveSupportCaseDto {
  @ApiProperty({ description: 'Kết luận - người mở case đọc câu này' })
  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  resolution!: string;
}

export class TransitionSupportCaseDto {
  @ApiProperty({ enum: SUPPORT_CASE_STATUS_VALUES })
  @IsIn(SUPPORT_CASE_STATUS_VALUES)
  status!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class AssignSupportCaseDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Nhân sự nền tảng phụ trách; null = bỏ phân công',
  })
  @IsOptional()
  @IsString()
  assigneeUserId?: string | null;

  @ApiPropertyOptional({ enum: SUPPORT_CASE_PRIORITY_VALUES })
  @IsOptional()
  @IsIn(SUPPORT_CASE_PRIORITY_VALUES)
  priority?: string;
}

export class SupportCaseEventDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: SUPPORT_CASE_EVENT_KIND_VALUES }) kind!: string;
  @ApiProperty({ enum: SUPPORT_PARTY_VALUES }) actorScope!: string;
  @ApiProperty() actorName!: string;
  @ApiProperty({ description: 'public | internal' }) visibility!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) body!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) fromStatus!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) toStatus!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) attachmentName!: string | null;
  @ApiProperty() createdAt!: string;
}

export class SupportCaseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Mã người dùng đọc/nhắc qua điện thoại' }) code!: string;
  @ApiProperty({ enum: SUPPORT_CASE_CATEGORY_VALUES }) category!: string;
  @ApiProperty({ enum: SUPPORT_CASE_STATUS_VALUES }) status!: string;
  @ApiProperty({ enum: SUPPORT_CASE_PRIORITY_VALUES }) priority!: string;
  @ApiProperty() subject!: string;
  @ApiProperty() description!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) tenantId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) tenantName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingRequestId!: string | null;
  @ApiProperty({ enum: SUPPORT_PARTY_VALUES }) openedByScope!: string;
  /** `null` = case do HỆ THỐNG mở (worker — ADR 0066), không có người nào bấm nút. */
  @ApiPropertyOptional({ type: String, nullable: true }) openedByName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) assigneeName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) resolution!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) resolvedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) closedAt!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class SupportCaseDetailDto extends SupportCaseDto {
  @ApiProperty({ type: [SupportCaseEventDto], description: 'Dòng thời gian - append-only' })
  events!: SupportCaseEventDto[];
  @ApiProperty({
    enum: TRIP_VERDICT_VALUES,
    isArray: true,
    description:
      'Kết luận chuyến dùng được NGAY BÂY GIỜ (`tripVerdictsFor`, ADR 0094) - chỉ bề mặt nền tảng; ' +
      'rỗng khi case không cần kết luận chuyến hoặc đơn đã đi tiếp. Tranh chấp trên đơn chưa nhận xe cũng có (ADR 0095)',
  })
  tripVerdicts!: string[];
  @ApiProperty({
    description:
      'Case CHỈ khép được bằng kết luận chuyến (`tripVerdictRequired`): nút kết luận/đóng trần bị chặn. ' +
      '`false` với tranh chấp - kết luận chuyến là lựa chọn thêm (ADR 0095 điều 2)',
  })
  tripVerdictRequired!: boolean;
}

/** Tiền của MỘT kết luận chuyến nếu bấm ngay bây giờ (ADR 0095 điều 3) - cùng phép tính lượt thật. */
export class TripVerdictMoneyDto {
  @ApiProperty({ enum: TRIP_VERDICT_VALUES }) verdict!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Kết cục giữ chỗ (`BOOKING_HOLD_OUTCOME`). `null` = kết luận này chưa chốt tiền (xe đã giao - chốt khi ' +
      'chuyến kết thúc), hoặc đơn không có khoản giữ chỗ đã trả nào chờ chốt',
  })
  outcome!: string | null;
  @ApiProperty({
    description: 'Tiền của khách còn ở XePrime cho khoản này (giữ chỗ + chuyển thừa còn chờ)',
  })
  paidAmount!: string;
  @ApiProperty({ description: 'Hoàn khách (gồm khoản chuyển thừa còn chờ)' })
  customerAmount!: string;
  @ApiProperty({ description: 'Phần bảo hiểm trong khoản hoàn khách' })
  insuranceRefundAmount!: string;
  @ApiProperty({ description: 'Vào Ví điểm chủ xe' }) ownerAmount!: string;
  @ApiProperty({ description: 'Doanh thu XePrime' }) platformAmount!: string;
  @ApiProperty({ description: 'Phải trả hãng bảo hiểm' }) insurerAmount!: string;
  @ApiProperty({ description: 'Thuế khấu trừ (chỉ khi chuyến hoàn thành)' }) taxAmount!: string;
  @ApiProperty({
    description:
      'Đơn còn case giữ tiền KHÁC đang mở - kết luận vẫn chạy, tiền chờ người trực chốt tay',
  })
  deferred!: boolean;
}

export class TripVerdictPreviewDto {
  @ApiProperty({ type: [TripVerdictMoneyDto] }) items!: TripVerdictMoneyDto[];
  /**
   * Đơn ĐANG THUÊ (chủ xe đã bấm giao xe) và case là lời báo "Chưa nhận được xe" (ADR 0104 điều 3):
   * các kết luận huỷ / khách không đến sẽ GỠ biên bản giao xe và đảo nghĩa vụ thuế của chuyến trước.
   */
  @ApiProperty() revertsHandover!: boolean;
  /**
   * Chuyến đã có Giấy chứng nhận bảo hiểm phát hành (hoặc đang phát hành). Kết luận huỷ vẫn hoàn tiền
   * bảo hiểm cho khách; phí trả hãng của GCN đó do XePrime chịu cho tới khi có API huỷ với hãng
   * (ADR 0104 điều 4).
   */
  @ApiProperty() insuranceIssued!: boolean;
}

/** Nhân sự nền tảng kết luận CHUYẾN của một case xác minh bàn giao (ADR 0094). */
export class TripVerdictDto {
  @ApiProperty({ enum: TRIP_VERDICT_VALUES })
  @IsIn(TRIP_VERDICT_VALUES)
  verdict!: string;

  @ApiProperty({
    description: 'Đã xác minh thế nào (gọi ai, họ nói gì) - vào kết luận của case và nhật ký',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  note!: string;
}

export class SupportCasePageDto {
  @ApiProperty({ type: [SupportCaseDto] }) data!: SupportCaseDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class SupportCaseListQueryDto {
  @ApiPropertyOptional({ enum: SUPPORT_CASE_STATUS_VALUES, description: 'Bỏ trống = case còn MỞ' })
  @IsOptional()
  @IsIn(SUPPORT_CASE_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({ enum: SUPPORT_CASE_CATEGORY_VALUES })
  @IsOptional()
  @IsIn(SUPPORT_CASE_CATEGORY_VALUES)
  category?: string;

  @ApiPropertyOptional({ description: 'Tìm theo mã case / tiêu đề' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: SUPPORT_DEFAULT_LIMIT, minimum: 1, maximum: SUPPORT_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SUPPORT_MAX_LIMIT)
  limit?: number;
}
