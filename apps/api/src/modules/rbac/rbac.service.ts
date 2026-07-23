import { Injectable } from '@nestjs/common';
import {
  DEFAULT_PLATFORM_ROLE_PERMISSIONS,
  DEFAULT_TENANT_ROLE_PERMISSIONS,
  SCOPE,
  type Permission,
  type PlatformRole,
  type TenantRole,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Nguồn quyền lúc chạy.
 *
 * ADR 0002: đọc từ DB mỗi request, KHÔNG cache vào token. Đổi role hoặc thu hồi quyền có
 * hiệu lực ở request kế tiếp.
 *
 * Bảng `DEFAULT_*_ROLE_PERMISSIONS` trong @xeprime/types chỉ dùng để seed và làm fallback
 * khi role hệ thống chưa có bản ghi trong DB — không phải nguồn quyết định.
 */
@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async permissionsForTenantMember(
    roleKey: TenantRole,
    customRoleId: string | null,
    tenantId: string,
  ): Promise<readonly Permission[]> {
    // Custom role của tenant thắng role hệ thống, nếu chủ shop đã tạo.
    // Lọc kèm tenantId: membership trỏ sang role của tenant khác là dữ liệu hỏng, và
    // im lặng cấp quyền theo role đó sẽ là một lỗ chéo tenant.
    if (customRoleId) {
      const ownsRole = await this.prisma.role.findFirst({
        where: { id: customRoleId, tenantId, scope: SCOPE.TENANT },
        select: { id: true },
      });
      if (ownsRole) {
        const keys = await this.permissionKeysOfRole(customRoleId);
        if (keys.length > 0) return keys;
      }
    }

    const systemRole = await this.prisma.role.findFirst({
      where: { scope: SCOPE.TENANT, key: roleKey, tenantId: null },
      select: { id: true },
    });

    if (systemRole) {
      const keys = await this.permissionKeysOfRole(systemRole.id);
      if (keys.length > 0) return keys;
    }

    // Chưa seed role hệ thống. Trả mặc định để dev local không bị chặn hết — ở production
    // rơi vào nhánh này nghĩa là seed thiếu, không phải hành vi bình thường.
    return DEFAULT_TENANT_ROLE_PERMISSIONS[roleKey] ?? [];
  }

  async permissionsForPlatformMember(
    roleKey: PlatformRole,
    customRoleId: string | null,
  ): Promise<readonly Permission[]> {
    if (customRoleId) {
      const keys = await this.permissionKeysOfRole(customRoleId);
      if (keys.length > 0) return keys;
    }

    const systemRole = await this.prisma.role.findFirst({
      where: { scope: SCOPE.PLATFORM, key: roleKey, tenantId: null },
      select: { id: true },
    });

    if (systemRole) {
      const keys = await this.permissionKeysOfRole(systemRole.id);
      if (keys.length > 0) return keys;
    }

    return DEFAULT_PLATFORM_ROLE_PERMISSIONS[roleKey] ?? [];
  }

  private async permissionKeysOfRole(roleId: string): Promise<Permission[]> {
    const rows = await this.prisma.rolePermission.findMany({
      where: { roleId },
      select: { permission: { select: { key: true } } },
    });
    return rows.map((r) => r.permission.key as Permission);
  }
}
