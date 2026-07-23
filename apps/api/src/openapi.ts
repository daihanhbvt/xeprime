import 'reflect-metadata';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { buildOpenApiDocument } from './bootstrap';

/**
 * Sinh `packages/types/openapi.json` — bước 1 của pipeline hợp đồng type (ADR 0007).
 *
 * Dùng `preview: true`: Nest KHÔNG khởi tạo provider nào (không gọi constructor, không
 * onModuleInit). Nhờ vậy:
 *   - Không cần DB — PrismaService.$connect() không chạy.
 *   - Không phụ thuộc decorator metadata lúc runtime — lệnh này chạy qua tsx/esbuild,
 *     vốn không emit `design:paramtypes` như tsc; preview mode không resolve DI nên
 *     chuyện đó không còn quan trọng.
 * Swagger vẫn quét được metadata controller/route để dựng spec.
 */
async function generate(): Promise<void> {
  const app = await NestFactory.create(AppModule, { preview: true, logger: false });

  const document = buildOpenApiDocument(app);
  // Tính từ cwd (apps/api) chứ không dùng import.meta: tsconfig của Nest là CommonJS.
  const outPath = resolve(process.cwd(), '../../packages/types/openapi.json');

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  console.log(`OpenAPI spec đã ghi: ${outPath}`);
  console.log(`Chạy tiếp: pnpm types:gen`);

  await app.close();
}

generate().catch((err: unknown) => {
  console.error('Sinh OpenAPI thất bại:', err);
  process.exit(1);
});
