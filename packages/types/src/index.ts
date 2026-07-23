/**
 * `@xeprime/types` — hằng số và kiểu dùng chung giữa apps/api và apps/web.
 *
 * Chỉ chứa thứ KHÔNG suy ra được từ API (ADR 0007):
 *   - status union (ADR 0005)
 *   - role / permission key
 *   - convention response và mã lỗi
 *
 * Shape của từng endpoint KHÔNG viết tay ở đây — nó sinh ra ở `api.generated.ts` từ
 * OpenAPI spec của backend. Chạy `pnpm contract` để sinh lại.
 */
export * from './status/index';
export * from './rbac';
export * from './api';
