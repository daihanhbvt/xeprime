import type { components } from '@xeprime/types';
import { apiDelete, apiGet, apiPost } from '@/lib/api-client';

type Schemas = components['schemas'];

export type CurrentUser = Schemas['MeDto'];
export type CurrentTenantSummary = Schemas['CurrentTenantSummaryDto'];

const LOGIN_PATH = '/auth/login';
const ME_PATH = '/auth/me';
const SESSION_PATH = '/auth/session';

/** 401 từ chính các đường này là câu trả lời, không phải dấu hiệu phiên vừa hết — xem SessionBoundary. */
export const AUTH_PATHS: readonly string[] = [LOGIN_PATH, ME_PATH, SESSION_PATH];

/** `identifier` là email HOẶC số điện thoại; backend trả về cookie phiên. */
export function loginWithPassword(identifier: string, password: string): Promise<CurrentUser> {
  return apiPost<CurrentUser>(LOGIN_PATH, { identifier, password });
}

export function fetchCurrentUser(): Promise<CurrentUser> {
  return apiGet<CurrentUser>(ME_PATH);
}

/** Phải gọi server: cookie httpOnly nên client không tự xoá được. */
export function destroySession(): Promise<void> {
  return apiDelete<void>(SESSION_PATH);
}
