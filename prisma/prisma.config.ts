import path from 'node:path';
import { existsSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

/**
 * Cấu hình Prisma CLI — bắt buộc từ Prisma 7 (ADR 0001).
 *
 * Prisma 7 bỏ `url` khỏi schema; migrate/generate đọc connection ở đây. Runtime PrismaClient
 * dùng driver adapter riêng (prisma/src/index.ts).
 *
 * Nạp `.env` gốc repo ngay tại đây để `prisma validate/generate/migrate` chạy được dù gọi
 * bằng cách nào. CLI đặt cwd = thư mục prisma/, nên `.env` ở `../.env`.
 */
const rootEnv = path.resolve(process.cwd(), '../.env');
loadEnv({ path: existsSync(rootEnv) ? rootEnv : path.resolve(process.cwd(), '.env') });

export default defineConfig({
  schema: 'schema.prisma',
  migrations: {
    path: 'migrations',
    seed: 'tsx ./src/seed.ts',
  },
  // Cần bật để dùng `extensions = [...]` trong datasource (btree_gist cho ADR 0006).
  experimental: {
    extensions: true,
  },
  datasource: {
    // Không dùng env() của @prisma/config vì nó ném lỗi khi biến vắng mặt; generate/validate
    // không cần URL nên để undefined là hợp lệ, chỉ migrate mới thật sự cần.
    url: process.env.DATABASE_URL,
  },
});
