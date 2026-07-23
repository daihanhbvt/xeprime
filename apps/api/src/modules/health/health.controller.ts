import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { Public } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('health')
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
  @ApiOperation({ summary: 'Liveness + readiness (có ping PostgreSQL)' })
  check() {
    return this.health.check([() => this.db.pingCheck('database', this.prisma)]);
  }
}
