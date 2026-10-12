import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PAYMENT_GATEWAY_PROVIDER_VALUES,
  PAYMENT_ORDER_APPLY_OUTCOME_VALUES,
  PAYMENT_ORDER_NOTE_LENGTH,
  PAYMENT_ORDER_QUEUE_VIEW_VALUES,
  PAYMENT_ORDER_REFUND_REFERENCE_LENGTH,
  PAYMENT_ORDER_REQUERY_OUTCOME_VALUES,
  PAYMENT_ORDER_RESULT_SOURCE_VALUES,
  PAYMENT_ORDER_REVIEW_REASON_VALUES,
  PAYMENT_ORDER_REVIEW_STATUS_VALUES,
  PAYMENT_ORDER_STATUS_VALUES,
  PAYMENT_ORDER_TARGET_VALUES,
} from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

export const PAYMENT_ORDER_DEFAULT_LIMIT = 20;
export const PAYMENT_ORDER_MAX_LIMIT = 100;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PlatformPaymentOrderListQueryDto {
  @ApiPropertyOptional({
    enum: PAYMENT_ORDER_QUEUE_VIEW_VALUES,
    description:
      'Bỏ trống = `review` (CẦN XỬ LÝ — việc của người trực). `resolved` = đã xử lý; `history` = mọi lượt',
  })
  @IsOptional()
  @IsIn(PAYMENT_ORDER_QUEUE_VIEW_VALUES)
  view?: string;

  @ApiPropertyOptional({ enum: PAYMENT_GATEWAY_PROVIDER_VALUES })
  @IsOptional()
  @IsIn(PAYMENT_GATEWAY_PROVIDER_VALUES)
  provider?: string;

  @ApiPropertyOptional({ enum: PAYMENT_ORDER_TARGET_VALUES })
  @IsOptional()
  @IsIn(PAYMENT_ORDER_TARGET_VALUES)
  target?: string;

  @ApiPropertyOptional({ enum: PAYMENT_ORDER_STATUS_VALUES })
  @IsOptional()
  @IsIn(PAYMENT_ORDER_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({
    description: 'Tìm theo mã đối soát (XPG/XPH), mã đơn gửi sang cổng, hoặc mã giao dịch của cổng',
  })
  @Transform(trim)
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

  @ApiPropertyOptional({
    default: PAYMENT_ORDER_DEFAULT_LIMIT,
    minimum: 1,
    maximum: PAYMENT_ORDER_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAYMENT_ORDER_MAX_LIMIT)
  limit?: number;
}

/**
 * Một dòng của hàng đợi cổng thanh toán. KHÔNG có payload thô — chỉ ở màn chi tiết (cùng luật với
 * hàng đợi tiền vào ngân hàng).
 */
export class PlatformPaymentOrderDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: PAYMENT_GATEWAY_PROVIDER_VALUES }) provider!: string;
  @ApiProperty({ enum: PAYMENT_ORDER_TARGET_VALUES }) targetType!: string;
  @ApiProperty() targetCode!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty({ description: 'Tên gian hàng / chủ xe sở hữu đích' }) tenantName!: string;
  @ApiProperty({ description: 'Số tiền đã gửi sang cổng — VND, chuỗi' }) amount!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Số tiền cổng báo đã thu — VND, chuỗi',
  })
  paidAmount!: string | null;
  @ApiProperty({ enum: PAYMENT_ORDER_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({ enum: PAYMENT_ORDER_APPLY_OUTCOME_VALUES, nullable: true, type: String })
  applyOutcome!: string | null;
  @ApiProperty({ enum: PAYMENT_ORDER_REVIEW_STATUS_VALUES }) reviewStatus!: string;
  @ApiPropertyOptional({ enum: PAYMENT_ORDER_REVIEW_REASON_VALUES, nullable: true, type: String })
  reviewReason!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) providerTxId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) providerPayMethod!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' }) paidAt!: string | null;
  @ApiPropertyOptional({ enum: PAYMENT_ORDER_RESULT_SOURCE_VALUES, nullable: true, type: String })
  resultSource!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' }) resultAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' }) appliedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) initiatedByName!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class PlatformPaymentOrderPageDto {
  @ApiProperty({ type: [PlatformPaymentOrderDto] }) data!: PlatformPaymentOrderDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** Tình trạng HIỆN TẠI của đích — để người trực thấy vì sao tiền không áp được. */
export class PaymentOrderTargetSnapshotDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Trạng thái hiện tại của hoá đơn / khoản giữ chỗ — null khi đích không còn',
  })
  status!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tổng phải trả — VND' })
  amount!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Đã nhận — VND' })
  paidAmount!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Hạn nhận tiền — ISO' })
  expiresAt!: string | null;
}

