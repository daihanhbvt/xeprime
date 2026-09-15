import { Prisma } from '../generated/client';

/**
 * "Lỗi này có phải là vi phạm unique constraint TÊN X không?" — một câu hỏi tưởng là một dòng,
 * và không phải một dòng ở Prisma 7.
 *
 * ## Vì sao hàm này tồn tại
 *
 * Cách viết hiển nhiên là đọc `error.meta.target`, thứ mà tài liệu Prisma mô tả và mọi ví dụ
 * trên mạng đều dùng:
 *
 * ```ts
 * if (err.code === 'P2002' && String(err.meta?.target).includes('my_constraint')) …
 * ```
 *
 * **Với driver adapter của Prisma 7 (`@prisma/adapter-pg` — bắt buộc theo ADR 0001), `meta.target`
 * KHÔNG tồn tại.** `meta` thật có hình dạng:
 *
 * ```json
 * { "modelName": "ApprovalTask",
 *   "driverAdapterError": { "cause": {
 *     "originalCode": "23505",
 *     "originalMessage": "duplicate key value violates unique constraint \"…_uq\"",
 *     "constraint": { "fields": ["target_type", "target_id"] } } } }
 * ```
 *
 * Điều nguy hiểm là kiểu hỏng: phép so trên không ném lỗi, nó chỉ luôn trả `false`. Nhánh phục
 * hồi im lặng ngừng chạy, và người dùng nhận 500 ở đúng tình huống mà constraint được dựng lên
 * để xử lý êm — bấm hai lần, mở hai tab, thử lại sau khi mạng chập. Không test đơn nào bắt được
 * nếu test đó không chạy thật hai request song song.
 *
 * Nên hàm này soi CẢ HAI chỗ, và sống ở `@xeprime/prisma` cạnh `createPrismaClient` — nơi các
 * điểm gãy của Prisma 7 đã được ghi lại — thay vì nằm trong một service ngẫu nhiên.
 *
 * @param constraint Tên unique index/constraint ở migration, ví dụ `approval_tasks_pending_target_uq`.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }

  // Đường CŨ (Prisma engine không dùng driver adapter) — giữ lại để không phụ thuộc một bản.
  const target = error.meta?.target;
  if (Array.isArray(target) ? target.some((t) => String(t) === constraint) : target === constraint) {
    return true;
  }

  /*
   * Đường của driver adapter: tên constraint chỉ xuất hiện trong câu lỗi gốc của Postgres. Soi
   * nguyên văn `meta` là cách bền nhất — hình dạng lồng nhau ở đây là chi tiết nội bộ của Prisma
   * và đã đổi một lần rồi, còn tên constraint thì do chính migration của chúng ta đặt.
   */
  return JSON.stringify(error.meta ?? {}).includes(constraint);
}
