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
export * from './auth-provider';
export * from './cache';
export * from './locale';
export * from './catalog';
export * from './marketplace';
export * from './phone';
export * from './auth-identifier';
export * from './long-term';
export * from './plan-billing';
export * from './holds';
export * from './pricing';
export * from './shop-profile';
export * from './rbac';
export * from './notifications';
export * from './api';
export * from './province';
export * from './session';
export * from './upload';

/**
 * Type sinh từ OpenAPI (ADR 0007) — nguồn sự thật cho shape request/response.
 * FE lấy shape endpoint qua `components['schemas'][...]`, KHÔNG viết tay lại DTO.
 * Chạy `pnpm contract` để sinh lại sau khi đổi DTO backend.
 */
export type { components, paths } from './api.generated';
