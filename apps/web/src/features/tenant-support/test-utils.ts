import {
  BILLING_MODE,
  BILLING_PHASE,
  PERMISSION,
  SHOP_ONBOARDING_STATE,
  SUPPORT_CAPABILITY,
  SUPPORT_MODE,
  SUPPORT_WORKSPACE,
  TENANT_ROLE,
  TENANT_STATUS,
  supportPermissionsFor,
  type SupportCapability,
} from '@xeprime/types';
import type { SupportContext } from './types';

/** Id phiên hợp lệ (26 ký tự Crockford base32) cho test. */
export const CONTEXT_A = 'A1B2C3D4E5F6G7H8J9K0M1N2P3';
export const CONTEXT_B = 'Z9Y8X7W6V5T4S3R2Q1P0N9M8K7';

/**
 * Phiên hỗ trợ giả — đúng hình dạng server trả (`SupportContextDto`). Mặc định: gian hàng Owner
 * Lite, chế độ hỗ trợ thao tác. `permissions` suy từ `capabilities` bằng CHÍNH bảng của types,
 * như server làm — test không tự gõ tay một bộ quyền lệch với luật thật.
 */
export function supportContextFixture(overrides: Partial<SupportContext> = {}): SupportContext {
  const workspace = overrides.workspace ?? SUPPORT_WORKSPACE.OWNER_LITE;
  const capabilities = (overrides.capabilities ?? [
    SUPPORT_CAPABILITY.VEHICLE_VIEW,
    SUPPORT_CAPABILITY.VEHICLE_INFO_EDIT,
    SUPPORT_CAPABILITY.VEHICLE_MEDIA_MANAGE,
    ...(workspace === SUPPORT_WORKSPACE.MANAGE
      ? [SUPPORT_CAPABILITY.MAINTENANCE_VIEW, SUPPORT_CAPABILITY.MAINTENANCE_MANAGE]
      : []),
  ]) as SupportCapability[];
  return {
    id: CONTEXT_A,
    mode: SUPPORT_MODE.ASSIST,
    workspace,
    reason: 'Chủ xe nhờ cập nhật ảnh theo ticket #42',
    capabilities,
    permissions: supportPermissionsFor(capabilities),
    createdAt: '2026-09-25T02:00:00.000Z',
    expiresAt: '2026-09-25T02:45:00.000Z',
    actor: { id: 'admin-1', displayName: 'Hỗ trợ viên Lan' },
    tenant: {
      id: 'tenant-1',
      name: 'Gian hàng Minh Đức',
      slug: 'gian-hang-minh-duc',
      roleKey: TENANT_ROLE.SHOP_VIEWER,
      logoUrl: null,
      serviceFeePercent: workspace === SUPPORT_WORKSPACE.MANAGE ? null : 10,
      publicVehicleCount: 1,
      status: TENANT_STATUS.ACTIVE,
      onboardingState:
        workspace === SUPPORT_WORKSPACE.MANAGE
          ? SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE
          : SHOP_ONBOARDING_STATE.COMMISSION,
      billingMode: workspace === SUPPORT_WORKSPACE.MANAGE ? BILLING_MODE.PACKAGE : BILLING_MODE.COMMISSION,
      billingPhase: BILLING_PHASE.CURRENT,
      planCode: null,
      planName: null,
      planEndsAt: null,
      graceEndsAt: null,
      features: [],
    },
    writeRestriction: null,
    ...overrides,
  } as SupportContext;
}

/** Quyền NỀN TẢNG của người đang đăng nhập — để test rằng chúng KHÔNG lọt vào phiên. */
export const ADMIN_PLATFORM_PERMISSIONS = [
  PERMISSION.PLATFORM_TENANT_SUPPORT_VIEW,
  PERMISSION.PLATFORM_TENANT_SUPPORT_ASSIST,
  PERMISSION.PLATFORM_TENANT_MANAGE,
  PERMISSION.VEHICLE_CREATE,
  PERMISSION.VEHICLE_DELETE,
];
