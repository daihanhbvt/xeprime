import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { API_ERROR_CODE } from '@xeprime/types';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ApiErrorDto, PaginationMetaDto } from './common/dto/api-response.dto';

/**
 * Tách khỏi `main.ts` để `openapi.ts` dựng được đúng app này mà không mở cổng —
 * spec sinh ra luôn khớp app đang chạy (ADR 0007).
 */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const isProduction = config.getOrThrow<string>('NODE_ENV') === 'production';

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.use(cookieParser());

  // Cookie chỉ gửi kèm khi credentials được cho phép, và CORS credentials không đi cùng
  // origin '*' — nên danh sách origin phải là danh sách thật (ADR 0002).
  app.enableCors({
    origin: config.getOrThrow<string[]>('CORS_ORIGINS'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      // Giữ nguyên convention lỗi. PHẢI throw một HttpException, không trả plain object —
      // trả object khiến exception filter không nhận ra và rơi vào INTERNAL_ERROR.
      exceptionFactory: (errors) =>
        new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: 'Dữ liệu gửi lên không hợp lệ',
          details: errors.map((e) => ({
            field: e.property,
            constraints: Object.values(e.constraints ?? {}),
          })),
        }),
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter(isProduction));

  return app;
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('XePrime API')
    .setDescription(
      'Convention: success `{ data, meta }`, error `{ error: { code, message, details } }`. ' +
        'Xác thực bằng httpOnly session cookie (ADR 0002) — không dùng Bearer token. ' +
        'Tiền trả về dạng string, thời gian ISO-8601 UTC (ADR 0007).',
    )
    .setVersion('0.1.0')
    .addCookieAuth('xp_session')
    .addTag('health')
    .addTag('auth')
    .addTag('users')
    .addTag('rbac')
    .addTag('tenants')
    .addTag('calendar')
    .addTag('vehicles')
    .addTag('bookings')
    .addTag('chat')
    .addTag('platform-admin')
    .build();

  return SwaggerModule.createDocument(app, builder, {
    // Các DTO này không xuất hiện làm kiểu trả về trực tiếp của controller nào, nên
    // Swagger không tự thấy — khai báo tay để type FE sinh ra có đủ.
    extraModels: [ApiErrorDto, PaginationMetaDto],
  });
}
