import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { buildOpenApiDocument, createApp } from './bootstrap';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>('API_PORT');

  // Swagger UI chỉ bật ngoài production: nó phơi toàn bộ bề mặt API.
  if (config.getOrThrow<string>('NODE_ENV') !== 'production') {
    SwaggerModule.setup('docs', app, buildOpenApiDocument(app));
  }

  app.enableShutdownHooks();
  await app.listen(port);

  console.log(`XePrime API: http://localhost:${port}`);
  console.log(`Swagger:     http://localhost:${port}/docs`);
}

void bootstrap();
