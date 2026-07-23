import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Lớp bọc response — CLAUDE.md mục 9.
 *
 * ADR 0007: các class này PHẢI có `@ApiProperty`, nếu không OpenAPI spec sinh ra sẽ mất
 * lớp `{ data }` và type frontend sinh từ spec sẽ sai shape.
 */
export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 137 })
  total!: number;

  @ApiProperty({ example: true })
  hasNext!: boolean;
}

export class ApiErrorBodyDto {
  @ApiProperty({ example: 'BOOKING_SCHEDULE_CONFLICT' })
  code!: string;

  @ApiProperty({ example: 'Xe đã có đơn khác trong khoảng thời gian này' })
  message!: string;

  @ApiPropertyOptional({ description: 'Chi tiết bổ sung, ví dụ danh sách lỗi validate' })
  details?: unknown;
}

export class ApiErrorDto {
  @ApiProperty({ type: ApiErrorBodyDto })
  error!: ApiErrorBodyDto;
}
