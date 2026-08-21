import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Hình dạng kết quả health-check của `@nestjs/terminus`.
 *
 * Viết tay vì Terminus không kèm DTO có `@ApiProperty` — không có file này thì endpoint
 * `/health` là endpoint DUY NHẤT trong tài liệu không cho biết nó trả về cái gì.
 *
 * Lưu ý: response này KHÔNG có lớp bọc `{ data }` như phần còn lại của API. `ResponseInterceptor`
 * bỏ qua payload đã sẵn có khoá `error`, mà kết quả Terminus luôn có khoá đó — nên nó đi thẳng
 * ra dây. Đúng như vậy lại tiện: uptime monitor đọc được `status` mà không phải bóc lớp nào.
 */
export class HealthIndicatorDto {
  @ApiProperty({ enum: ['up', 'down'], example: 'up' })
  status!: 'up' | 'down';

  @ApiPropertyOptional({
    description: 'Thông tin bổ sung do indicator trả về, ví dụ lý do khi `down`.',
    example: 'connect ECONNREFUSED 127.0.0.1:5432',
  })
  message?: string;
}

export class HealthCheckResultDto {
  @ApiProperty({
    enum: ['ok', 'error', 'shutting_down'],
    example: 'ok',
    description: '`error` khi có indicator nào đó `down` — kèm HTTP 503.',
  })
  status!: 'ok' | 'error' | 'shutting_down';

  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/HealthIndicatorDto' },
    description: 'Các indicator đang `up`. Khoá là tên indicator, ví dụ `database`.',
    example: { database: { status: 'up' } },
  })
  info!: Record<string, HealthIndicatorDto>;

  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/HealthIndicatorDto' },
    description: 'Các indicator đang `down`. Rỗng khi mọi thứ khoẻ.',
    example: {},
  })
  error!: Record<string, HealthIndicatorDto>;

  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/HealthIndicatorDto' },
    description: 'Hợp của `info` và `error`.',
    example: { database: { status: 'up' } },
  })
  details!: Record<string, HealthIndicatorDto>;
}
