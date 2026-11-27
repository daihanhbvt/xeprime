import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SCHEDULED_CREDIT_STATUS_VALUES, WALLET_OWNER_TYPE_VALUES } from '@xeprime/types';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Một khoản CỘNG VÍ HẸN GIỜ (biên bản họp 19/11/2026 — tiền hoàn khi khách huỷ). */
export class ScheduledCreditDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: WALLET_OWNER_TYPE_VALUES }) ownerType!: string;
  @ApiProperty() ownerId!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) ownerName!: string | null;
  @ApiProperty({ description: 'Loại bút toán sẽ ghi (hold_refund, hold_forfeit…)' }) kind!: string;
  @ApiProperty({ description: 'VND (chuỗi - ADR 0007)' }) amount!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) holdId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) holdRefundId!: string | null;
  @ApiProperty({ enum: SCHEDULED_CREDIT_STATUS_VALUES }) status!: string;
  @ApiProperty({ description: 'ISO - lúc vòng quét cộng vào ví' }) releaseAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) frozenAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) freezeNote!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() createdAt!: string;
}

/** Tạm giữ một khoản — bắt buộc ghi lý do (tranh chấp gì, ai báo). */
export class FreezeScheduledCreditDto {
  @ApiProperty({ description: 'Lý do tạm giữ - vào audit' })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  note!: string;
}
