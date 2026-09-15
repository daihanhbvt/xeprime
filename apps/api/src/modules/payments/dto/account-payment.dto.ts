import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  PAYMENT_KIND_VALUES,
  PAYMENT_METHOD_VALUES,
  PAYMENT_STATUS_VALUES,
  type PaymentKind,
  type PaymentMethod,
  type PaymentStatus,
} from '@xeprime/types';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

export const ACCOUNT_PAYMENT_DEFAULT_LIMIT = 20;
export const ACCOUNT_PAYMENT_MAX_LIMIT = 50;

export class AccountPaymentListQueryDto {
  @ApiPropertyOptional({
    enum: PAYMENT_KIND_VALUES,
    description: 'Bỏ trống = cả tiền thuê lẫn tiền cọc',
  })
  @IsOptional()
  @IsIn(PAYMENT_KIND_VALUES)
  kind?: PaymentKind;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: ACCOUNT_PAYMENT_MAX_LIMIT,
    default: ACCOUNT_PAYMENT_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ACCOUNT_PAYMENT_MAX_LIMIT)
  limit?: number;
}

/**
 * Một khoản tiền KHÁCH đã trả cho một chuyến, nhìn từ tài khoản của họ.
 *
 * ⚠️ Đây là bản ghi của GIAN HÀNG về tiền đã nhận (ADR 0013: chưa có cổng thanh toán, mọi khoản
 * là ghi sổ tay). Nó KHÔNG phải ví điểm và KHÔNG phải khoản giữ chỗ:
 *
 *   · `payments`      — tiền khách trả cho GIAN HÀNG của một chuyến (màn này).
 *   · `booking_holds` — tiền khách chuyển cho XEPRIME để giữ chỗ (`/trips/:id`).
 *   · `wallets`       — tiền XEPRIME NỢ khách (`/account/balance`).
 *
 * Ba thứ đó ở ba bảng, ba chủ nợ, ba màn hình. Gộp chúng lại là cách chắc chắn để một người
 * tưởng mình đã được hoàn tiền khi thật ra chưa.
 */
export class AccountPaymentDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Chuyến mà khoản này thuộc về' }) bookingId!: string;
  @ApiProperty() bookingCode!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty() vehicleName!: string;

  @ApiProperty() amount!: string;
  @ApiProperty({ example: 'VND' }) currency!: string;
  @ApiProperty({ enum: PAYMENT_KIND_VALUES, description: 'Tiền thuê hay tiền cọc' })
  kind!: PaymentKind;
  @ApiProperty({ enum: PAYMENT_METHOD_VALUES }) method!: PaymentMethod;
  @ApiProperty({ enum: PAYMENT_STATUS_VALUES }) status!: PaymentStatus;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Thời điểm gian hàng ghi nhận đã nhận tiền. `null` = còn đang xử lý.',
  })
  paidAt!: string | null;
  @ApiProperty() createdAt!: string;
}

/** Tổng đã trả theo từng loại — con số khách hỏi trước khi đọc danh sách. */
export class AccountPaymentTotalsDto {
  @ApiProperty({ description: 'Tổng đã trả (chỉ khoản `succeeded`)' }) paidTotal!: string;
  @ApiProperty({ description: 'Phần là tiền thuê' }) rentalTotal!: string;
  @ApiProperty({ description: 'Phần là tiền cọc — cọc trả gian hàng, sẽ hoàn khi trả xe' })
  depositTotal!: string;
  @ApiProperty({ description: 'Số chuyến có ít nhất một khoản đã trả' }) tripCount!: number;
}

/**
 * `meta` của màn này = phân trang + TỔNG.
 *
 * Vì sao `totals` nằm trong `meta` chứ không là khoá thứ ba cạnh `data`: phong bì thành công chỉ
 * có hai khoá `{ data, meta }` (CLAUDE.md mục 9), và `ApiSuccess<TData, TMeta>` ở
 * `@xeprime/types` chỉ mô tả được hai khoá đó. Trả thêm một khoá `totals` ngang hàng thì
 * `ResponseInterceptor` vẫn cho qua (nó chỉ kiểm có `data` hay không), nhưng client dùng
 * `apiGet` — trả về `result.data` — sẽ NHẬN ĐƯỢC MẢNG và `totals` bốc hơi trên đường về. Đó
 * đúng là lỗi `data.totals is undefined` ở `/account/payments`, và nó không bị test bắt vì test
 * gọi thẳng service, nơi phong bì chưa tồn tại.
 */
export class AccountPaymentMetaDto extends PaginationMetaDto {
  @ApiProperty({ type: AccountPaymentTotalsDto }) totals!: AccountPaymentTotalsDto;
}

export class AccountPaymentPageDto {
  @ApiProperty({ type: [AccountPaymentDto] }) data!: AccountPaymentDto[];
  @ApiProperty({ type: AccountPaymentMetaDto }) meta!: AccountPaymentMetaDto;
}
