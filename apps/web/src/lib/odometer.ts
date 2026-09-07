/**
 * Re-export shim — phép phân loại KM còn lại sống ở `@xeprime/domain` để app native dùng chung
 * (Metro không đọc được `apps/web/src/lib`).
 */
export { remainingKm, type RemainingKm, type RemainingKmKind } from '@xeprime/domain';
