/**
 * Query key của TanStack Query — đã chuyển sang `@xeprime/api-client`.
 *
 * Giữ lại một dòng re-export ở đúng đường dẫn cũ để 67 chỗ `import { queryKeys } from
 * '@/services/query-keys'` không phải sửa (`docs/mobile-readiness-audit.md` §14.1 bước 2).
 * Key phải dùng chung với app native: hai app cùng gọi một endpoint mà đặt key khác nhau thì
 * `invalidateQueries` sau một lần ghi sẽ chỉ làm mới một nửa.
 */
export { queryKeys } from '@xeprime/api-client';
