/**
 * Query key dùng CHUNG với web (`@xeprime/api-client`).
 *
 * Hai app gọi cùng một endpoint mà đặt key khác nhau thì mọi thứ vẫn chạy — cho tới lúc một
 * `invalidateQueries` sau khi ghi chỉ làm mới đúng một nửa số màn hình.
 */
export { queryKeys } from '@xeprime/api-client';
