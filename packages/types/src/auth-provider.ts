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
 * Nhà cung cấp định danh CHỈ có ở app native — "Sign in with Apple" trên iOS.
 *
 * Tách khỏi `AUTH_PROVIDER` có chủ ý: `AUTH_PROVIDER` là các provider đi luồng OAuth redirect do
 * backend chủ trì (`GET /auth/social/:provider`, bảng `oauth_states` CHECK đúng hai giá trị đó) và
 * web dựng nút từ chính danh sách ấy. Apple đi đường khác hẳn: app lấy `identityToken` bằng API
 * native của iOS rồi gửi lên `POST /auth/mobile/apple` — không redirect, không state. Gộp chung là
 * mọc một nút Apple vô dụng trên web và một giá trị mà `oauth_states` từ chối.
 *
 * Giá trị đi thẳng vào `user_identities.provider` cùng khoá unique với hai provider kia.
 */
export const NATIVE_IDENTITY_PROVIDER = {
  APPLE: 'apple',
} as const;

export type NativeIdentityProvider =
  (typeof NATIVE_IDENTITY_PROVIDER)[keyof typeof NATIVE_IDENTITY_PROVIDER];

/** Mọi giá trị có thể nằm ở `user_identities.provider` từ một đăng nhập bên thứ ba. */
export type IdentityProvider = AuthProvider | NativeIdentityProvider;

/**
 * Giới hạn đầu vào của `POST /auth/mobile/apple` — DTO ở API và app sinh nonce đọc CÙNG bộ số.
 *
 * - `IDENTITY_TOKEN_MAX`: JWT của Apple ~1KB; trần rộng để không chặn nhầm, đủ hẹp để không
 *   nhận một body rác vài MB.
 * - `NONCE_MIN`/`NONCE_MAX`: nonce THÔ app sinh (hai UUID nối nhau = 72 ký tự) — dưới 16 ký tự
 *   là đoán được, nên bị từ chối.
 * - `NAME_PART_MAX`: họ hoặc tên Apple trả ở lần đăng nhập đầu.
 */
export const APPLE_SIGN_IN_LIMITS = {
  IDENTITY_TOKEN_MAX: 8192,
  NONCE_MIN: 16,
  NONCE_MAX: 128,
  NAME_PART_MAX: 60,
} as const;

/** Trần độ dài `users.display_name` — khớp `@db.VarChar(255)` ở `schema.prisma`. */
export const USER_DISPLAY_NAME_MAX_LENGTH = 255;

/**
 * Nhãn hiển thị. KHÔNG đi qua i18n: đây là tên thương hiệu, giống nhau ở mọi ngôn ngữ
 * (CLAUDE.md mục 5 — chỉ NHÃN nghiệp vụ mới dịch, tên riêng thì không).
 */
export const AUTH_PROVIDER_LABEL: Readonly<Record<AuthProvider, string>> = {
  [AUTH_PROVIDER.GOOGLE]: 'Google',
  [AUTH_PROVIDER.FACEBOOK]: 'Facebook',
};

export const AUTH_PROVIDER_BRAND_COLOR: Readonly<Record<AuthProvider, string>> = {
  [AUTH_PROVIDER.GOOGLE]: '#EA4335',
  [AUTH_PROVIDER.FACEBOOK]: '#1877F2',
};
