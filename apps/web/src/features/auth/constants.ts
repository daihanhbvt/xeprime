/**
 * Định nghĩa gốc nằm ở `@xeprime/types` (ADR 0019) — giá trị này đi thẳng vào
 * `user_identities.provider` ở backend và vào đường dẫn `GET /auth/social/{provider}`, nên web
 * và api không được phép mô tả nó bằng hai chuỗi khác nhau.
 *
 * Re-export để các chỗ gọi cũ không phải đổi import.
 */
export {
  AUTH_PROVIDER,
  AUTH_PROVIDER_LABEL,
  AUTH_PROVIDER_VALUES,
  type AuthProvider,
} from '@xeprime/types';
