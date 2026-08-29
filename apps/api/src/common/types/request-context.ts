import type { Request } from 'express';
import type {
  FeatureState,
  Permission,
  PlanFeature,
  PlatformRole,
  TenantRole,
} from '@xeprime/types';

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
  /**
   * Trục NĂNG LỰC theo gói (ADR 0027) — ĐỘC LẬP với `permissions` ở trên và luôn đủ 8 cờ.
   *
   * Đọc từ gói HIỆN HÀNH mỗi request, KHÔNG cache và KHÔNG đóng băng (ADR 0027 điều 5): gia hạn
   * xong phải mở lại ngay ở request kế tiếp. Đó cũng là lý do nó được giải cùng lượt truy vấn
   * membership của `TenantScopeGuard` thay vì gọi `BillingService` thêm một lần.
   */
  readonly features: Readonly<Record<PlanFeature, FeatureState>>;
  /** Cờ tenant ĐÃ TỪNG dùng — chỉ để phân biệt `read_only` với `hidden`, không cấp quyền. */
  readonly usedFeatures: readonly PlanFeature[];
  readonly planCode: string | null;
  /** ISO-8601 UTC — băng "hết hạn" ở web hiện ngày này. */
  readonly planEndsAt: string | null;
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
