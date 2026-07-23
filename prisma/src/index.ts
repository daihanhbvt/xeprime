/**
 * Điểm import Prisma Client duy nhất của monorepo.
 *
 * Mọi package khác import từ `@xeprime/prisma`, không import thẳng
 * `../../prisma/generated/client` — để đổi vị trí generate hoặc bọc thêm middleware
 * chỉ phải sửa một chỗ.
 *
 * Chạy `pnpm db:generate` trước khi build lần đầu, nếu không thư mục generated chưa tồn tại.
 */
import { ulid } from 'ulid';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client';

export * from '../generated/client';
export { PrismaClient, Prisma } from '../generated/client';

/**
 * Tạo PrismaClient với driver adapter — bắt buộc từ Prisma 7 (ADR 0001).
 *
 * Prisma 7 không còn tự đọc `datasource.url` từ schema; PrismaClient phải nhận adapter.
 * Gom vào một factory để PrismaService, seed và test dùng chung đúng một cách cấu hình.
 *
 * @param connectionString Postgres URL. Mặc định lấy từ `process.env.DATABASE_URL`.
 */
export function createPrismaClient(connectionString?: string): PrismaClient {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL chưa được đặt — không tạo được PrismaClient.');
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

/**
 * Sinh ID cho mọi bảng — char(26) ULID (ADR 0001, database_design §2.3).
 *
 * Dùng ULID thay UUID vì nó sắp xếp theo thời gian: index trên khoá chính không bị phân
 * mảnh khi insert, và `ORDER BY id` xấp xỉ `ORDER BY created_at`.
 */
export function newId(): string {
  return ulid();
}
