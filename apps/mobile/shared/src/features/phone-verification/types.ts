import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

export type SendOtpInput = Schemas['SendOtpDto'];
export type SendOtpResult = Schemas['SendOtpResultDto'];
export type VerifyOtpInput = Schemas['VerifyOtpDto'];
export type VerifyOtpResult = Schemas['VerifyOtpResultDto'];
