/**
 * Shim re-export — bản gốc sống ở `@xeprime/domain` vì app native cũng dựng đúng hai liên kết
 * này. Giữ đường import `@/lib/contact` cho code web đã có.
 */
export { TEL_SCHEME, ZALO_PROFILE_BASE_URL, telHref, zaloHref } from '@xeprime/domain';
