import { Controller, Get } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { Public } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { HealthCheckResultDto, HealthIndicatorDto } from './dto/health.dto';

@ApiTags('health')
// `HealthIndicatorDto` chỉ được trỏ tới qua `$ref` thô trong `additionalProperties`, Swagger
// không tự thấy nên phải khai báo tay, nếu không spec sinh ra sẽ có ref treo.
@ApiExtraModels(HealthIndicatorDto)
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Ping cả DB, không chỉ trả 200 cho có. Health check không chạm DB sẽ báo "khoẻ" trong
   * khi Postgres đã chết — vô dụng đúng lúc cần nhất.
   */
  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Liveness + readiness (có ping PostgreSQL)',
    description:
      'Khác mọi endpoint còn lại: response KHÔNG có lớp bọc `{ data }` — trả thẳng kết quả ' +
      'Terminus để uptime monitor đọc `status` mà không phải bóc lớp.',
  })
  @ApiOkResponse({ type: HealthCheckResultDto, description: 'Mọi indicator đều `up`' })
  @ApiServiceUnavailableResponse({
    type: HealthCheckResultDto,
    description: 'Có indicator `down` — chi tiết ở `error`. Ví dụ: mất kết nối PostgreSQL.',
  })
  check() {
    return this.health.check([() => this.db.pingCheck('database', this.prisma)]);
  }
}
