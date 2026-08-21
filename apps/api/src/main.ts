import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { buildOpenApiDocument, createApp } from './bootstrap';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>('API_PORT');

  // Swagger UI chỉ bật ngoài production: nó phơi toàn bộ bề mặt API.
  const docsEnabled = config.getOrThrow<string>('NODE_ENV') !== 'production';
  if (docsEnabled) {
    SwaggerModule.setup('docs', app, buildOpenApiDocument(app), {
      customSiteTitle: 'XePrime API',
      // Spec thô cho tooling (Postman/Insomnia/Scalar import thẳng từ URL này).
      jsonDocumentUrl: 'docs-json',
      swaggerOptions: {
        // Với ~50 nhóm thì mở sẵn hết là một bức tường chữ — thu gọn + có ô lọc dễ tìm hơn.
        docExpansion: 'none',
        filter: true,
        // Auth là session cookie (ADR 0002): trình duyệt tự đính kèm, nhưng "Try it out" chỉ
        // gửi cookie khi bật cờ này. Không bật thì mọi lần thử đều trả 401.
        withCredentials: true,
        persistAuthorization: true,
        displayRequestDuration: true,
        // KHÔNG đặt `tagsSorter`: mặc định giữ đúng thứ tự nhóm đã thiết kế ở
        // `openapi/api-tags.ts`, còn sort alpha sẽ trộn nhóm public lẫn nội bộ nền tảng.
      },
    });
  }

  app.enableShutdownHooks();
  await app.listen(port);

  console.log(`XePrime API: http://localhost:${port}`);
  console.log(
    docsEnabled
      ? `Swagger:     http://localhost:${port}/docs (spec: /docs-json)`
      : 'Swagger:     tắt ở production',
  );
}

void bootstrap();
