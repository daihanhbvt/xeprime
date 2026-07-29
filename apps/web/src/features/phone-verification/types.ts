import type { components } from '@xeprime/types';

/** Shape OTP lấy từ contract OpenAPI (ADR 0007) — không viết tay lại DTO. */
type Schemas = components['schemas'];

export type SendOtpInput = Schemas['SendOtpDto'];
export type SendOtpResult = Schemas['SendOtpResultDto'];
export type VerifyOtpInput = Schemas['VerifyOtpDto'];
export type VerifyOtpResult = Schemas['VerifyOtpResultDto'];
