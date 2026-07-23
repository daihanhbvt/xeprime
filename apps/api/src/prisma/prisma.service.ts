import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@xeprime/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Prisma 7 bắt buộc truyền driver adapter vào PrismaClient (ADR 0001). Adapter dựng từ
 * DATABASE_URL đã được env schema (zod) validate, nên tới đây chắc chắn có giá trị.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    super({ adapter: new PrismaPg({ connectionString: config.getOrThrow<string>('DATABASE_URL') }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Đã kết nối PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
