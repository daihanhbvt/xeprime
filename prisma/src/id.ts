import { ulid } from 'ulid';

/**
 * Sinh ID cho mọi bảng — char(26) ULID (ADR 0001, database_design §2.3).
 *
 * Dùng ULID thay UUID vì nó sắp xếp theo thời gian: index trên khoá chính không bị phân
 * mảnh khi insert, và `ORDER BY id` xấp xỉ `ORDER BY created_at`.
 *
 * Ở file riêng chứ không nằm trong `index.ts`: `push-outbox.ts` cần nó, và `index.ts` lại
 * re-export `push-outbox` — import chéo qua `index` là một vòng phụ thuộc chỉ tình cờ chạy được
 * nhờ hoisting của CommonJS.
 */
export function newId(): string {
  return ulid();
}
