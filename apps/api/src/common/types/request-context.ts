import type { Request } from 'express';
import type { Permission, TenantRole, PlatformRole } from '@xeprime/types';

/**
 * Ngữ cảnh đã được guard xác thực, gắn vào `req`.
 *
 * CLAUDE.md mục 6, lằn ranh 1: `tenantId` ở đây LUÔN đến từ `tenant_memberships` trong DB,
 * không bao giờ từ body/query/header của client. Không có đường nào khác ghi vào đây.
 */
export interface AuthenticatedUser {
  readonly id: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly phoneVerified: boolean;
  /** ID phiên, để revoke được từng thiết bị (ADR 0002). */
  readonly sessionId: string;
}

export interface TenantContext {
  readonly tenantId: string;
  readonly tenantStatus: string;
  readonly roleKey: TenantRole;
  readonly permissions: readonly Permission[];
}

export interface PlatformContext {
  readonly roleKey: PlatformRole;
  readonly permissions: readonly Permission[];
}

export interface RequestContext extends Request {
  user?: AuthenticatedUser;
  tenant?: TenantContext;
  platform?: PlatformContext;
}
