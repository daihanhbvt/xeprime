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
import { TtlCache } from '../../common/ttl-cache';

/**
 * Bảng `roles`/`role_permissions` sống 5 phút trong bộ nhớ.
 *
 * Đây KHÔNG phải cache quyền của người dùng — quyền của một người vẫn được suy lại từ đầu ở mỗi
 * request, đúng ADR 0002. Thứ được cache là ĐỊNH NGHĨA của vai trò: "role hệ thống `shop_staff`
 * gồm những permission nào". Hai thứ đó khác nhau ở chỗ quan trọng nhất: đổi vai của một người
 * (sửa `tenant_memberships`) có hiệu lực NGAY, vì bảng membership không nằm trong cache này.
 *
 * Vì sao đáng cache: mỗi request tenant-scoped tốn 2–3 lượt tra bảng role, mà nội dung của chúng
 * gần như bất biến (role hệ thống do seed ghi). Ở cao điểm đó là hàng trăm query mỗi giây để đọc
 * lại đúng một câu trả lời.
 *
 * Cái giá: sửa tay `role_permissions` trong DB thì chậm nhất 5 phút mới ăn. Khi có endpoint sửa
 * vai trò tuỳ biến, nó PHẢI gọi `invalidate()` SAU khi transaction đã commit (xem docblock của
 * `invalidate` — gọi trong transaction là xoá sớm, cache nạp lại đúng dữ liệu cũ chưa commit) —
 * đó là lý do phương thức đó tồn tại dù hiện chưa có ai gọi.
 */
const ROLE_CACHE_TTL_MS = 5 * 60_000;
/** Số vai trò trong hệ thống là hữu hạn và nhỏ; trần này chỉ để chặn rò bộ nhớ. */
const ROLE_CACHE_MAX_ENTRIES = 500;

/**
 * Nguồn quyền lúc chạy.
 *
 * ADR 0002: đọc từ DB mỗi request, KHÔNG cache vào token. Đổi role hoặc thu hồi quyền có
 * hiệu lực ở request kế tiếp (membership không cache — xem docblock cache ở trên).
 *
 * Bảng `DEFAULT_*_ROLE_PERMISSIONS` trong @xeprime/types chỉ dùng để seed và làm fallback
 * khi role hệ thống chưa có bản ghi trong DB — không phải nguồn quyết định.
 */
@Injectable()
export class RbacService {
  /** `id` của một role, tra theo scope+key (role hệ thống) hoặc theo quyền sở hữu của tenant. */
  private readonly roleIdCache = new TtlCache<string | null>({
    ttlMs: ROLE_CACHE_TTL_MS,
    maxEntries: ROLE_CACHE_MAX_ENTRIES,
  });

  /** Danh sách permission của một role, theo `roleId`. */
  private readonly rolePermissionsCache = new TtlCache<readonly Permission[]>({
    ttlMs: ROLE_CACHE_TTL_MS,
    maxEntries: ROLE_CACHE_MAX_ENTRIES,
  });

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
      const ownsRole = await this.tenantOwnsRole(customRoleId, tenantId);
      if (ownsRole) {
        const keys = await this.permissionKeysOfRole(customRoleId);
        if (keys.length > 0) return keys;
      }
    }

    const systemRoleId = await this.systemRoleId(SCOPE.TENANT, roleKey);
    if (systemRoleId) {
      const keys = await this.permissionKeysOfRole(systemRoleId);
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

    const systemRoleId = await this.systemRoleId(SCOPE.PLATFORM, roleKey);
    if (systemRoleId) {
      const keys = await this.permissionKeysOfRole(systemRoleId);
      if (keys.length > 0) return keys;
    }

    return DEFAULT_PLATFORM_ROLE_PERMISSIONS[roleKey] ?? [];
  }

  /**
   * Bỏ toàn bộ định nghĩa vai trò đã cache.
   *
   * Gọi khi `roles`/`role_permissions` bị GHI — và gọi SAU khi transaction đã commit, không phải
   * trong lúc nó còn đang chạy: xoá sớm thì request kế tiếp có thể nạp lại đúng dữ liệu cũ chưa
   * commit rồi cache tiếp trong 5 phút.
   */
  invalidate(): void {
    this.roleIdCache.clear();
    this.rolePermissionsCache.clear();
  }

  /** `id` của role hệ thống (không thuộc tenant nào) theo scope + key. */
  private async systemRoleId(scope: string, roleKey: string): Promise<string | null> {
    return this.roleIdCache.wrap(`sys:${scope}:${roleKey}`, async () => {
      const role = await this.prisma.role.findFirst({
        where: { scope, key: roleKey, tenantId: null },
        select: { id: true },
      });
      return role?.id ?? null;
    });
  }

  /** Role tuỳ biến này có đúng là của tenant đang xét không (chặn dùng chéo tenant). */
  private async tenantOwnsRole(roleId: string, tenantId: string): Promise<boolean> {
    const found = await this.roleIdCache.wrap(`own:${roleId}:${tenantId}`, async () => {
      const role = await this.prisma.role.findFirst({
        where: { id: roleId, tenantId, scope: SCOPE.TENANT },
        select: { id: true },
      });
      return role?.id ?? null;
    });
    return found !== null;
  }

  private async permissionKeysOfRole(roleId: string): Promise<readonly Permission[]> {
    return this.rolePermissionsCache.wrap(roleId, async () => {
      const rows = await this.prisma.rolePermission.findMany({
        where: { roleId },
        select: { permission: { select: { key: true } } },
      });
      // Đóng băng: mảng này được dùng chung giữa các request, một chỗ gọi lỡ tay `push` vào nó
      // là cấp thêm quyền cho mọi người dùng cùng vai trò cho tới khi hết TTL.
      return Object.freeze(rows.map((r) => r.permission.key as Permission));
    });
  }
}
