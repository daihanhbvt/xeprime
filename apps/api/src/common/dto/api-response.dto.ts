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

/*
 * Ba kết quả nhỏ lặp lại ở nhiều controller. Khai báo tập trung thay vì `schema: { properties:
 * { id: { type: 'string' } } }` inline: bản inline sinh ra schema vô danh, thiếu `required`, và
 * mỗi chỗ viết một kiểu — FE sinh type từ spec sẽ nhận về một đống shape ẩn danh trùng nhau.
 */

/** Thao tác chỉ cần báo "đã xong", không có dữ liệu trả về. */
export class OkResultDto {
  @ApiProperty({ example: true, description: 'Luôn `true` — thao tác đã thực hiện xong.' })
  ok!: boolean;
}

/** Thao tác chỉ trả lại định danh bản ghi vừa tác động. */
export class IdResultDto {
  @ApiProperty({ example: '01J8XK2M5N7P9Q1R3S5T7V9W1X', description: 'ID (ULID, 26 ký tự).' })
  id!: string;
}

/** Thao tác xoá hàng loạt — trả về số bản ghi thực sự bị xoá. */
export class DeletedCountDto {
  @ApiProperty({ example: 12, description: 'Số bản ghi đã xoá.' })
  deleted!: number;
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
