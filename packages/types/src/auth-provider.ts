/**
 * Nhà cung cấp đăng nhập mạng xã hội — ADR 0019.
 *
 * Vì sao hằng số này phải NẰM CHUNG: giá trị ở đây đi thẳng vào `user_identities.provider`
 * (khoá `@@unique([provider, providerUserId])`), và cũng chính là đoạn đường dẫn mà web dựng
 * khi bấm nút — `GET /auth/social/{provider}`. Hai phía gõ tay hai chuỗi khác nhau là cùng một
 * người đăng nhập ở web và ở app thành HAI tài khoản, và không có lỗi nào để lần.
 *
 * Dạng NGẮN (`google`, không phải `google.com`) là dạng chốt. Bản chạy trên Firebase trước đây
 * ghi `sign_in_provider` tức `google.com`/`facebook.com`, lệch với chú thích trong
 * `schema.prisma` và với web — ADR 0019 chuẩn hoá về một dạng.
 */
export const AUTH_PROVIDER = {
  GOOGLE: 'google',
  FACEBOOK: 'facebook',
} as const;

export type AuthProvider = (typeof AUTH_PROVIDER)[keyof typeof AUTH_PROVIDER];

export const AUTH_PROVIDER_VALUES = Object.values(AUTH_PROVIDER) as AuthProvider[];

export function isAuthProvider(value: unknown): value is AuthProvider {
  return typeof value === 'string' && (AUTH_PROVIDER_VALUES as string[]).includes(value);
}

/**
 * Nhãn hiển thị. KHÔNG đi qua i18n: đây là tên thương hiệu, giống nhau ở mọi ngôn ngữ
 * (CLAUDE.md mục 5 — chỉ NHÃN nghiệp vụ mới dịch, tên riêng thì không).
 */
export const AUTH_PROVIDER_LABEL: Readonly<Record<AuthProvider, string>> = {
  [AUTH_PROVIDER.GOOGLE]: 'Google',
  [AUTH_PROVIDER.FACEBOOK]: 'Facebook',
};
