import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BOOKING_HISTORY_KIND_VALUES,
  BOOKING_HISTORY_OUTCOME_VALUES,
  BOOKING_HISTORY_TAB_VALUES,
  LONG_TERM_PACKAGE_MONTHS_VALUES,
  SERVICE_TYPE_VALUES,
  type BookingHistoryOutcome,
  type BookingHistoryTab,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';
import { BranchIdQuery } from '../../../common/dto/branch-scope';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as BOOKING_HISTORY_DEFAULT_LIMIT, MAX_LIMIT as BOOKING_HISTORY_MAX_LIMIT };

export class BookingHistoryQueryDto {
  @ApiPropertyOptional({ enum: BOOKING_HISTORY_TAB_VALUES, default: 'all' })
  @IsOptional()
  @IsIn(BOOKING_HISTORY_TAB_VALUES)
  tab?: BookingHistoryTab;

  /** Ô "Trạng thái" — một kết cục; kết cục không thuộc ngăn đang xem cho ra trang rỗng. */
  @ApiPropertyOptional({ enum: BOOKING_HISTORY_OUTCOME_VALUES })
  @IsOptional()
  @IsIn(BOOKING_HISTORY_OUTCOME_VALUES)
  outcome?: BookingHistoryOutcome;

  @ApiPropertyOptional({ description: 'Tìm theo mã đơn / tên khách / SĐT / tên xe / biển số' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: SERVICE_TYPE_VALUES })
  @IsOptional()
  @IsIn(SERVICE_TYPE_VALUES)
  serviceType?: string;

  /** Chi nhánh của XE — áp cho cả trang lẫn số đếm các ngăn (ADR 0052). */
  @BranchIdQuery()
  branchId?: string;

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
 * MỘT dòng của "Đơn đã kết thúc" — đủ để nhận ra chuyến và mở chi tiết, không hơn. Tiền không ở
 * đây: chi tiết đơn / chi tiết yêu cầu mới là nơi đọc tiền (một bảng lịch sử nghìn dòng không gánh
 * phép tính công nợ của từng dòng).
 */
export class BookingHistoryItemDto {
  @ApiProperty({ enum: BOOKING_HISTORY_KIND_VALUES }) kind!: string;
  /** Id ĐƠN khi `kind = booking`, id YÊU CẦU khi `kind = request`. */
  @ApiProperty() id!: string;
  /** Mã đơn — yêu cầu chưa từng thành đơn thì không có mã. */
  @ApiPropertyOptional({ type: String, nullable: true }) code!: string | null;
  @ApiProperty({ enum: BOOKING_HISTORY_OUTCOME_VALUES }) outcome!: string;
  @ApiProperty({ description: 'ISO-8601 UTC - lúc chuyến kết thúc / yêu cầu đóng' })
  endedAt!: string;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES }) serviceType!: string;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    enum: LONG_TERM_PACKAGE_MONTHS_VALUES,
  })
  longTermPackageMonths!: number | null;
  @ApiProperty() vehicleId!: string;
  @ApiProperty() vehicleName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) vehiclePlate!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) vehicleImageUrl!: string | null;
  @ApiProperty() customerName!: string;
  /**
   * SĐT khách — cùng cổng `hostSeesCustomerContact` với hộp thư (ADR 0056): yêu cầu không thành
   * đơn của chủ xe tuyến hoa hồng KHÔNG mang số. Phiên hỗ trợ: interceptor che (ADR 0050 §11).
   */
  @ApiPropertyOptional({ type: String, nullable: true }) customerPhone!: string | null;
  /** Lịch đã chốt — yêu cầu dài hạn chưa từng được duyệt không có lịch (ADR 0011). */
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  pickupAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  returnAt!: string | null;
}

/** Số dòng của từng ngăn — cùng bộ lọc tìm kiếm / chi nhánh / dịch vụ với trang đang xem. */
export class BookingHistoryTabCountsDto {
  @ApiProperty() all!: number;
  @ApiProperty() completed!: number;
  @ApiProperty() cancelled!: number;
  /** `0` khi người xem không có quyền xem yêu cầu — ngăn đó không có gì cho họ. */
  @ApiProperty() notConverted!: number;
}

export class BookingHistoryMetaDto extends PaginationMetaDto {
  @ApiProperty({ type: BookingHistoryTabCountsDto }) tabCounts!: BookingHistoryTabCountsDto;
  /** Người xem có thấy ngăn "Không thành đơn" không (`booking_requests.view`). */
  @ApiProperty() includesRequests!: boolean;
}

export class BookingHistoryPageDto {
  @ApiProperty({ type: [BookingHistoryItemDto] }) data!: BookingHistoryItemDto[];
  @ApiProperty({ type: BookingHistoryMetaDto }) meta!: BookingHistoryMetaDto;
}
