/**
 * Nguồn chốt duy nhất cho mọi status của XePrime — ADR 0005.
 *
 * DB lưu `String` (không dùng Postgres enum, xem ADR 0005 phần 3), nên TypeScript là lớp
 * duy nhất chặn được giá trị sai. Vì vậy:
 *
 *   ❌ if (booking.status === 'active')
 *   ✅ if (booking.status === BOOKING_STATUS.ACTIVE)
 *
 * Repository/service KHÔNG được để `string` rò ra ngoài tầng data — luôn khai báo kiểu
 * trả về bằng union type ở đây.
 */
export type { StatusColor, StatusMeta } from './meta';
export * from './tenant';
export * from './vehicle';
export * from './booking';
export * from './booking-request';
export * from './review';
export * from './misc';
export * from './onboarding';
