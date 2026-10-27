import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  ACCOUNT_TRANSACTION_KIND_VALUES,
  ACCOUNT_TRANSACTION_STATUS_VALUES,
  ACCOUNT_TRANSACTION_TITLE_VALUES,
  type AccountTransactionKind,
  type AccountTransactionStatus,
  type AccountTransactionTitle,
} from '@xeprime/types';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

export const ACCOUNT_TRANSACTION_DEFAULT_LIMIT = 20;
export const ACCOUNT_TRANSACTION_MAX_LIMIT = 50;

export class AccountTransactionListQueryDto {
  @ApiPropertyOptional({
    enum: ACCOUNT_TRANSACTION_STATUS_VALUES,
    description: 'Bỏ trống = mọi trạng thái',
  })
  @IsOptional()
  @IsIn(ACCOUNT_TRANSACTION_STATUS_VALUES)
  status?: AccountTransactionStatus;

  @ApiPropertyOptional({
    example: '2026-10-01',
    description: 'Từ NGÀY (giờ Việt Nam, `Asia/Ho_Chi_Minh`), tính cả ngày đó',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-10-31',
    description: 'Tới hết NGÀY (giờ Việt Nam), tính cả ngày đó',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: ACCOUNT_TRANSACTION_MAX_LIMIT,
    default: ACCOUNT_TRANSACTION_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ACCOUNT_TRANSACTION_MAX_LIMIT)
  limit?: number;
}

/**
 * Một lần tiền của khách dịch chuyển — nhìn TỪ PHÍA KHÁCH: số âm là tiền khách trả đi (giữ chỗ,
 * tiền thuê), số dương là tiền về khách (rút ví, hoàn tiền).
 */
export class AccountTransactionDto {
  @ApiProperty({ description: 'Id của bản ghi ở sổ gốc (duy nhất toàn danh sách)' }) id!: string;
  @ApiProperty({ enum: ACCOUNT_TRANSACTION_KIND_VALUES }) kind!: AccountTransactionKind;
  @ApiProperty({
    enum: ACCOUNT_TRANSACTION_TITLE_VALUES,
    description: 'Khoá tiêu đề — client dịch, không tự suy',
  })
  title!: AccountTransactionTitle;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Mã hiển thị: mã giữ chỗ `XPH…`, mã lệnh rút `XPW…` hoặc mã đơn',
  })
  code!: string | null;
  @ApiProperty({ example: '-150000', description: 'Có dấu, theo góc nhìn của khách' })
  amount!: string;
  @ApiProperty({ enum: ACCOUNT_TRANSACTION_STATUS_VALUES }) status!: AccountTransactionStatus;
  @ApiProperty() occurredAt!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Id mở `/trips/:id` (đơn, hoặc yêu cầu khi chưa có đơn)',
  })
  tripId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingCode!: string | null;
  @ApiProperty({ description: 'Lệnh rút còn chờ duyệt — khách tự huỷ được' })
  cancellable!: boolean;
}

export class AccountTransactionPageDto {
  @ApiProperty({ type: [AccountTransactionDto] }) data!: AccountTransactionDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}
