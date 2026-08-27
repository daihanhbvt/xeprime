import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { API_ERROR_CODE, SESSION_COOKIE_NAME_DEFAULT } from '@xeprime/types';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ApiErrorDto, PaginationMetaDto } from './common/dto/api-response.dto';
import { API_DESCRIPTION } from './openapi/api-description';
import { API_TAGS } from './openapi/api-tags';
import { enhanceOpenApiDocument } from './openapi/enhance-document';
import { collectRouteAccess } from './openapi/route-access';

/**
 * Tách khỏi `main.ts` để `openapi.ts` dựng được đúng app này mà không mở cổng —
 * spec sinh ra luôn khớp app đang chạy (ADR 0007).
 */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const isProduction = config.getOrThrow<string>('NODE_ENV') === 'production';

  app.useLogger(app.get(Logger));

  /*
   * Sau reverse proxy, IP thật của client chỉ còn nằm trong `X-Forwarded-For` — và Express chỉ
   * đọc header đó khi được bảo tin bao nhiêu lớp proxy. Không đặt: `req.ip` là IP container
   * Caddy cho MỌI request, nên @nestjs/throttler và các giới hạn theo IP (gửi OTP, thử mật
   * khẩu) đếm cả hệ thống như một người dùng duy nhất.
   *
   * Số lớp lấy từ env chứ không suy từ `NODE_ENV`: "có proxy hay không" là chuyện của TRIỂN
   * KHAI, không phải của chế độ build — dev sau ngrok thì cần bật, còn production chạy trần
   * (nếu có ngày đó) mà bật là cho phép ai cũng tự khai IP của mình.
   */
  const trustProxyHops = config.getOrThrow<number>('TRUST_PROXY_HOPS');
  if (trustProxyHops > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // CSP mặc định của helmet bật `upgrade-insecure-requests`: trình duyệt nâng MỌI
          // request con lên `https://`. Ngoài production API chạy HTTP trần, nên asset của
          // Swagger UI chết với ERR_SSL_PROTOCOL_ERROR.
          //
          // Bẫy ở chỗ nó chỉ lộ ra khi mở bằng IP LAN: `localhost` được trình duyệt xếp vào
          // "potentially trustworthy origin" và miễn nâng cấp, nên máy dev không bao giờ thấy.
          // Production đứng sau TLS thì directive này có ích — chỉ bỏ khi chưa có HTTPS.
          ...(isProduction ? {} : { 'upgrade-insecure-requests': null }),
        },
      },
    }),
  );
  app.use(cookieParser());

  // Cookie chỉ gửi kèm khi credentials được cho phép, và CORS credentials không đi cùng
  // origin '*' — nên danh sách origin phải là danh sách thật (ADR 0002).
  app.enableCors({
    origin: config.getOrThrow<string[]>('CORS_ORIGINS'),
    credentials: true,
  });

  app.useGlobalPipes(createValidationPipe());

  app.useGlobalFilters(new AllExceptionsFilter(isProduction));

  return app;
}

/**
 * Pipe validate TOÀN CỤC — tách thành hàm để test dựng được đúng cấu hình này.
 *
 * Chép lại cấu hình trong test là cách test báo xanh cho một luật mà production không còn dùng.
 * Chuyện đó đã xảy ra thật: `forbidNonWhitelisted` ở đây là lý do `GET /auth/social/:provider/callback`
 * KHÔNG được gắn DTO vào `@Query()` — pipe toàn cục luôn chạy, `@UsePipes` ở method chỉ THÊM chứ
 * không thay thế, nên mọi tham số mà Google tự gắn (`iss`, `scope`, `authuser`, `prompt`) đều
 * thành 400. Test khoá điều đó phải dùng chính hàm này, không phải một bản sao.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
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
  });
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('XePrime API')
    .setDescription(API_DESCRIPTION)
    .setVersion('0.1.0')
    // Spec là artifact tĩnh (sinh lúc build, không theo deployment) nên dùng tên MẶC ĐỊNH dùng
    // chung — không gõ lại literal. Deployment đổi `SESSION_COOKIE_NAME` thì cookie thật đổi
    // theo env; spec vẫn mô tả cơ chế "httpOnly session cookie".
    .addCookieAuth(SESSION_COOKIE_NAME_DEFAULT, {
      type: 'apiKey',
      in: 'cookie',
      name: SESSION_COOKIE_NAME_DEFAULT,
      description:
        'Cookie phiên do `POST /auth/login`, `POST /auth/register`, `POST /auth/phone/login` ' +
        'hoặc callback OAuth (`GET /auth/social/{provider}/callback`) phát. httpOnly — ' +
        'JavaScript KHÔNG đọc được, trình duyệt tự đính kèm. Gọi từ máy khác origin thì cần ' +
        '`credentials: "include"`.',
    })
    .build();

  const document = SwaggerModule.createDocument(app, builder, {
    // Các DTO này không xuất hiện làm kiểu trả về trực tiếp của controller nào, nên
    // Swagger không tự thấy — khai báo tay để type FE sinh ra có đủ.
    extraModels: [ApiErrorDto, PaginationMetaDto],
  });

  // Tag khai báo tập trung ở `openapi/api-tags.ts` — DocumentBuilder chỉ nhận từng tag một và
  // đặt trước khi quét controller, gán thẳng ở đây giữ đúng thứ tự nhóm đã thiết kế.
  document.tags = API_TAGS.map((tag) => ({ name: tag.name, description: tag.description }));

  // Security requirement, nhánh lỗi và lớp bọc `{ data }` suy từ metadata guard — xem
  // `openapi/enhance-document.ts`.
  const result = enhanceOpenApiDocument(document, collectRouteAccess(app));
  if (result.unmatchedOperationIds.length > 0) {
    throw new Error(
      'OpenAPI: không tra được điều kiện truy cập cho operation sau (quy ước operationId của ' +
        `@nestjs/swagger đã đổi?): ${result.unmatchedOperationIds.join(', ')}`,
    );
  }

  return document;
}
