import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

/**
 * Kiểu của feature `auth` — alias thẳng từ OpenAPI (ADR 0007), KHÔNG viết tay lại DTO.
 *
 * Đây là feature ĐẦU TIÊN chuyển vào package dùng chung, có chủ ý: nó là thứ app native cần
 * trước mọi thứ khác, và nó nhỏ. 38 feature còn lại chuyển từng cái một theo
 * `docs/mobile-readiness-audit.md` §14.1 bước 3–4 — không chuyển hàng loạt.
 */
export type CurrentUser = Schemas['MeDto'];
export type LoginInput = Schemas['LoginDto'];
export type RegisterInput = Schemas['RegisterDto'];
export type SetPasswordInput = Schemas['SetPasswordDto'];
export type ForgotPasswordInput = Schemas['ForgotPasswordDto'];
export type ResetPasswordInput = Schemas['ResetPasswordDto'];

/* ── Native (Bearer) — ADR 0017 ─────────────────────────────────────────────────────────── */

export type MobileLoginInput = Schemas['MobileLoginDto'];
export type MobileRefreshInput = Schemas['MobileRefreshDto'];
export type MobileLogoutInput = Schemas['MobileLogoutDto'];

/** Cặp token của một phiên native. `refreshToken` CHỈ được lưu ở Keychain/Keystore. */
export type MobileTokenPair = Schemas['MobileTokenPairDto'];

/** Kết quả đăng nhập native: cặp token + hồ sơ người dùng đã giải sẵn. */
export type MobileSession = Schemas['MobileSessionDto'];