/** Một dòng nhật ký kết quả của cổng (chỉ ghi thêm) — bằng chứng đầy đủ cho người trực. */
export class PlatformPaymentOrderEventDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: PAYMENT_ORDER_RESULT_SOURCE_VALUES }) source!: string;
  @ApiProperty({
    description:
      'Kết cục theo lời cổng — succeeded · pending · failed · cancelled · expired · flagged · not_found',
  })
  outcome!: string;
  @ApiProperty() resultCode!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'VND, chuỗi' })
  amount!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) providerTxId!: string | null;
  @ApiProperty({ description: 'Hệ thống đã làm gì với kết quả này (máy đọc được)' }) effect!: string;
  @ApiProperty({ type: Object, description: 'Payload của cổng, đã bỏ chữ ký' }) rawJson!: unknown;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class PlatformPaymentOrderDetailDto extends PlatformPaymentOrderDto {
  @ApiProperty({ description: 'Mã đơn đã gửi sang cổng (MoMo orderId · VNPAY vnp_TxnRef)' })
  providerOrderRef!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) providerResultCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) providerMessage!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Lỗi của lượt áp gần nhất' })
  applyError!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) reviewNote!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) reviewedByName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' }) reviewedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) refundReference!: string | null;
  @ApiProperty({ description: 'Hạn dùng lại liên kết — ISO' }) expiresAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  lastQueriedAt!: string | null;
  @ApiProperty({ type: PaymentOrderTargetSnapshotDto }) target!: PaymentOrderTargetSnapshotDto;
  @ApiPropertyOptional({
    type: Object,
    nullable: true,
    description: 'Kết quả gần nhất của cổng, đã bỏ chữ ký — BẰNG CHỨNG, chỉ ở màn chi tiết',
  })
  resultJson!: unknown;
  @ApiProperty({
    type: [PlatformPaymentOrderEventDto],
    description: 'Nhật ký mọi kết quả đã xác minh của cổng, mới nhất trước (tối đa 50)',
  })
  events!: PlatformPaymentOrderEventDto[];
  @ApiProperty({
    description:
      'Người trực ghi nhận tay được không — cổng đã thu, chưa áp, lượt đang ở hàng đợi (vd kết quả tới sau khi đã đóng)',
  })
  canApply!: boolean;
}

/** Kết quả "hỏi lại cổng" — để màn hình nói đúng điều đã xảy ra, không luôn báo thành công. */
export class PlatformPaymentOrderRequeryDto {
  @ApiProperty({ enum: PAYMENT_ORDER_REQUERY_OUTCOME_VALUES }) outcome!: string;
  @ApiProperty({ type: PlatformPaymentOrderDetailDto }) order!: PlatformPaymentOrderDetailDto;
}

/** Người trực tự tay ghi nhận một lượt đã thu vào đích — bắt buộc ghi lý do (audit). */
export class ApplyPaymentOrderDto {
  @ApiProperty({ description: 'Vì sao ghi nhận tay — đã đối chiếu gì với cổng' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(PAYMENT_ORDER_NOTE_LENGTH.MIN)
  @MaxLength(PAYMENT_ORDER_NOTE_LENGTH.MAX)
  note!: string;
}

/**
 * Đóng một lượt ở hàng đợi người xử lý — sau khi đã hoàn TAY cho khách (qua portal của cổng) hoặc
 * xác định khoản đó không cần làm gì thêm. Không có đường tự hoàn: chính sách hoàn qua cổng chưa
 * được quyết (ADR 0058).
 */
export class ResolvePaymentOrderDto {
  @ApiProperty({ description: 'Đã làm gì và vì sao — bắt buộc, để lượt đóng còn truy được' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(PAYMENT_ORDER_NOTE_LENGTH.MIN)
  @MaxLength(PAYMENT_ORDER_NOTE_LENGTH.MAX)
  note!: string;

  @ApiPropertyOptional({
    description:
      'Mã hoàn tiền phía cổng/ngân hàng nếu đã hoàn cho khách — bằng chứng chiều ra. Không có mã thì không ghi "đã hoàn".',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(PAYMENT_ORDER_REFUND_REFERENCE_LENGTH.MIN)
  @MaxLength(PAYMENT_ORDER_REFUND_REFERENCE_LENGTH.MAX)
  refundReference?: string;
}
